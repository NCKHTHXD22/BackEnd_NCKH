# data/legacy_v1_recover.py
"""
Khôi phục dữ liệu thô (rain/inflow/water_level/outflow) mỗi hồ từ dataset đã
build sẵn của v1 (LSTM_Py_Backend/lstm_service/dataset_*.npy), dùng khi
Data_Tung_Ho_Ma_Tran_Rong/ (Excel gốc) không còn trên máy.

Bối cảnh: dataset_X_past.npy là tensor sliding-window (N, 240, 44) đã fit
StandardScaler chung cho cả 16 hồ (artifacts/global_scaler.pkl, mean~0/std~1).
36 cột đầu (rain 18 + inflow 12 + reservoir 6) định nghĩa Y HỆT FEATURES của
LSTM_Py_Backend_v2/data/dataset_builder.py (đã verify std của cột 36-37
(et0/wind_speed) = 0 → 2 cột đó luôn = 0 ở bản build v1, không dùng được, sẽ
refetch mới từ Open-Meteo).

Windows của 1 hồ nằm liền khối trong dataset_rid.npy (đã verify: đúng 16 khối
liền nhau, mỗi khối ~34,777 window, sort theo thời gian, stride 1h). Cách
khôi phục chuỗi liên tục theo giờ:
  - Window đầu tiên của khối: lấy nguyên 240 bước hindcast (bootstrap).
  - Mỗi window sau: chỉ lấy bước hindcast CUỐI (index 239) — vì window[k]
    stride 1h so với window[k-1] nên bước cuối của window[k] = giờ mới duy
    nhất chưa xuất hiện ở window[k-1].
  - 24h cuối cùng của toàn bộ chuỗi (chưa từng là "bước cuối" của window nào
    vì không có window nào hind_end đủ xa) lấy từ y (target) của window cuối.
"""
import os
import joblib
import numpy as np
import pandas as pd

# Cột 0-based trong 44 features của v1 (xem lstm_service/data/dataset_builder.py::FEATURES)
COL_RAIN = 0
COL_INFLOW_SQRT = 18   # đã cap + sqrt theo INFLOW_CAPS_M3S (giống hệt giá trị v2 sẽ tự tính)
COL_WATER_LEVEL = 30
COL_OUTFLOW = 31

_CANDIDATE_V1_DIRS = [
    os.path.join("..", "LSTM_Py_Backend", "lstm_service"),
    os.path.join("LSTM_Py_Backend", "lstm_service"),
]


def _resolve_v1_dir() -> str:
    for p in _CANDIDATE_V1_DIRS:
        if os.path.exists(os.path.join(p, "dataset_X_past.npy")):
            return p
    raise FileNotFoundError(
        "Không tìm thấy LSTM_Py_Backend/lstm_service/dataset_X_past.npy — "
        "cần dataset v1 (X_past/rid/timestamps.npy + artifacts/global_scaler.pkl) "
        "để khôi phục dữ liệu thô."
    )


_cache = {}


def _load_v1_arrays():
    if "arrays" in _cache:
        return _cache["arrays"]
    v1_dir = _resolve_v1_dir()
    X_past = np.load(os.path.join(v1_dir, "dataset_X_past.npy"), mmap_mode="r")
    y_all  = np.load(os.path.join(v1_dir, "dataset_y.npy"), mmap_mode="r")
    rid_arr = np.load(os.path.join(v1_dir, "dataset_rid.npy"))
    ts_arr  = np.load(os.path.join(v1_dir, "dataset_timestamps.npy"), allow_pickle=True)
    scaler = joblib.load(os.path.join(v1_dir, "artifacts", "global_scaler.pkl"))
    _cache["arrays"] = (X_past, y_all, rid_arr, ts_arr, scaler)
    return _cache["arrays"]


def recover_raw_dataframe(idx: int) -> pd.DataFrame:
    """
    idx: chỉ số 0-15 (RESERVOIRS[rid]["idx"], KHÔNG phải rid) của hồ trong
    dataset_rid.npy của v1.

    Trả về DataFrame hourly liên tục: time | inflow (m3/s, đã cap theo
    INFLOW_CAPS_M3S) | rain (mm) | water_level (m) | outflow (m3/s).
    Cùng contract với data/rain_matrix_loader.py::load_inflow_rain_matrix().
    """
    X_past, y_all, rid_arr, ts_arr, scaler = _load_v1_arrays()

    block = np.where(rid_arr == idx)[0]
    if len(block) == 0:
        raise ValueError(f"idx={idx} không có trong dataset_rid.npy của v1")
    block.sort()
    # Verify liền khối (stride 1h) — cảnh báo nếu không (không nên xảy ra)
    if not np.array_equal(block, np.arange(block[0], block[-1] + 1)):
        raise RuntimeError(f"idx={idx}: windows không liền khối trong dataset_rid.npy — bỏ giả định stride 1h")

    n_hind = X_past.shape[1]  # 240

    # ── Bootstrap: nguyên window đầu tiên ───────────────────────────────────
    first_win = np.asarray(X_past[block[0]])                       # (240, 44)
    first_win_inv = scaler.inverse_transform(first_win)             # (240, 44) raw-ish

    # ── Mỗi window sau: chỉ lấy bước cuối (index n_hind-1) ─────────────────
    rest_idx = block[1:]
    if len(rest_idx) > 0:
        last_steps = np.asarray(X_past[rest_idx, n_hind - 1, :])    # (n_win-1, 44)
        last_steps_inv = scaler.inverse_transform(last_steps)
    else:
        last_steps_inv = np.zeros((0, X_past.shape[2]), dtype=np.float32)

    all_hind_rows = np.concatenate([first_win_inv, last_steps_inv], axis=0)  # (240 + n_win-1, 44)

    # ── Timestamps tương ứng ────────────────────────────────────────────────
    ts_block = ts_arr[block]                                        # (n_win,) = hind_end của mỗi window
    first_hind_end = pd.Timestamp(ts_block[0])
    hind_times = pd.date_range(end=first_hind_end - pd.Timedelta(hours=1), periods=n_hind, freq="h")
    rest_times = pd.to_datetime(ts_block[1:]) - pd.Timedelta(hours=1)
    all_times = hind_times.append(pd.DatetimeIndex(rest_times)) if len(rest_times) else hind_times

    # ── 24h cuối cùng: lấy từ y (target, sqrt-inflow space) của window cuối ─
    last_y = np.asarray(y_all[block[-1]])                           # (24,) sqrt-inflow, KHÔNG scale (y không qua global_scaler)
    tail_start = pd.Timestamp(ts_block[-1])
    tail_times = pd.date_range(start=tail_start, periods=len(last_y), freq="h")

    inflow_m3s = np.concatenate([all_hind_rows[:, COL_INFLOW_SQRT] ** 2, last_y ** 2])
    rain_mm    = np.concatenate([all_hind_rows[:, COL_RAIN], np.zeros(len(last_y), dtype=np.float32)])
    water_lvl  = np.concatenate([all_hind_rows[:, COL_WATER_LEVEL], np.full(len(last_y), np.nan, dtype=np.float32)])
    outflow    = np.concatenate([all_hind_rows[:, COL_OUTFLOW], np.full(len(last_y), np.nan, dtype=np.float32)])
    full_times = all_times.append(tail_times)

    df = pd.DataFrame({
        "time":        full_times,
        "inflow":      np.clip(inflow_m3s, 0, None),
        "rain":        np.clip(rain_mm, 0, None),
        "water_level": water_lvl,
        "outflow":     np.clip(outflow, 0, None),
    })
    df = df.drop_duplicates(subset="time").sort_values("time").reset_index(drop=True)
    return df
