# training/event_metrics.py
"""
Chẩn đoán bổ sung cho đánh giá test — lấy cảm hứng từ get_peak() trong
repo tham khảo CNN-LSTM-Attention-Model-for-Runoff-Prediction
(aba-hash/CNN-LSTM-Attention-Model-for-Runoff-Prediction, data_processing.py).

Hai điểm hiện train_global.py / train_v2.py CHƯA có:

  1. nse_per_horizon()
     NSE hiện tại tính gộp trên cả HORIZON giờ dự báo cùng lúc.
     Không biết mô hình đáng tin đến ngày mấy — NSE ngày 1 và ngày 7 có
     thể chênh lệch rất lớn. Hàm này tách NSE riêng cho từng nhóm lead-time
     (mặc định gộp 24h = 1 ngày dự báo).

  2. detect_flood_events() + flood_event_diagnostics()
     peak_nse hiện tại (nếu có) gộp chung top-N% TOÀN BỘ timestep của tập
     test — không biết TRẬN LŨ CỤ THỂ nào bị lệch đỉnh/lệch thời gian.
     Hàm này tách từng trận lũ riêng lẻ (rise → peak → fall) theo chuỗi
     quan trắc, rồi tính NSE + sai số tương đối (RE) của đỉnh CHO TỪNG TRẬN
     — giống get_peak() gốc nhưng không phụ thuộc matplotlib (backend không
     có GUI) và không có vòng lặp while dễ treo/tràn chỉ số như bản gốc.

Chỉ dùng ở bước đánh giá test cuối (không dùng trong vòng lặp training vì
event detection tốn hơn NSE thường và cần chuỗi liên tục theo thời gian).
"""

import numpy as np


def nse_single(obs: np.ndarray, pred: np.ndarray) -> float:
    """NSE (Nash-Sutcliffe Efficiency) trên 1 mảng 1D đã flatten."""
    ss_res = float(np.sum((obs - pred) ** 2))
    ss_tot = float(np.sum((obs - obs.mean()) ** 2))
    if ss_tot < 1e-8:
        return float("nan")
    return 1.0 - ss_res / ss_tot


def extract_lead_time_series(
    preds: np.ndarray,   # (N, T) point forecast, đơn vị gốc (m3/s)
    obs: np.ndarray,     # (N, T)
    lead_idx: int,       # 0-based: 0 = giờ thứ 1, 23 = giờ thứ 24, ...
):
    """
    Trích chuỗi liên tục obs/pred tại 1 lead-time cố định từ tập test dạng
    sliding-window (N cửa sổ x T giờ dự báo).

    Giả định: preds/obs được sắp theo thời gian bắt đầu cửa sổ TĂNG DẦN và
    KHÔNG shuffle (đúng với val_loader/test_loader hiện tại: shuffle=False)
    — nên obs[:, lead_idx] xấp xỉ 1 chuỗi quan trắc liên tục theo giờ.
    """
    return obs[:, lead_idx].copy(), preds[:, lead_idx].copy()


def nse_per_horizon(
    preds: np.ndarray,   # (N, T) point forecast (đơn vị gốc, không phải sqrt)
    obs: np.ndarray,     # (N, T)
    group_hours: int = 24,
) -> list:
    """
    NSE riêng cho từng nhóm lead-time.

    Trả về list dict, vd với T=168, group_hours=24 → 7 nhóm (ngày 1..7):
        [{"day": 1, "hour_range": "1-24h", "nse": 0.91, "n": 12345}, ...]
    """
    N, T = preds.shape
    n_groups = (T + group_hours - 1) // group_hours
    results = []
    for g in range(n_groups):
        lo, hi = g * group_hours, min((g + 1) * group_hours, T)
        p = preds[:, lo:hi].reshape(-1)
        o = obs[:, lo:hi].reshape(-1)
        results.append({
            "day": g + 1,
            "hour_range": f"{lo + 1}-{hi}h",
            "nse": round(nse_single(o, p), 4),
            "n": int(p.size),
        })
    return results


def detect_flood_events(
    obs: np.ndarray,          # (T,) chuỗi quan trắc liên tục (1 lead-time cố định)
    threshold: float,         # ngưỡng để coi là "trận lũ" (vd percentile 90 hoặc ngưỡng vật lý)
    min_separation: int = 24, # số bước tối thiểu giữa 2 đỉnh để tính là 2 trận khác nhau
) -> list:
    """
    Tách các trận lũ riêng lẻ khỏi 1 chuỗi quan trắc liên tục.

    Mỗi trận = {"start", "peak", "end"} bao quanh 1 đỉnh cục bộ vượt threshold.
    Đơn giản và có giới hạn chỉ số rõ ràng hơn get_peak() gốc (bản gốc dùng
    while-loop có thể tràn chỉ số / treo trên dữ liệu biên).
    """
    T = len(obs)
    candidate = np.where(obs >= threshold)[0]
    if len(candidate) == 0:
        return []

    # Gom các điểm vượt ngưỡng gần nhau thành từng cụm, mỗi cụm → 1 đỉnh
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
    obs: np.ndarray,             # (T,) chuỗi quan trắc liên tục tại 1 lead-time
    pred: np.ndarray,            # (T,) chuỗi dự báo liên tục, cùng lead-time
    threshold: float,
    min_separation: int = 24,
    peak_re_tolerance: float = 0.2,
) -> dict:
    """
    Chẩn đoán từng trận lũ riêng lẻ — lấy cảm hứng từ get_peak() trong
    CNN-LSTM-Attention-Model-for-Runoff-Prediction/data_processing.py:
      - Tách trận lũ theo OBS (không theo pred, để không thiên vị)
      - Mỗi trận: NSE riêng của đoạn rise→fall + sai số tương đối (RE) của đỉnh
      - QA = tỉ lệ trận có RE < peak_re_tolerance (mặc định 20%, giống bản gốc)

    Khác get_peak() gốc: không vẽ hình (backend không có GUI), trả về dict
    có cấu trúc để log/lưu JSON hoặc Excel.
    """
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
