"""Bước 17 – Chuẩn hóa số liệu mực nước trạm thủy văn KTTV (lộ trình 1.1, 1.2; phục vụ 5.1, 6.3).

Nguồn: Documents/Data_MucNuoc/ (người dùng thu thập 25/10/2026). Đánh giá từng nhóm file:
  VNDMS_Muc_Nuoc_2025_hourly_VGTB.xlsx         giờ, 9 trạm, cả năm 2025, m                       → DÙNG
  0.2.Muc nuoc gio QN-DN 2003-2019.xlsx        mùa lũ (9–12) 2003–2019, cm; ngoài lũ 4 obs/ngày,
                                               trong lũ theo giờ; mỗi sheet một kiểu (TCVN3, cột
                                               giờ/ngày đảo chỗ, ngày dd/mm lẫn kiểu ngày Excel)      → DÙNG
  7.1.Station/**/H lu * 02 11.dfs0             mùa lũ 2002–2011, bước 1–3 giờ, m (chuỗi MIKE)      → DÙNG (bù chỗ thiếu)
  H hourly Cau Lau 01 05.dfs0, H Hoi an 00-05.dfs0, Son Tra 1983-2009.dfs0,
  Hourly Wateravel of CamLe 1999-2008.xls      giờ liên tục                                         → DÙNG
  7.1.Station/** "76 02" (dfs0)                ngày 1976–2002 (gán 19h)                              → DÙNG, bảng ngày riêng
  *.txt, *.xlsx trùng nội dung dfs0, "1. X, H - VG-TB- 2010 - 2016" (chỉ 7h/19h, trùng 0.2,
  tiêu đề chép sai năm), thuyvan_PCTT Quang Nam.xls (trang HTML rỗng)                              → KHÔNG DÙNG

Chuẩn: một bảng dạng dài station_code, t_vn (giờ Việt Nam), t_utc, level_m, step_h, source, qc_flag, qc_note.
  Mã trạm theo src/services/pcttHydro.service.js (NONGSON, CAULAU…); số hiệu trạm KTTV 715xx.
  Mực nước theo cao độ trạm KTTV như trong nguồn (2003–2019 cm và 2025 m cùng mặt chuẩn – khớp mực nước kiệt).
Kiểm tra chất lượng (qc_flag, chỉ gắn cờ – KHÔNG xóa):
  ok · out_of_range (ngoài khoảng vật lý của trạm) · spike (gai đơn lẻ lệch cả hai giá trị kề) ·
  sentinel (giá trị điền sẵn lặp lại, vd. Nông Sơn 7,87 m năm 2025) · duplicate (trùng giờ, nguồn ưu tiên thấp hơn)
Trùng giờ giữa các nguồn: giữ theo thứ tự ưu tiên SOURCE_PRIORITY, ghi chênh lệch vào báo cáo.

Đầu ra: data/work/station_levels_hourly.parquet, data/work/station_levels_daily.parquet
        data/compute/station_levels_summary.json     (kiểm kê, đỉnh lũ từng mùa – không chứa chuỗi gốc)
        Documents/Data_MucNuoc_ChuanHoa/              CSV từng trạm + Excel báo cáo (không đưa lên git)
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/17_station_levels.py
Cần:    pandas, openpyxl, xlrd, mikeio, pyarrow
"""
import json
import re
import warnings
from datetime import datetime, timedelta

import mikeio
import numpy as np
import pandas as pd

from config import ROOT, WORK

warnings.filterwarnings("ignore", category=UserWarning)
SRC = ROOT.parent / "Documents" / "Data_MucNuoc"
EXPORT = ROOT.parent / "Documents" / "Data_MucNuoc_ChuanHoa"
COMPUTE = ROOT / "data" / "compute"
ST_DIR = SRC / "7.1.Station" / "Water Level"

# mã hệ thống, số hiệu KTTV, tên, sông, khoảng vật lý (m) – rộng hơn số liệu 1976–2025 cỡ 1–2 m
STATIONS = {
    "THANHMY":  (71526, "Thành Mỹ",  "Cái (Vu Gia)", 9.0, 30.0),
    "HOIKHACH": (71533, "Hội Khách", "Vu Gia",       6.0, 21.0),
    "AINGHIA":  (71527, "Ái Nghĩa",  "Vu Gia",       1.0, 12.0),
    "CAMLE":    (71521, "Cẩm Lệ",    "Cẩm Lệ",      -1.2, 5.0),
    "SONTRA":   (71545, "Sơn Trà (Tiên Sa)", "Biển", -1.2, 2.5),
    "HIEPDUC":  (71528, "Hiệp Đức",  "Thu Bồn",     10.0, 31.0),
    "NONGSON":  (71529, "Nông Sơn",  "Thu Bồn",      2.0, 21.0),
    "GIAOTHUY": (71530, "Giao Thủy", "Thu Bồn",     -1.0, 11.5),   # 2025: mùa kiệt xuống −0,57 m (liên tục, không phải lỗi)
    "CAULAU":   (71531, "Câu Lâu",   "Thu Bồn",     -1.5, 6.5),
    "HOIAN":    (71532, "Hội An",    "Thu Bồn",     -1.5, 4.0),
}
BY_ID = {v[0]: k for k, v in STATIONS.items()}
UPSTREAM = {"THANHMY", "HOIKHACH", "HIEPDUC", "NONGSON"}   # lũ lên nhanh – ngưỡng gai lớn hơn
TIDAL = {"SONTRA", "HOIAN", "CAULAU", "CAMLE"}              # dao động triều: chỉ xét gai khi giá trị kề cách 1 giờ
SOURCE_PRIORITY = ["VNDMS_2025", "PCTT_0.2_2003_2019", "MIKE_lu_2002_2011", "gio_lien_tuc"]


def station_of_header(h):
    """Nhận trạm từ tiêu đề cột – chịu được cả Unicode lẫn font TCVN3 (vd. 'N«ng S¬n'), có/không số hiệu."""
    s = str(h)
    m = re.search(r"715\d\d", s)
    if m and int(m.group()) in BY_ID:
        return BY_ID[int(m.group())]
    s = re.sub(r"[\d\s]+", " ", s).strip().lower()
    rules = [("giao", "GIAOTHUY"), ("ngh", "AINGHIA"), ("kh", "HOIKHACH"), ("nh m", "THANHMY"), ("m l", "CAMLE"),
             ("u l", "CAULAU"), ("ng s", "NONGSON"), (" tr", "SONTRA"), ("ti", "SONTRA")]
    for key, code in rules:
        if (key == "ti" and s.startswith("ti")) or (key != "ti" and key in s):
            return code
    if s.startswith("hi"):
        return "HIEPDUC"
    if s.endswith(" an"):
        return "HOIAN"
    return None


# ------------------------------------------------------------------ đọc từng nguồn → (code, t_vn, level_m, source)
def read_vndms():
    d = pd.read_excel(SRC / "VNDMS_Muc_Nuoc_2025_hourly_VGTB.xlsx")
    meta = d.groupby("station_id").first()
    out = pd.DataFrame({"station_code": d.station_id.map(BY_ID), "t_vn": pd.to_datetime(d.time),
                        "level_m": d.water_level_m.astype(float), "source": "VNDMS_2025"})
    info = {BY_ID[i]: {"lat": r.lat, "lon": r.lon, "alarm": [r.alarm_1_m, r.alarm_2_m, r.alarm_3_m],
                       "historic_m": r.historic_flood_m or None, "historic_year": int(r.historic_flood_year) or None}
            for i, r in meta.iterrows()}
    return out, info


def _parse_date(v):
    """Các cách hiểu có thể của ô ngày: kiểu ngày Excel (có thể bị Excel đảo ngày/tháng) hoặc chữ dd/mm/yyyy."""
    if isinstance(v, (datetime, pd.Timestamp)):
        c = [pd.Timestamp(v).normalize()]
        if v.day <= 12:
            try:
                c.append(pd.Timestamp(year=v.year, month=v.day, day=v.month))
            except ValueError:
                pass
        return c
    m = re.match(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})", str(v))
    if not m:
        return []
    dd, mm, yy = map(int, m.groups())
    c = []
    for a, b in ((dd, mm), (mm, dd)):
        try:
            c.append(pd.Timestamp(year=yy, month=b, day=a))
        except ValueError:
            pass
    return c


def _season_dates(v, year):
    """Ngày trong sheet mùa lũ `year`: chỉ tin ngày/tháng của ô (năm hay bị gõ sai, vd. 23/12/2026 trong sheet 2003);
    tháng 8–12 → `year`, tháng 1 → `year`+1 (giờ 24 ngày 31/12)."""
    out = []
    for c in _parse_date(v):
        y = year if c.month >= 8 else year + 1 if c.month == 1 else None
        if y:
            out.append(pd.Timestamp(year=y, month=c.month, day=c.day))
    return out


def read_pctt_0319():
    f = SRC / "0.2.Muc nuoc gio QN-DN 2003-2019.xlsx"
    rows, report = [], {}
    for sheet in pd.ExcelFile(f).sheet_names:
        raw = pd.read_excel(f, sheet_name=sheet, header=None, dtype=object)
        hdr = next(i for i in range(10) if sum(station_of_header(c) is not None for c in raw.iloc[i]) >= 6)
        heads = [str(c).strip().lower() for c in raw.iloc[hdr]]
        c_date = next(i for i, h in enumerate(heads[:3]) if h.startswith("ng"))
        c_hour = next(i for i, h in enumerate(heads[:3]) if h.startswith("gi"))
        cols = {i: station_of_header(c) for i, c in enumerate(raw.iloc[hdr]) if i > 1 and station_of_header(c)}
        year = int(sheet)
        # Dòng xếp theo thời gian → chọn cách hiểu ngày (giữ / đảo ngày-tháng) không lùi và gần ngày lớn nhất đã gặp.
        # Mốc khởi đầu = đầu mùa lũ: "01/09/2003" là 1/9, không phải 9/1. Dòng lùi > 1 ngày = khối bảng khác dán
        # cuối sheet (vd. sheet 2004 từ dòng 966: 4 cột không khớp tiêu đề) → bỏ.
        top, fixed, foreign = pd.Timestamp(year=year, month=8, day=25), 0, 0
        times = []
        for v, h in zip(raw.iloc[hdr + 1:, c_date], raw.iloc[hdr + 1:, c_hour]):
            cand = _season_dates(v, year)
            hh = pd.to_numeric(h, errors="coerce")
            if not cand or pd.isna(hh):
                times.append(pd.NaT)
                continue
            ok = [c for c in cand if c >= top - timedelta(days=1)]
            if not ok:
                foreign += 1
                times.append(pd.NaT)
                continue
            d = min(ok, key=lambda c: abs((c - top).days))
            fixed += d != cand[0]
            top = max(top, d)
            times.append(d + timedelta(hours=int(hh)))            # giờ 24 = 00h hôm sau
        t = pd.Series(times, index=raw.index[hdr + 1:])
        for i, code in cols.items():
            v = pd.to_numeric(raw.iloc[hdr + 1:, i], errors="coerce") / 100.0   # cm → m
            m = v.notna() & t.notna()
            rows.append(pd.DataFrame({"station_code": code, "t_vn": t[m].values, "level_m": v[m].values,
                                      "source": "PCTT_0.2_2003_2019"}))
        report[sheet] = {"header_row": hdr, "date_col": c_date, "hour_col": c_hour, "stations": sorted(set(cols.values())),
                         "dates_reinterpreted": int(fixed), "foreign_block_rows": int(foreign),
                         "rows_without_time": int(t.isna().sum())}
    return pd.concat(rows, ignore_index=True), report


def _dfs0(path, code, source, item=0):
    ds = mikeio.read(path)
    s = ds.to_dataframe().iloc[:, item]
    return pd.DataFrame({"station_code": code, "t_vn": s.index.tz_localize(None) if s.index.tz else s.index,
                         "level_m": s.values.astype(float), "source": source})


def read_mike_flood():
    out = []
    for f in sorted(ST_DIR.glob("*/H lu *.dfs0")):
        code = station_of_header(f.stem.replace("H lu ", "").replace(" 02 11", ""))
        out.append(_dfs0(f, code, "MIKE_lu_2002_2011"))
    return pd.concat(out, ignore_index=True)


def read_continuous():
    out = [
        _dfs0(ST_DIR / "H Cau Lau/H hourly Cau Lau 01 05/H hourly Cau Lau 01 05.dfs0", "CAULAU", "gio_lien_tuc"),
        _dfs0(ST_DIR / "H Hoi An/H hourly Hoi An 00 05/H Hoi an 00-05.dfs0", "HOIAN", "gio_lien_tuc"),
    ]
    st = mikeio.read(ST_DIR / "H SON TRA/Hourly water lever data at Son Tra 1983-2009/Son Tra hourly water lever data 1983-2009.dfs0")
    sd = st.to_dataframe()
    v = sd.iloc[:, 0].where(sd.iloc[:, 0].notna(), sd.iloc[:, 1])      # hai mục (máy 96, 101) – lấy mục 1, thiếu thì mục 2
    out.append(pd.DataFrame({"station_code": "SONTRA", "t_vn": sd.index, "level_m": v.values, "source": "gio_lien_tuc"}))
    f = SRC / "Hourly Wateravel of CamLe Station yr 1999-2008.xls"
    for sh in pd.ExcelFile(f).sheet_names:
        d = pd.read_excel(f, sheet_name=sh, header=None)
        t = pd.to_datetime(d[0], errors="coerce")
        v = pd.to_numeric(d[1], errors="coerce") / 100.0
        m = t.notna() & v.notna()
        out.append(pd.DataFrame({"station_code": "CAMLE", "t_vn": t[m].values, "level_m": v[m].values, "source": "gio_lien_tuc"}))
    return pd.concat(out, ignore_index=True), {"SONTRA_items": [i.name for i in st.items]}


def read_daily():
    out = []
    for f in sorted(ST_DIR.glob("**/*.dfs0")):
        name = re.sub(r"(?i)(h daily of|water ?level of|76 02|90 02)", "", f.stem).strip()
        code = station_of_header(name) or station_of_header(f.parent.name.replace("H ", ""))
        d = _dfs0(f, code, "MIKE_ngay_1976_2002")
        if d.t_vn.diff().median() < pd.Timedelta(hours=23):      # chỉ lấy chuỗi ngày (tên file không thống nhất)
            continue
        d["date"] = d.t_vn.dt.normalize()
        out.append(d.drop(columns="t_vn"))
    return pd.concat(out, ignore_index=True)


# ------------------------------------------------------------------ kiểm tra chất lượng
def qc(df):
    df = df.sort_values(["station_code", "t_vn", "source"]).reset_index(drop=True)
    df["qc_flag"], df["qc_note"] = "ok", ""
    lo = df.station_code.map({k: v[3] for k, v in STATIONS.items()})
    hi = df.station_code.map({k: v[4] for k, v in STATIONS.items()})
    bad = (df.level_m < lo) | (df.level_m > hi)
    df.loc[bad, ["qc_flag", "qc_note"]] = ["out_of_range", "ngoài khoảng vật lý của trạm"]

    # trùng giờ giữa các nguồn: giữ nguồn ưu tiên cao, ghi chênh lệch
    rank = df.source.map({s: i for i, s in enumerate(SOURCE_PRIORITY)})
    df = df.assign(_r=rank.where(df.qc_flag == "ok", rank + 10)).sort_values(["station_code", "t_vn", "_r"])
    first = df.groupby(["station_code", "t_vn"]).cumcount() == 0
    keep = df[first].set_index(["station_code", "t_vn"]).level_m
    dup = ~first
    diff = (df.loc[dup, "level_m"].values - keep.reindex(pd.MultiIndex.from_frame(df.loc[dup, ["station_code", "t_vn"]])).values)
    df.loc[dup, "qc_flag"] = "duplicate"
    df.loc[dup, "qc_note"] = [f"trùng giờ, lệch {d:+.2f} m so với nguồn giữ lại" for d in diff]
    conflicts = df.loc[dup].assign(diff=diff)
    df = df.drop(columns="_r").sort_values(["station_code", "t_vn"]).reset_index(drop=True)

    # Lệch > 0,3 m (vd. đúng ±1,00 m – gõ sai một chữ số ở một trong hai nguồn): giữ giá trị gần trung bình hai giá
    # trị hợp lệ kề (≤ 3 giờ) hơn, thay vì cứ theo thứ tự ưu tiên nguồn
    swapped = 0
    for code, g in df[df.qc_flag.isin(["ok", "duplicate"])].groupby("station_code"):
        kept = g[g.qc_flag == "ok"]
        big = g[(g.qc_flag == "duplicate") & (g.qc_note.str.extract(r"lệch ([+-]?\d+\.\d+)")[0].astype(float).abs() > 0.3)]
        if big.empty:
            continue
        kt, kv = kept.t_vn.to_numpy(), kept.level_m.to_numpy(copy=True)
        for i, r in big.iterrows():
            j = np.searchsorted(kt, r.t_vn.to_datetime64())          # kt[j] = giờ đang xét (giá trị đang giữ)
            if j == 0 or j + 1 >= len(kt) or kt[j] != r.t_vn.to_datetime64():
                continue
            if (kt[j + 1] - kt[j - 1]) / np.timedelta64(1, "h") > 6:
                continue
            ref = (kv[j - 1] + kv[j + 1]) / 2
            if abs(r.level_m - ref) + 0.05 < abs(kv[j] - ref):
                k = kept.index[j]
                df.loc[i, ["qc_flag", "qc_note"]] = ["ok", f"chọn thay {df.at[k, 'source']} (khớp giá trị kề hơn)"]
                df.loc[k, ["qc_flag", "qc_note"]] = ["duplicate", f"trùng giờ, lệch {kv[j] - r.level_m:+.2f} m; không khớp giá trị kề"]
                kv[j] = r.level_m
                swapped += 1
    conflicts.attrs["swapped"] = swapped

    # gai và giá trị điền sẵn: so với giá trị hợp lệ liền trước/sau (≤ 3 giờ; trạm triều ≤ 1 giờ)
    for code, idx in df[df.qc_flag == "ok"].groupby("station_code").groups.items():
        thr = 1.0 if code in UPSTREAM else 0.5
        gmax = 1 if code in TIDAL else 3
        # Giá trị điền sẵn (làm TRƯỚC lọc gai – nếu không, số đo thật xen giữa các giá trị điền sẵn bị coi là gai):
        # một giá trị lặp ≥ 100 lần trong năm, so với giá trị kề KHÁC nó (≤ 6 giờ); phần lớn lần xuất hiện lệch > 0,3 m
        # → gắn cờ mọi lần xuất hiện không khớp giá trị kề (lệch > 0,1 m) hoặc không có giá trị kề để kiểm tra
        s = df.loc[idx]
        for y, sy in s.groupby(s.t_vn.dt.year):
            cnt = sy.level_m.value_counts()
            for v in cnt[cnt >= 100].index:
                other = sy[sy.level_m != v]
                t, ot = sy[sy.level_m == v].t_vn.to_numpy(), other.t_vn.to_numpy()
                j = np.searchsorted(ot, t)
                ok_p, ok_n = j > 0, j < len(ot)
                pv = np.where(ok_p, other.level_m.to_numpy()[np.clip(j - 1, 0, None)], np.nan)
                nv = np.where(ok_n, other.level_m.to_numpy()[np.clip(j, None, len(ot) - 1)], np.nan)
                pt = np.where(ok_p, (t - ot[np.clip(j - 1, 0, None)]) / np.timedelta64(1, "h"), np.inf)
                nt = np.where(ok_n, (ot[np.clip(j, None, len(ot) - 1)] - t) / np.timedelta64(1, "h"), np.inf)
                near = (pt <= 6) & (nt <= 6)
                dev = np.where(near, np.abs(v - (pv + nv) / 2), np.nan)
                if np.nanmean(dev > 0.3) < 0.3:
                    continue
                hit = sy[sy.level_m == v].index[~near | (dev > 0.1)]
                df.loc[hit, ["qc_flag", "qc_note"]] = ["sentinel", f"giá trị {v} m lặp {int(cnt[v])} lần năm {y} – nghi điền sẵn"]
        for _ in range(2):
            ix = [i for i in idx if df.at[i, "qc_flag"] == "ok"]
            s = df.loc[ix]
            p, n = s.level_m.shift(1), s.level_m.shift(-1)
            gp = (s.t_vn - s.t_vn.shift(1)).dt.total_seconds() / 3600
            gn = (s.t_vn.shift(-1) - s.t_vn).dt.total_seconds() / 3600
            d1, d2 = s.level_m - p, s.level_m - n
            spike = (gp <= gmax) & (gn <= gmax) & (np.sign(d1) == np.sign(d2)) & (np.minimum(d1.abs(), d2.abs()) > thr) \
                & ((p - n).abs() < np.minimum(d1.abs(), d2.abs()) / 2)
            df.loc[spike[spike].index, ["qc_flag", "qc_note"]] = ["spike", f"gai đơn lẻ > {thr} m so với hai giá trị kề"]
    return df, conflicts


# ------------------------------------------------------------------ chạy
vndms, info = read_vndms()
p0319, sheet_report = read_pctt_0319()
mike = read_mike_flood()
cont, cont_report = read_continuous()
daily = read_daily()
# Sơn Trà trong file 0.2 dùng mặt chuẩn khác chuỗi giờ dfs0 (dao động quanh +1 m so với quanh 0 m): quy về chuỗi
# dfs0 bằng độ lệch trung vị trên các giờ trùng nhau (2003–2009)
a = p0319[p0319.station_code == "SONTRA"].drop_duplicates("t_vn").set_index("t_vn").level_m
b = cont[cont.station_code == "SONTRA"].drop_duplicates("t_vn").set_index("t_vn").level_m
both = pd.concat([a, b], axis=1, join="inner").dropna()
sontra_offset = round(float((both.iloc[:, 0] - both.iloc[:, 1]).median()), 2)
p0319.loc[p0319.station_code == "SONTRA", "level_m"] -= sontra_offset
cont_report["SONTRA_0.2_offset_m"] = {"offset": sontra_offset, "n_overlap_h": int(len(both)),
                                      "note": "trừ khỏi số liệu Sơn Trà file 0.2 để cùng mặt chuẩn với chuỗi dfs0 1983–2009"}
raw = pd.concat([vndms, p0319, mike, cont], ignore_index=True).dropna(subset=["station_code", "t_vn", "level_m"])
hourly, conflicts = qc(raw)
hourly["t_utc"] = (hourly.t_vn - pd.Timedelta(hours=7)).dt.tz_localize("UTC")
ok = hourly[hourly.qc_flag == "ok"]
hourly["step_h"] = np.nan
hourly.loc[ok.index, "step_h"] = ok.groupby("station_code").t_vn.diff().dt.total_seconds().div(3600).round(2)
hourly["level_m"] = hourly.level_m.round(3)

dlo = daily.station_code.map({k: v[3] for k, v in STATIONS.items()})
dhi = daily.station_code.map({k: v[4] for k, v in STATIONS.items()})
daily["qc_flag"] = np.where((daily.level_m < dlo) | (daily.level_m > dhi), "out_of_range", "ok")

WORK.mkdir(parents=True, exist_ok=True)
hourly.to_parquet(WORK / "station_levels_hourly.parquet", index=False)
daily.to_parquet(WORK / "station_levels_daily.parquet", index=False)
# giá trị hợp lệ dạng JSON Lines (UTC) cho src/script/importStationLevels.js (nạp vào waterlevelobservations)
ok_rows = hourly[hourly.qc_flag == "ok"]
pd.DataFrame({"station_code": ok_rows.station_code, "t_obs": ok_rows.t_utc.dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
              "level": ok_rows.level_m, "source": ok_rows.source}).to_json(
    WORK / "station_levels_ok.jsonl.gz", orient="records", lines=True, force_ascii=False, compression="gzip")

# ------------------------------------------------------------------ kiểm kê + đỉnh lũ mùa lũ (01/9–15/12)
inv = []
for (code, src), g in hourly.groupby(["station_code", "source"]):
    q = g.qc_flag.value_counts()
    inv.append({"station_code": code, "source": src, "from": g.t_vn.min(), "to": g.t_vn.max(), "n": len(g),
                "ok": int(q.get("ok", 0)), **{k: int(q.get(k, 0)) for k in ("out_of_range", "spike", "sentinel", "duplicate")}})
inv = pd.DataFrame(inv)
yearly = ok.assign(y=ok.t_vn.dt.year).groupby(["station_code", "y"]).agg(
    n=("level_m", "size"), hourly_share=("t_vn", lambda t: float((t.diff().dt.total_seconds() == 3600).mean()))).reset_index()
fs = ok[((ok.t_vn.dt.month >= 9) & (ok.t_vn.dt.month <= 11)) | ((ok.t_vn.dt.month == 12) & (ok.t_vn.dt.day <= 15))]
peaks = fs.loc[fs.groupby(["station_code", fs.t_vn.dt.year]).level_m.idxmax(), ["station_code", "t_vn", "level_m"]]
peaks = peaks.assign(year=peaks.t_vn.dt.year).sort_values(["year", "station_code"])
alarm = {k: info.get(k, {}).get("alarm") for k in STATIONS}
peaks["vs_alarm"] = [("≥BĐIII" if v >= a[2] else "≥BĐII" if v >= a[1] else "≥BĐI" if v >= a[0] else "<BĐI") if a else ""
                     for v, a in zip(peaks.level_m, peaks.station_code.map(alarm))]

stations = pd.DataFrame([{"station_code": k, "kttv_id": v[0], "name": v[1], "river": v[2], "range_m": [v[3], v[4]],
                          **info.get(k, {})} for k, v in STATIONS.items()])
summary = {
    "note": "Chuẩn hóa từ Documents/Data_MucNuoc (17_station_levels.py). Mực nước m theo cao độ trạm KTTV; giờ Việt Nam.",
    "stations": json.loads(stations.to_json(orient="records", force_ascii=False)),
    "inventory": json.loads(inv.to_json(orient="records", date_format="iso", force_ascii=False)),
    "flood_season_peaks": json.loads(peaks.to_json(orient="records", date_format="iso", force_ascii=False)),
    "pctt_0319_sheets": sheet_report, "continuous": cont_report,
    "duplicate_conflicts_gt_5cm": int((conflicts["diff"].abs() > 0.05).sum()), "duplicates": int(len(conflicts)),
    "conflicts_resolved_by_neighbours": conflicts.attrs.get("swapped", 0),
    "daily": {"n": int(len(daily)), "out_of_range": int((daily.qc_flag != "ok").sum()),
              "stations": sorted(daily.station_code.unique().tolist())},
}
(COMPUTE / "station_levels_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1, default=str), encoding="utf-8")

# ------------------------------------------------------------------ bản xuất cho người dùng
EXPORT.mkdir(parents=True, exist_ok=True)
cols = ["station_code", "t_vn", "level_m", "step_h", "source", "qc_flag", "qc_note"]
for code, g in hourly.groupby("station_code"):
    g[cols].to_csv(EXPORT / f"H_gio_{code}.csv", index=False, encoding="utf-8-sig", date_format="%Y-%m-%d %H:%M")
daily.assign(date=daily.date.dt.date)[["station_code", "date", "level_m", "source", "qc_flag"]].to_csv(
    EXPORT / "H_ngay_1976_2002.csv", index=False, encoding="utf-8-sig")
with pd.ExcelWriter(EXPORT / "Bao_Cao_Chuan_Hoa_Muc_Nuoc.xlsx") as xw:
    stations.assign(range_m=stations.range_m.astype(str), alarm=stations.alarm.astype(str)).to_excel(xw, sheet_name="Tram", index=False)
    inv.to_excel(xw, sheet_name="Kiem_ke_nguon", index=False)
    yearly.pivot(index="y", columns="station_code", values="n").to_excel(xw, sheet_name="So_gia_tri_theo_nam")
    peaks.to_excel(xw, sheet_name="Dinh_lu_mua_lu", index=False)
    hourly[hourly.qc_flag.isin(["out_of_range", "spike", "sentinel"])][cols].to_excel(xw, sheet_name="Gia_tri_bi_gan_co", index=False)
    conflicts[conflicts["diff"].abs() > 0.05][["station_code", "t_vn", "source", "level_m", "diff"]].to_excel(
        xw, sheet_name="Trung_gio_lech", index=False)

print(f"Giờ: {len(hourly):,} giá trị, {len(ok):,} ok · cờ: {hourly.qc_flag.value_counts().to_dict()}")
print(f"Ngày: {len(daily):,} giá trị, {int((daily.qc_flag != 'ok').sum())} ngoài khoảng")
print(f"Trùng giờ giữa nguồn: {len(conflicts):,}, lệch > 5 cm: {summary['duplicate_conflicts_gt_5cm']}, đổi theo giá trị kề: {summary['conflicts_resolved_by_neighbours']}; Sơn Trà 0.2 lệch mặt chuẩn {sontra_offset} m")
print(inv.to_string(index=False))
