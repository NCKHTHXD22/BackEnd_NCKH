"""Mực nước trạm từ lưu lượng diễn toán + triều – dùng chung cho 25_forecast_chain.py (dự báo ngược trên trận đã qua)
và 26_forecast_package.py (dự báo theo LSTM cho giờ hiện tại).

  - Nông Sơn, Giao Thủy, Thành Mỹ, Ái Nghĩa: H = a + b·Q^c (20_routing_check.py, dựng trên trận hiệu chỉnh 10/2025).
  - Câu Lâu, Hội An, Cẩm Lệ (triều + phân lưu, mạng diễn toán chưa tới): hồi quy tuyến tính dựng trên trận hiệu chỉnh
    theo mực nước Giao Thủy, Ái Nghĩa trễ L giờ (L tốt nhất 0–MAX_LAG) + triều thiên văn Sơn Trà (18_tide_sontra.py).
"""
import json
import pickle

import numpy as np
import pandas as pd
import utide

from config import ROOT, WORK

COMPUTE = ROOT / "data" / "compute"
MAX_LAG = 12
ROUTED = {"NONGSON": "ST-NONGSON", "GIAOTHUY": "ST-GIAOTHUY", "THANHMY": "ST-THANHMY", "AINGHIA": "J-VUGIA-END"}
TIDAL = {"CAULAU": ["GIAOTHUY", "AINGHIA"], "HOIAN": ["GIAOTHUY", "AINGHIA"], "CAMLE": ["AINGHIA", "GIAOTHUY"]}
STATIONS = [*ROUTED, *TIDAL]

EVENTS = json.loads((COMPUTE / "events.json").read_text(encoding="utf-8"))
NAMES = {k: f"{k}_{EVENTS[k]['peak_st2'][:10].replace('-', '')}" for k in ("calibration", "validation")}
RATING = {c: v["rating_H=a+b*Q^c"] for c, v in
          json.loads((COMPUTE / "routing_check.json").read_text(encoding="utf-8"))["stations"].items()}
SHIFT = json.loads((COMPUTE / "hand_stage_calibration.json").read_text(encoding="utf-8"))["value"]
lv = pd.read_parquet(WORK / "station_levels_hourly.parquet")
lv = lv[(lv.qc_flag == "ok") & lv.station_code.isin(STATIONS)]
with open(WORK / "tide_sontra_coef.pkl", "rb") as f:
    TIDE = pickle.load(f)


def rating(q, a, b, c):
    return a + b * np.power(np.maximum(q, 1.0), c)


def observed(idx):
    """Mực nước giờ đo (QC đạt) của các trạm trên trục thời gian idx; thiếu = NaN (không nội suy)."""
    cols = {}
    for code in STATIONS:
        s = lv[lv.station_code == code].drop_duplicates("t_vn").set_index("t_vn").level_m.sort_index()
        cols[code] = s.reindex(idx)
    return pd.DataFrame(cols, index=idx)


def tide(idx):
    """Triều thiên văn Sơn Trà (m) theo giờ Việt Nam."""
    return pd.Series(utide.reconstruct((idx - pd.Timedelta(hours=7)).to_pydatetime(), TIDE, verbose=False).h, index=idx)


def design(inputs, td, lag):
    """Ma trận hồi quy: mực nước trạm thượng lưu trễ `lag` giờ + triều + hằng số."""
    return pd.concat([inputs.shift(lag), td.rename("tide")], axis=1).assign(one=1.0)


def fit_tidal(obs, td):
    out = {}
    for tgt, ups in TIDAL.items():
        best = None
        for lag in range(MAX_LAG + 1):
            X = design(obs[ups], td, lag)
            d = pd.concat([X, obs[tgt].rename("y")], axis=1).dropna()
            beta = np.linalg.lstsq(d[X.columns].to_numpy(), d.y.to_numpy(), rcond=None)[0]
            r2 = 1 - float(((d.y - d[X.columns].to_numpy() @ beta) ** 2).sum() / ((d.y - d.y.mean()) ** 2).sum())
            if best is None or r2 > best["r2"]:
                best = {"inputs": ups, "lag_h": lag, "coef": dict(zip(X.columns, np.round(beta, 4).tolist())),
                        "beta": beta, "r2": round(r2, 3), "n": len(d)}
        out[tgt] = best
    return out


def load_event(key):
    return json.loads((COMPUTE / "events" / f"{NAMES[key]}.json").read_text(encoding="utf-8"))


def calibration_tidal():
    """Hồi quy trạm triều dựng trên trận hiệu chỉnh."""
    idx = pd.DatetimeIndex(pd.to_datetime(load_event("calibration")["time"]))
    return fit_tidal(observed(idx), tide(idx))
