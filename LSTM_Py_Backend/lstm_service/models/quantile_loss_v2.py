"""
Loss function cho FloodLSTM v2 — 7 quantiles, 7-day horizon.

Thành phần:
  1. Weighted Pinball Loss     — quantile regression chuẩn, 7 quantiles
  2. Peak-Aware MSE on P50    — ưu tiên đỉnh lũ, tránh mode collapse
  3. Horizon Decay            — bước gần hơn được weight cao hơn
  4. Coverage Bonus           — khuyến khích P5-P95 bao phủ thực tế

So với quantile_loss.py (v1):
  - Hỗ trợ arbitrary quantile list (không hardcode 3 quantiles)
  - Coverage bonus mới: phạt khi target nằm ngoài [P5, P95]
  - P50 bias nhỏ hơn (1.1 vs 1.2) vì đã có nhiều quantile hơn
"""

import torch


def quantile_loss_v2(
    preds: torch.Tensor,        # (B, T, NQ) — sqrt space, sorted
    targets: torch.Tensor,      # (B, T)     — sqrt space
    quantiles: list,            # [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
    horizon_decay: float = 0.015,
    coverage_weight: float = 0.05,
    peak_weight: float = 0.15,
) -> torch.Tensor:
    """
    Args:
        preds          : (B, T, NQ) model output trong sqrt space
        targets        : (B, T) ground truth trong sqrt space
        quantiles      : danh sách quantile levels
        horizon_decay  : tốc độ giảm weight theo horizon (nhỏ hơn v1 vì horizon dài hơn)
        coverage_weight: trọng số coverage bonus
        peak_weight    : trọng số peak-aware MSE

    Returns:
        scalar loss
    """
    device = preds.device
    B, T, NQ = preds.shape
    med_idx = len(quantiles) // 2  # index của P50

    qs = torch.tensor(quantiles, dtype=torch.float32, device=device)  # (NQ,)

    # ── 1. Pinball (Quantile) Loss ─────────────────────────────────────────────
    err = targets.unsqueeze(-1) - preds          # (B, T, NQ)
    # pinball: max(q*e, (q-1)*e) — asymmetric L1
    pinball = torch.max(qs * err, (qs - 1.0) * err)  # (B, T, NQ)

    # Nhẹ tay boost P50 (1.1x) để tránh median collapse
    p50_bias = torch.ones(NQ, device=device)
    p50_bias[med_idx] = 1.1
    pinball = pinball * p50_bias.view(1, 1, -1)

    # ── 2. Horizon Decay ───────────────────────────────────────────────────────
    # Với horizon 168h, decay chậm hơn (0.015 vs 0.02 trong v1)
    # Bước 0-24h weight ~2x so với bước 144-168h
    t_weights = torch.exp(
        -horizon_decay * torch.arange(T, dtype=torch.float32, device=device)
    )
    t_weights = t_weights / t_weights.sum()  # normalize → tổng = 1

    # Weighted pinball
    w_pinball = (pinball * t_weights.view(1, -1, 1)).sum(dim=1)  # (B, NQ)
    pinball_loss = w_pinball.mean()

    # ── 3. Peak-Aware MSE on P50 ───────────────────────────────────────────────
    # sqrt(Q+1) weighting — ổn định hơn Q² weighting
    median_pred = preds[:, :, med_idx]  # (B, T)
    peak_w = torch.sqrt(targets + 1.0)
    peak_w = peak_w / (peak_w.mean() + 1e-8)
    peak_w = peak_w.clamp(max=5.0)

    mse_peak = (peak_w * (median_pred - targets) ** 2)
    # Horizon decay cũng áp dụng cho MSE
    mse_peak = (mse_peak * t_weights.view(1, -1)).sum(dim=1).mean()

    # ── 4. Coverage Bonus ─────────────────────────────────────────────────────
    # Phạt khi target nằm ngoài [P5, P95]
    # Khuyến khích model có khoảng tin cậy thực sự bao phủ thực tế
    p_low  = preds[:, :, 0]   # P5  (B, T)
    p_high = preds[:, :, -1]  # P95 (B, T)
    below = F.relu(p_low  - targets)  # target < P5  → penalty
    above = F.relu(targets - p_high)  # target > P95 → penalty
    coverage_loss = (
        (below * t_weights.view(1, -1)).sum(dim=1).mean() +
        (above * t_weights.view(1, -1)).sum(dim=1).mean()
    )

    # ── Combine ────────────────────────────────────────────────────────────────
    total = (
        (1.0 - peak_weight - coverage_weight) * pinball_loss
        + peak_weight   * mse_peak
        + coverage_weight * coverage_loss
    )
    return total


# Cần import F từ đây để coverage bonus hoạt động
import torch.nn.functional as F
