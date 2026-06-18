"""
Evaluation metrics cho HueLSTM.

Theo Google Flood Forecasting (evaluation/metrics.py):
  - NSE (Nash-Sutcliffe Efficiency) — tiêu chuẩn vàng thủy văn
  - KGE (Kling-Gupta Efficiency)    — cân bằng bias, correlation, variability
  - CRPS (Continuous Ranked Probability Score) — đánh giá probabilistic forecast
  - Peak metrics — quan trọng cho flood forecasting

Note: Google tính metrics per basin rồi aggregate.
Ta làm tương tự: per hồ rồi average.
"""

import numpy as np
import torch
from typing import Optional


def nse(pred: np.ndarray, obs: np.ndarray) -> float:
    """Nash-Sutcliffe Efficiency. Range (-∞, 1]. 1 = perfect."""
    ss_res = ((obs - pred) ** 2).sum()
    ss_tot = ((obs - obs.mean()) ** 2).sum()
    if ss_tot < 1e-8:
        return float("nan")
    return float(1.0 - ss_res / ss_tot)


def kge(pred: np.ndarray, obs: np.ndarray) -> float:
    """
    Kling-Gupta Efficiency. Range (-∞, 1]. 1 = perfect.
    KGE = 1 - sqrt((r-1)² + (alpha-1)² + (beta-1)²)
    r = Pearson correlation, alpha = std ratio, beta = mean ratio
    """
    if obs.std() < 1e-8 or pred.std() < 1e-8:
        return float("nan")
    r = float(np.corrcoef(pred, obs)[0, 1])
    alpha = pred.std() / obs.std()
    beta  = pred.mean() / (obs.mean() + 1e-8)
    return float(1.0 - np.sqrt((r - 1) ** 2 + (alpha - 1) ** 2 + (beta - 1) ** 2))


def crps_quantile(
    preds_q: np.ndarray,  # (N, T, Q) quantile forecasts
    obs: np.ndarray,      # (N, T)
    quantiles: list,
) -> float:
    """
    CRPS approximation via quantile scores (pinball loss average).
    Theo Google evaluation/metrics.py — dùng trapezoidal approximation.
    Range [0, ∞). 0 = perfect deterministic.
    """
    qs = np.array(quantiles)
    err = obs[:, :, None] - preds_q            # (N, T, Q)
    pinball = np.where(err >= 0, qs * err, (qs - 1) * err)  # (N, T, Q)
    # Trapezoidal integration over quantile dimension (approximate CRPS)
    crps_val = 2.0 * np.trapz(pinball.mean(axis=(0, 1)), qs)
    return float(crps_val)


def winkler_score(
    lower: np.ndarray,  # (N, T) P5 predictions
    upper: np.ndarray,  # (N, T) P95 predictions
    obs: np.ndarray,    # (N, T)
    alpha: float = 0.10,  # 1 - confidence level (90% → alpha=0.10)
) -> float:
    """
    Winkler score cho 90% prediction interval [P5, P95].
    Penalizes: large intervals + observations outside interval.
    Smaller is better.
    """
    width = upper - lower
    below = np.maximum(lower - obs, 0)
    above = np.maximum(obs - upper, 0)
    score = width + (2.0 / alpha) * (below + above)
    return float(score.mean())


def peak_nse(pred: np.ndarray, obs: np.ndarray, top_pct: float = 0.05) -> float:
    """
    NSE chỉ trên các đỉnh lũ (top 5% giá trị quan trắc).
    Quan trọng hơn overall NSE cho flood forecasting.
    """
    threshold = np.percentile(obs, (1 - top_pct) * 100)
    mask = obs >= threshold
    if mask.sum() < 2:
        return float("nan")
    return nse(pred[mask], obs[mask])


def compute_all_metrics(
    preds_q: torch.Tensor,    # (N, T, Q) — sqrt space
    targets: torch.Tensor,    # (N, T) — sqrt space
    basin_ids: torch.Tensor,  # (N,)
    quantiles: list,
    basin_names: dict = None,
) -> dict:
    """
    Tính đầy đủ metrics per basin + overall.
    Inverse sqrt transform (Q = x²) trước khi tính.
    """
    preds_q  = preds_q.cpu().numpy()
    targets  = targets.cpu().numpy()
    basin_ids = basin_ids.cpu().numpy()

    med_idx = len(quantiles) // 2
    pred_med = preds_q[:, :, med_idx]

    # Inverse transform
    pred_raw   = pred_med ** 2
    target_raw = targets ** 2
    preds_q_raw = preds_q ** 2

    results = {}
    overall_nse, overall_kge = [], []

    for bid in np.unique(basin_ids):
        mask = (basin_ids == bid)
        p = pred_raw[mask]
        t = target_raw[mask]
        pq = preds_q_raw[mask]

        p_flat = p.flatten()
        t_flat = t.flatten()

        nse_v   = nse(p_flat, t_flat)
        kge_v   = kge(p_flat, t_flat)
        crps_v  = crps_quantile(pq, t, quantiles)
        pnse_v  = peak_nse(p_flat, t_flat)
        wink_v  = winkler_score(pq[:, :, 0].flatten(), pq[:, :, -1].flatten(), t_flat)
        mae_v   = float(np.mean(np.abs(p_flat - t_flat)))
        rmse_v  = float(np.sqrt(np.mean((p_flat - t_flat) ** 2)))

        name = (basin_names or {}).get(int(bid), f"basin_{bid}")
        results[name] = {
            "nse":      round(nse_v,  4),
            "kge":      round(kge_v,  4),
            "crps":     round(crps_v, 4),
            "peak_nse": round(pnse_v, 4),
            "winkler90": round(wink_v, 2),
            "mae_m3s":  round(mae_v,  2),
            "rmse_m3s": round(rmse_v, 2),
        }
        if not np.isnan(nse_v):
            overall_nse.append(nse_v)
        if not np.isnan(kge_v):
            overall_kge.append(kge_v)

    p_all = pred_raw.flatten()
    t_all = target_raw.flatten()
    results["__overall__"] = {
        "nse":      round(float(np.mean(overall_nse)), 4) if overall_nse else float("nan"),
        "kge":      round(float(np.mean(overall_kge)), 4) if overall_kge else float("nan"),
        "mae_m3s":  round(float(np.mean(np.abs(p_all - t_all))), 2),
        "rmse_m3s": round(float(np.sqrt(np.mean((p_all - t_all) ** 2))), 2),
        "crps":     round(crps_quantile(preds_q_raw, target_raw, quantiles), 4),
    }

    return results
