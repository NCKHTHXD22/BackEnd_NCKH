"""
evaluate.py  –  Metrics cho hydrological forecasting
------------------------------------------------------
Tất cả metrics tính trên P50 (median) sau inverse sqrt transform.
"""

import torch
import numpy as np


def compute_metrics(preds: torch.Tensor,
                    targets: torch.Tensor,
                    med_idx: int = 1) -> tuple[float, float, float]:
    """
    preds  : (N, T, Q)  –  quantile predictions trong sqrt space
    targets: (N, T)     –  ground truth trong sqrt space
    Returns: (MAE, RMSE, NSE) trong original space (m³/s)
    """
    preds_med = preds[:, :, med_idx]         # (N, T)

    # Inverse sqrt transform: Q = x²
    preds_raw   = preds_med ** 2
    targets_raw = targets ** 2

    mae  = torch.mean(torch.abs(preds_raw - targets_raw)).item()
    rmse = torch.sqrt(torch.mean((preds_raw - targets_raw) ** 2)).item()

    mean_obs = torch.mean(targets_raw)
    ss_res   = torch.sum((targets_raw - preds_raw) ** 2)
    ss_tot   = torch.sum((targets_raw - mean_obs) ** 2)
    nse      = (1.0 - ss_res / (ss_tot + 1e-8)).item()

    return mae, rmse, nse


def compute_coverage(preds: torch.Tensor,
                     targets: torch.Tensor,
                     lo_idx: int = 0,
                     hi_idx: int = 2) -> float:
    """
    % mẫu mà ground truth nằm trong [P10, P90] interval.
    Một model tốt nên có coverage ~ 80%.
    """
    lo = preds[:, :, lo_idx] ** 2  # inverse sqrt → m³/s
    hi = preds[:, :, hi_idx] ** 2
    tg = targets ** 2
    inside = ((tg >= lo) & (tg <= hi)).float()
    return inside.mean().item() * 100.0


def peak_capture_rate(preds: torch.Tensor,
                      targets: torch.Tensor,
                      percentile: float = 90.0,
                      med_idx: int = 1) -> float:
    """
    Trong số các mẫu có peak > p{percentile},
    tính % mà P50 nằm trong 50% của giá trị đỉnh thực.
    """
    preds_raw   = preds[:, :, med_idx] ** 2      # (N, T)
    targets_raw = targets ** 2

    peak_pred = preds_raw.max(dim=1).values       # (N,)
    peak_tgt  = targets_raw.max(dim=1).values

    thr = float(np.percentile(peak_tgt.numpy(), percentile))
    mask = peak_tgt >= thr
    if mask.sum() == 0:
        return 0.0

    ratio = peak_pred[mask] / (peak_tgt[mask] + 1e-8)
    captured = ((ratio >= 0.5) & (ratio <= 2.0)).float()
    return captured.mean().item() * 100.0


def full_report(preds: torch.Tensor,
                targets: torch.Tensor,
                name: str) -> dict:
    """Tính đầy đủ metrics và in ra màn hình."""
    mae, rmse, nse = compute_metrics(preds, targets)
    coverage       = compute_coverage(preds, targets)
    pcr            = peak_capture_rate(preds, targets)

    print(f"\n  [{name}] Test Metrics:")
    print(f"    NSE           : {nse:.4f}  (target > 0.85)")
    print(f"    MAE  (m³/s)  : {mae:.2f}")
    print(f"    RMSE (m³/s)  : {rmse:.2f}")
    print(f"    [P10,P90] coverage: {coverage:.1f}%  (target ~ 80%)")
    print(f"    Peak capture rate : {pcr:.1f}%  (target > 85%)")

    return dict(name=name, nse=nse, mae=mae, rmse=rmse,
                coverage=coverage, peak_capture_rate=pcr)
