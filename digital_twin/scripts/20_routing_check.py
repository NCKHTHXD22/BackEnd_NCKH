"""Bước 20 – Kiểm chứng diễn toán (13_routing.py) bằng mực nước trạm đo (lộ trình 5.1).

Chưa có lưu lượng đo / đường quan hệ H–Q chính thức → hai cách so:
  1) Thời gian: đỉnh Q diễn toán so với đỉnh H đo tại cùng trạm (đỉnh Q và đỉnh H ở trạm không ảnh hưởng triều gần như
     trùng nhau) – không cần quan hệ H–Q.
  2) Hình dạng: dựng quan hệ H = a + b·Q^c TRÊN TRẬN HIỆU CHỈNH (Q diễn toán ↔ H đo), áp sang TRẬN KIỂM ĐỊNH → NSE, RMSE,
     sai số đỉnh H. Trên trận hiệu chỉnh chỉ là độ khớp (trong mẫu); trận kiểm định mới là kiểm chứng.
Ái Nghĩa so với Q cuối Vu Gia (J-VUGIA-END, trước khi chia sang Quảng Huế) – tỷ lệ chia hằng số được quan hệ H–Q hấp thụ.

Đầu ra: data/compute/routing_check.json
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/20_routing_check.py
"""
import json

import numpy as np
import pandas as pd
from scipy.optimize import curve_fit

from config import ROOT, WORK

COMPUTE = ROOT / "data" / "compute"
PAIRS = {"NONGSON": "ST-NONGSON", "GIAOTHUY": "ST-GIAOTHUY", "THANHMY": "ST-THANHMY", "AINGHIA": "J-VUGIA-END"}
events = json.loads((COMPUTE / "events.json").read_text(encoding="utf-8"))
names = {k: f"{k}_{events[k]['peak_st2'][:10].replace('-', '')}" for k in ("calibration", "validation")}
lv = pd.read_parquet(WORK / "station_levels_hourly.parquet")
lv = lv[(lv.qc_flag == "ok") & lv.station_code.isin(PAIRS)]


def load(key):
    rt = json.loads((COMPUTE / "routing" / f"{names[key]}.json").read_text(encoding="utf-8"))
    idx = pd.to_datetime(rt["time"])
    out = {}
    for code, node in PAIRS.items():
        q = pd.Series(rt["flow"][node], index=idx, dtype=float)
        h = lv[lv.station_code == code].drop_duplicates("t_vn").set_index("t_vn").level_m.sort_index()
        out[code] = pd.DataFrame({"q": q, "h": h.reindex(idx)})
    return out


rating = lambda q, a, b, c: a + b * np.power(np.maximum(q, 1.0), c)


def nse(o, s):
    return float(1 - ((o - s) ** 2).sum() / ((o - o.mean()) ** 2).sum())


data = {k: load(k) for k in names}
report = {"method": __doc__.split("\n\n")[1].strip(), "events": names, "stations": {}}
for code in PAIRS:
    cal = data["calibration"][code].dropna()
    p, _ = curve_fit(rating, cal.q, cal.h, p0=[cal.h.min(), 0.1, 0.5], bounds=([-10, 1e-6, 0.05], [40, 50, 1.5]), maxfev=20000)
    st = {"rating_H=a+b*Q^c": [round(float(x), 4) for x in p], "events": {}}
    for key in names:
        d = data[key][code]
        dd = d.dropna()
        tq, th = d.q.idxmax(), d.h.idxmax()
        hs = rating(dd.q, *p)
        # thiếu số liệu đo quanh đỉnh mô hình → đỉnh đo có thể chưa phải đỉnh thật (vd. Nông Sơn 18/11/2025)
        gap = int(d.h[tq - pd.Timedelta(hours=6): tq + pd.Timedelta(hours=6)].isna().sum())
        st["events"][key] = {
            "obs_missing_h_around_q_peak": gap, "peak_comparable": gap <= 3,
            "n_h": int(len(dd)), "q_peak_m3s": round(float(d.q.max())), "h_peak_obs_m": round(float(d.h.max()), 2),
            "t_peak_q": str(tq), "t_peak_h": str(th), "peak_time_error_h": round((tq - th).total_seconds() / 3600, 1),
            "h_peak_sim_m": round(float(rating(d.q.max(), *p)), 2),
            "h_peak_error_m": round(float(rating(d.q.max(), *p) - d.h.max()), 2),
            "nse_h": round(nse(dd.h, hs), 3), "rmse_h_m": round(float(np.sqrt(((dd.h - hs) ** 2).mean())), 2),
            "r_q_h": round(float(np.corrcoef(dd.q, dd.h)[0, 1]), 3),
            "role": "trong mẫu (dựng quan hệ H–Q)" if key == "calibration" else "kiểm chứng (quan hệ H–Q của trận hiệu chỉnh)",
        }
    report["stations"][code] = st
(COMPUTE / "routing_check.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

# Mực nước giờ mọi trạm KTTV trong cửa sổ từng trận (chưa nội suy) – cho 21_qd1865_replay.mjs và web
all_lv = pd.read_parquet(WORK / "station_levels_hourly.parquet")
all_lv = all_lv[all_lv.qc_flag == "ok"]
(COMPUTE / "station_events").mkdir(exist_ok=True)
for key, name in names.items():
    ev = json.loads((COMPUTE / "events" / f"{name}.json").read_text(encoding="utf-8"))
    idx = pd.to_datetime(ev["time"])
    levels = {}
    for code, g in all_lv[(all_lv.t_vn >= idx[0]) & (all_lv.t_vn <= idx[-1])].groupby("station_code"):
        s = g.drop_duplicates("t_vn").set_index("t_vn").level_m.reindex(idx)
        levels[code] = [None if pd.isna(v) else round(float(v), 2) for v in s]
    (COMPUTE / "station_events" / f"{name}.json").write_text(json.dumps(
        {"event": name, "time": ev["time"], "unit": "m (cao độ trạm KTTV)", "source": "17_station_levels.py (qc_flag = ok)",
         "levels": levels}, ensure_ascii=False), encoding="utf-8")

rows = [{"trạm": c, "trận": k[:3], **{x: v[x] for x in ("q_peak_m3s", "h_peak_obs_m", "h_peak_sim_m", "peak_time_error_h",
                                                         "obs_missing_h_around_q_peak", "nse_h", "rmse_h_m")}}
        for c, s in report["stations"].items() for k, v in s["events"].items()]
print(pd.DataFrame(rows).to_string(index=False))
