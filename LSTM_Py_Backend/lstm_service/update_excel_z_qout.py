"""
update_excel_z_qout.py
======================
Cập nhật tất cả file Excel trong Data_Tung_Ho_Ma_Tran_Rong:
  - Thêm Z (mực nước, m) 24 cột TRƯỚC lưu lượng đến
  - Thêm Q_out (lưu lượng xả, m3/s) 24 cột SAU lưu lượng đến

Cấu trúc CŨ:
  Col 0      : Ngày
  Col 1-24   : Lưu lượng đến (m3/s)
  Col 25-48  : Mưa lưu vực IDW (mm)
  Col 49-72  : Mưa Dự Báo P50
  Col 73+    : Dữ liệu trạm

Cấu trúc MỚI:
  Col 0      : Ngày
  Col 1-24   : Mực nước Z (m)
  Col 25-48  : Lưu lượng đến Q (m3/s)
  Col 49-72  : Lưu lượng xả Q_out (m3/s)
  Col 73-96  : Mưa lưu vực IDW (mm)
  Col 97-120 : Mưa Dự Báo P50 (nếu có)
  Col 121+   : Dữ liệu trạm (nếu có)

Nguồn dữ liệu:
  - Z, Q (inflow), Q_out : API Đà Nẵng (baocaothuydiens_bieudo)
  - Mưa IDW              : Giữ nguyên từ file Excel hiện tại (VNDMS)

Chạy từ thư mục lstm_service/:
  python update_excel_z_qout.py
"""

import os
import sys
import time
import base64
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

# Fix encoding on Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ── Path setup ──────────────────────────────────────────────────────────────
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS_DIR)
os.chdir(THIS_DIR)

from config.reservoirs import RESERVOIRS

load_dotenv()

# ── Cấu hình ────────────────────────────────────────────────────────────────
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

BASE_URL     = "https://apiv2.danang.gov.vn/apiPCTT/1.0"
TOKEN_URL    = "https://apiv2.danang.gov.vn/oauth2/token"
CONSUMER_KEY    = os.getenv("CONSUMER_KEY")
CONSUMER_SECRET = os.getenv("CONSUMER_SECRET")

DATA_FOLDER = os.path.join(THIS_DIR, "LSTM_Project", "Data_Tung_Ho_Ma_Tran_Rong")

# Cờ kiểm tra: True = chỉ chạy 1 hồ đầu tiên để test
DRY_RUN = False

_token_cache = {"token": None, "expiry": None}


# ─────────────────────────────────────────────────────────────────────────────
#  API helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_token() -> str | None:
    """Lấy OAuth2 token, cache lại cho đến khi hết hạn."""
    c = _token_cache
    if c["token"] and c["expiry"] and datetime.now() < c["expiry"]:
        return c["token"]
    if not CONSUMER_KEY or not CONSUMER_SECRET:
        print("  [WARN] Thiếu CONSUMER_KEY/CONSUMER_SECRET trong .env — sẽ để NaN cho Z/Q_out.")
        return None
    try:
        auth = base64.b64encode(f"{CONSUMER_KEY}:{CONSUMER_SECRET}".encode()).decode()
        r = requests.post(
            TOKEN_URL,
            headers={"Authorization": f"Basic {auth}"},
            data={"grant_type": "client_credentials"},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        c["token"] = data["access_token"]
        c["expiry"] = datetime.now() + timedelta(seconds=data["expires_in"] - 60)
        return c["token"]
    except Exception as e:
        print(f"  [WARN] Lỗi lấy token: {e}")
        return None


def _fetch_hydro_range(rid: int, start: datetime, end: datetime,
                        token: str) -> pd.DataFrame:
    """
    Gọi API lấy inflow / Z / Q_out cho 1 khoảng thời gian.
    Trả về DataFrame: time | inflow | water_level | outflow
    """
    try:
        r = requests.get(
            f"{BASE_URL}/baocaothuydiens_bieudo",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "thuydien_id": rid,
                "ngaybatdau": start.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z",
                "ngayketthuc": end.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z",
            },
            timeout=120,
        )
        if r.status_code != 200:
            print(f"    [WARN] HTTP {r.status_code}")
            return pd.DataFrame()

        raw = r.json()
        df = pd.DataFrame(raw["data"] if isinstance(raw, dict) else raw)
        if df.empty:
            return pd.DataFrame()

        df["time"]        = pd.to_datetime(df["thoigianxa"], errors="coerce").dt.floor("h")
        df["inflow"]      = pd.to_numeric(df.get("qvao",         pd.NA), errors="coerce")
        df["water_level"] = pd.to_numeric(df.get("htl",          pd.NA), errors="coerce")
        df["outflow"]     = pd.to_numeric(df.get("luuluongxa",   pd.NA), errors="coerce")

        df = df[["time", "inflow", "water_level", "outflow"]].dropna(subset=["time"])
        df = df.sort_values("time").drop_duplicates("time")
        return df.reset_index(drop=True)

    except Exception as e:
        print(f"    [WARN] Lỗi API: {e}")
        return pd.DataFrame()


def fetch_all_api_data(rid: int,
                        start_year: int = 2022,
                        end_year:   int = 2026) -> pd.DataFrame:
    """
    Gọi API theo từng năm để tránh timeout.
    Trả về DataFrame hourly: time | water_level | outflow
    (inflow sẽ không dùng vì đã có trong Excel)
    """
    token = _get_token()
    if token is None:
        return pd.DataFrame()

    frames = []
    for year in range(start_year, end_year + 1):
        start_dt = datetime(year, 1, 1)
        end_dt   = datetime(year, 12, 31, 23, 0, 0)
        print(f"    Fetch API rid={rid} year={year} ...", end=" ", flush=True)
        df_year = _fetch_hydro_range(rid, start_dt, end_dt, token)
        if not df_year.empty:
            frames.append(df_year)
            print(f"{len(df_year):,} rows OK")
        else:
            print("no data")
        time.sleep(0.5)   # tránh bị rate-limit

    if not frames:
        return pd.DataFrame()

    result = pd.concat(frames, ignore_index=True)
    result = result.sort_values("time").drop_duplicates("time")
    return result.reset_index(drop=True)


# ─────────────────────────────────────────────────────────────────────────────
#  Excel helpers
# ─────────────────────────────────────────────────────────────────────────────

HOUR_LABELS = [f"{h:02d}h" for h in range(24)]


def _read_raw_excel(filepath: str):
    """Đọc file Excel thô, không parse header, trả về DataFrame raw."""
    return pd.read_excel(filepath, header=None, dtype=object)


def _find_header_row(df_raw: pd.DataFrame) -> int:
    """Tìm chỉ số hàng chứa nhãn giờ '00h'."""
    for i, row in df_raw.iterrows():
        if "00h" in row.values:
            return int(i)
    return -1


def _already_updated(df_raw: pd.DataFrame) -> bool:
    """
    Kiểm tra xem file đã có cấu trúc MỚI chưa (row 0 chứa "Mực nước").
    Tránh update lại file đã được xử lý.
    """
    row0 = df_raw.iloc[0].astype(str).str.strip().tolist()
    return any("m\u1ef1c n\u01b0\u1edbc" in v.lower() or "mực nước" in v.lower() for v in row0)


def _rebuild_file(filepath: str,
                   df_raw: pd.DataFrame,
                   header_row_idx: int,
                   api_lookup: pd.DataFrame,
                   folder_name: str) -> bool:
    """
    Tái tạo file Excel với cột Z và Q_out mới.

    Tham số:
        filepath        : đường dẫn file xlsx
        df_raw          : DataFrame thô từ pd.read_excel(header=None)
        header_row_idx  : chỉ số hàng chứa '00h'
        api_lookup      : DataFrame indexed by 'time' với cột water_level, outflow
        folder_name     : tên folder/hồ (dùng cho metadata)

    Trả về True nếu thành công.
    """
    # ── Tách header rows và data rows ────────────────────────────────────────
    # Row header_row_idx - 1  : tên feature ("Lưu lượng đến", "Mưa IDW", ...)
    # Row header_row_idx      : nhãn giờ ("Hour", "00h", "01h", ...)
    # Row header_row_idx + 1  : metadata ("Tên Hồ: ...")
    # Row header_row_idx + 2+ : dữ liệu
    feature_row_idx  = header_row_idx - 1
    meta_row_idx     = header_row_idx + 1
    data_start_idx   = header_row_idx + 2

    feat_row  = df_raw.iloc[feature_row_idx].tolist()   # row 0
    hour_row  = df_raw.iloc[header_row_idx].tolist()    # row 1
    meta_row  = df_raw.iloc[meta_row_idx].tolist()      # row 2
    data_rows = df_raw.iloc[data_start_idx:].copy()     # rows 3+

    # ── Phân tích số cột hiện tại ─────────────────────────────────────────────
    total_cols = len(feat_row)
    # Col 0: Ngày/Feature
    # Col 1-24: Inflow
    # Col 25-48: Rain IDW
    # Col 49+: Forecast / Stations
    INFLOW_START = 1    # cột bắt đầu inflow (cũ)
    RAIN_START   = 25   # cột bắt đầu Rain IDW (cũ)
    AFTER_RAIN   = 49   # cột bắt đầu phần sau Rain (Forecast/Stations)

    # Lấy tên feature từ row 0 cho từng nhóm
    inflow_feat_name = str(feat_row[INFLOW_START]) if INFLOW_START < total_cols else "Lưu lượng đến (m3/s)"
    rain_feat_name   = str(feat_row[RAIN_START])   if RAIN_START < total_cols else "Mưa lưu vực IDW (mm)"

    # ── Xây dựng header rows MỚI ─────────────────────────────────────────────
    # Cấu trúc MỚI: [Ngày | Z(24) | Inflow(24) | Q_out(24) | Rain IDW(24) | ... còn lại ...]
    def _make_feat_row():
        row = ["Feature"]
        row += ["Mực nước (m)"] + [""] * 23          # Z: 24 cột
        row += [inflow_feat_name] + [""] * 23        # Inflow: 24 cột
        row += ["Lưu lượng xả (m3/s)"] + [""] * 23  # Q_out: 24 cột
        row += [rain_feat_name] + [""] * 23          # Rain IDW: 24 cột
        # Phần còn lại (Forecast + Stations) — giữ nguyên
        remaining = feat_row[AFTER_RAIN:]
        row += remaining
        return row

    def _make_hour_row():
        row = ["Hour"]
        for _ in range(4):          # 4 nhóm × 24h (Z, Inflow, Q_out, Rain)
            row += HOUR_LABELS
        # Phần còn lại giữ nguyên
        remaining = hour_row[AFTER_RAIN:]
        row += remaining
        return row

    def _make_meta_row(total_new_cols: int):
        row = [meta_row[0]] if meta_row else [f"Tên Hồ: {folder_name}"]
        row += [""] * (total_new_cols - 1)
        return row

    # ── Tái tạo data rows ────────────────────────────────────────────────────
    new_data_rows = []

    for _, row in data_rows.iterrows():
        raw_date = row.iloc[0]
        if pd.isna(raw_date):
            continue
        try:
            day = pd.to_datetime(raw_date)
        except Exception:
            continue

        # Lấy giá trị inflow (cột 1-24) và rain IDW (cột 25-48) từ file cũ
        inflow_vals = []
        for h in range(24):
            try:
                v = float(row.iloc[INFLOW_START + h])
                inflow_vals.append(v if not np.isnan(v) else "")
            except Exception:
                inflow_vals.append("")

        rain_vals = []
        for h in range(24):
            try:
                v = float(row.iloc[RAIN_START + h])
                rain_vals.append(v if not np.isnan(v) else 0.0)
            except Exception:
                rain_vals.append(0.0)

        # Phần còn lại (Forecast/Stations) — giữ nguyên
        remaining_vals = row.iloc[AFTER_RAIN:].tolist()

        # Lấy Z và Q_out từ API lookup
        z_vals    = []
        qout_vals = []
        for h in range(24):
            ts = day.replace(hour=h, minute=0, second=0, microsecond=0)
            if not api_lookup.empty and ts in api_lookup.index:
                row_api = api_lookup.loc[ts]
                wl = row_api.get("water_level", np.nan)
                qt = row_api.get("outflow",     np.nan)
                z_vals.append("" if pd.isna(wl) else round(float(wl), 3))
                qout_vals.append("" if pd.isna(qt) else round(float(qt), 3))
            else:
                z_vals.append("")
                qout_vals.append("")

        # Ghép thành 1 hàng mới
        new_row = [day.date()] + z_vals + inflow_vals + qout_vals + rain_vals + remaining_vals
        new_data_rows.append(new_row)

    if not new_data_rows:
        print(f"    [WARN] Không có data rows hợp lệ trong {os.path.basename(filepath)}")
        return False

    # Số cột tổng mới
    total_new_cols = 1 + 24 * 4 + len(feat_row[AFTER_RAIN:])   # Date + 4 groups + remaining

    # ── Ghi file Excel mới ───────────────────────────────────────────────────
    feat_row_new = _make_feat_row()
    hour_row_new = _make_hour_row()
    meta_row_new = _make_meta_row(total_new_cols)

    # Đảm bảo tất cả rows cùng độ dài (pad với "")
    max_len = max(len(feat_row_new), len(hour_row_new), len(meta_row_new),
                  max(len(r) for r in new_data_rows))

    def _pad(lst, length):
        return lst + [""] * (length - len(lst))

    all_rows = (
        [_pad(feat_row_new, max_len),
         _pad(hour_row_new, max_len),
         _pad(meta_row_new, max_len)]
        + [_pad(r, max_len) for r in new_data_rows]
    )

    df_out = pd.DataFrame(all_rows)

    try:
        with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
            df_out.to_excel(writer, index=False, header=False)
        return True
    except Exception as e:
        print(f"    [ERROR] Không ghi được file: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────────────────

def update_all_reservoirs():
    print("=" * 70)
    print("UPDATE EXCEL: Thêm Z và Q_out vào tất cả file ma trận")
    print("=" * 70)

    total_updated = 0
    total_skipped = 0
    total_errors  = 0

    rids = list(RESERVOIRS.keys())
    if DRY_RUN:
        rids = rids[:1]
        print(f"  [DRY RUN] Chỉ xử lý hồ đầu tiên: rid={rids[0]}")

    for rid in rids:
        info        = RESERVOIRS[rid]
        name        = info["name"]
        folder_name = name.replace(" ", "_")
        folder_path = os.path.join(DATA_FOLDER, folder_name)

        print(f"\n{'='*60}")
        print(f"  [{rid:>2}] {name}")
        print(f"{'='*60}")

        if not os.path.isdir(folder_path):
            print(f"  [SKIP] Không tìm thấy thư mục: {folder_path}")
            continue

        # ── Fetch toàn bộ API data cho hồ này ────────────────────────────
        print(f"  Đang tải dữ liệu API (2022–2026)...")
        api_df = fetch_all_api_data(rid, start_year=2022, end_year=2026)

        if api_df.empty:
            print(f"  [WARN] Không có dữ liệu API — Z/Q_out sẽ để trống.")
            api_lookup = pd.DataFrame()
        else:
            # Index by time để lookup nhanh O(1)
            api_lookup = api_df.set_index("time")
            print(f"  API data: {len(api_df):,} rows  "
                  f"({api_df['time'].min().date()} → {api_df['time'].max().date()})")

        # ── Duyệt từng file Excel trong folder ───────────────────────────
        xlsx_files = sorted([
            f for f in os.listdir(folder_path)
            if f.endswith(".xlsx") and folder_name in f
        ])
        print(f"  Tìm thấy {len(xlsx_files)} file Excel")

        for fname in xlsx_files:
            fpath = os.path.join(folder_path, fname)

            try:
                df_raw = _read_raw_excel(fpath)
            except Exception as e:
                print(f"    [ERROR] Đọc file thất bại: {fname}: {e}")
                total_errors += 1
                continue

            # Kiểm tra đã update chưa
            if _already_updated(df_raw):
                print(f"    [SKIP] {fname} — đã có cấu trúc mới (Z/Q_out)")
                total_skipped += 1
                continue

            # Tìm header row
            header_idx = _find_header_row(df_raw)
            if header_idx < 1:
                print(f"    [SKIP] {fname} — không tìm thấy hàng nhãn giờ '00h'")
                total_skipped += 1
                continue

            # Rebuild
            ok = _rebuild_file(fpath, df_raw, header_idx, api_lookup, folder_name)
            if ok:
                print(f"    [OK]   {fname}")
                total_updated += 1
            else:
                print(f"    [FAIL] {fname}")
                total_errors += 1

    print(f"\n{'='*70}")
    print(f"  HOÀN THÀNH")
    print(f"  Updated : {total_updated}")
    print(f"  Skipped : {total_skipped}")
    print(f"  Errors  : {total_errors}")
    print(f"{'='*70}")


if __name__ == "__main__":
    update_all_reservoirs()
