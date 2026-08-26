# training/event_metrics.py
"""
Copy nguyen tu LSTM_Py_Backend_v2/training/event_metrics.py -- logic khong
phu thuoc model/framework, dung lai y het cho RF.
"""

import numpy as np


def nse_single(obs: np.ndarray, pred: np.ndarray) -> float:
    """NSE (Nash-Sutcliffe Efficiency) trên 1 mảng 1D đã flatten."""
    ss_res = float(np.sum((obs - pred) ** 2))
    ss_tot = float(np.sum((obs - obs.mean()) ** 2))
    if ss_tot < 1e-8:
        return float("nan")
    return 1.0 - ss_res / ss_tot


def kge_single(obs: np.ndarray, pred: np.ndarray) -> float:
    """KGE (Kling-Gupta Efficiency) tren 1 mang 1D -- bo sung cho NSE de
    tach ro loi do tuong quan (r), do lech bien thien (alpha), do lech
    trung binh (beta)."""
    obs_mean, pred_mean = obs.mean(), pred.mean()
    obs_std, pred_std = obs.std(), pred.std()
    if obs_std < 1e-8 or abs(obs_mean) < 1e-8 or pred_std < 1e-8:
        return float("nan")
    r = float(np.corrcoef(obs, pred)[0, 1])
    if np.isnan(r):
        return float("nan")
    alpha = pred_std / obs_std
    beta = pred_mean / obs_mean
    return 1.0 - float(np.sqrt((r - 1) ** 2 + (alpha - 1) ** 2 + (beta - 1) ** 2))


def r2_single(obs: np.ndarray, pred: np.ndarray) -> float:
    """Hệ số xác định R2 (Coefficient of Determination) giữa obs và pred."""
    ss_res = float(np.sum((obs - pred) ** 2))
    ss_tot = float(np.sum((obs - obs.mean()) ** 2))
    if ss_tot < 1e-8:
        return float("nan")
    return float(1.0 - ss_res / ss_tot)


def extract_lead_time_series(
    preds: np.ndarray,   # (N, T) point forecast, đơn vị gốc (m3/s)
    obs: np.ndarray,     # (N, T)
    lead_idx: int,       # 0-based: 0 = giờ thứ 1, 23 = giờ thứ 24, ...
):
    """Trích chuỗi liên tục obs/pred tại 1 lead-time cố định. Giả định test
    set sliding-window KHÔNG shuffle (đúng với cách build_tabular_dataset())."""
    return obs[:, lead_idx].copy(), preds[:, lead_idx].copy()


def nse_per_horizon(
    preds: np.ndarray,   # (N, T) point forecast (đơn vị gốc, không phải sqrt)
    obs: np.ndarray,     # (N, T)
    group_hours: int = 6,
) -> list:
    """NSE riêng cho từng nhóm lead-time (mặc định 6h/nhóm cho horizon 24h)."""
    N, T = preds.shape
    n_groups = (T + group_hours - 1) // group_hours
    results = []
    for g in range(n_groups):
        lo, hi = g * group_hours, min((g + 1) * group_hours, T)
        p = preds[:, lo:hi].reshape(-1)
        o = obs[:, lo:hi].reshape(-1)
        results.append({
            "group": g + 1,
            "hour_range": f"{lo + 1}-{hi}h",
            "nse": round(nse_single(o, p), 4),
            "n": int(p.size),
        })
    return results


def metrics_at_specific_horizons(
    preds: np.ndarray,   # (N, T) point forecast, m3/s
    obs: np.ndarray,     # (N, T)
    horizons: list = None,
) -> dict:
    """NSE, RMSE, MAE, RSE riêng cho từng mốc: 3h, 6h, 12h, 24h, 3d, 7d."""
    if horizons is None:
        horizons = [3, 6, 12, 24, 72, 168]

    horizon_labels = {3: "3h", 6: "6h", 12: "12h", 24: "24h", 72: "3d", 168: "7d"}

    results = {}
    N, T = preds.shape
    for h in horizons:
        label = horizon_labels.get(h, f"{h}h")
        idx = min(h - 1, T - 1)
        if idx >= 0:
            o_h = obs[:, idx]
            p_h = preds[:, idx]
            ss_res = float(np.sum((o_h - p_h) ** 2))
            ss_tot = float(np.sum((o_h - o_h.mean()) ** 2))
            nse_h = 1.0 - ss_res / ss_tot if ss_tot >= 1e-8 else float("nan")
            rmse_h = float(np.sqrt(np.mean((o_h - p_h) ** 2)))
            mae_h = float(np.mean(np.abs(o_h - p_h)))
            rse_h = float(ss_res / max(ss_tot, 1e-8))
            results[label] = {
                "nse": round(nse_h, 4), "rmse": round(rmse_h, 2),
                "mae": round(mae_h, 2), "rse": round(rse_h, 4),
            }
    return results


def picp(obs: np.ndarray, pred_low: np.ndarray, pred_high: np.ndarray) -> dict:
    """PICP (Prediction Interval Coverage Probability) -- ty le % thoi diem
    gia tri thuc te nam trong [pred_low, pred_high] (vd P10-P90). Ly tuong
    PICP ~ 0.80 voi P10/P90 -- khong phai 1.0."""
    obs = np.asarray(obs)
    pred_low = np.asarray(pred_low)
    pred_high = np.asarray(pred_high)
    inside = (obs >= pred_low) & (obs <= pred_high)
    width = pred_high - pred_low
    return {
        "picp": round(float(inside.mean()), 4),
        "mean_interval_width": round(float(width.mean()), 2),
    }


def detect_flood_events(
    obs: np.ndarray,
    threshold: float,
    min_separation: int = 24,
) -> list:
    """Tách các trận lũ riêng lẻ khỏi 1 chuỗi quan trắc liên tục."""
    T = len(obs)
    candidate = np.where(obs >= threshold)[0]
    if len(candidate) == 0:
        return []

    peak_indices = []
    i = 0
    while i < len(candidate):
        j = i
        while j + 1 < len(candidate) and candidate[j + 1] - candidate[j] <= min_separation:
            j += 1
        segment = candidate[i:j + 1]
        peak_indices.append(int(segment[np.argmax(obs[segment])]))
        i = j + 1

    events = []
    for peak_idx in peak_indices:
        start = peak_idx
        while start > 0 and obs[start - 1] <= obs[start]:
            start -= 1
        end = peak_idx
        while end + 1 < T and obs[end + 1] <= obs[end]:
            end += 1
        events.append({"start": start, "peak": peak_idx, "end": end})
    return events


def flood_event_diagnostics(
    obs: np.ndarray,
    pred: np.ndarray,
    threshold: float,
    min_separation: int = 24,
    peak_re_tolerance: float = 0.2,
) -> dict:
    """Chẩn đoán từng trận lũ riêng lẻ (NSE + sai số đỉnh + QA pass rate)."""
    events = detect_flood_events(obs, threshold, min_separation)
    if not events:
        return {
            "n_events": 0, "mean_event_nse": float("nan"),
            "peak_re_mean": float("nan"), "qa_pass_rate": float("nan"),
            "events": [],
        }

    details = []
    for ev in events:
        s, p, e = ev["start"], ev["peak"], ev["end"]
        o_seg = obs[s:e + 1]
        p_seg = pred[s:e + 1]
        ev_nse = nse_single(o_seg, p_seg)

        obs_peak = float(obs[p])
        pred_peak_in_window = float(p_seg.max()) if len(p_seg) else float("nan")
        re = abs(pred_peak_in_window - obs_peak) / max(obs_peak, 1e-6)

        details.append({
            "start": s, "peak": p, "end": e,
            "obs_peak": round(obs_peak, 2),
            "pred_peak": round(pred_peak_in_window, 2),
            "peak_re": round(re, 4),
            "event_nse": round(ev_nse, 4) if not np.isnan(ev_nse) else None,
            "qa_pass": bool(re < peak_re_tolerance),
        })

    valid_nse = [d["event_nse"] for d in details if d["event_nse"] is not None]
    return {
        "n_events": len(details),
        "mean_event_nse": round(float(np.mean(valid_nse)), 4) if valid_nse else float("nan"),
        "peak_re_mean": round(float(np.mean([d["peak_re"] for d in details])), 4),
        "qa_pass_rate": round(float(np.mean([d["qa_pass"] for d in details])), 4),
        "events": details,
    }
