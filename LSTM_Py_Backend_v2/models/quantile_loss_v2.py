# models/quantile_loss_v2.py
"""
Loss function cho ReservoirLSTM — copy từ lstm_service/models/quantile_loss_v2.py
(logic không phụ thuộc số hồ, giữ nguyên).

Thành phần:
  1. Weighted Pinball Loss  — quantile regression chuẩn, 7 quantiles
  2. Peak-Aware MSE on P50  — ưu tiên đỉnh lũ, tránh mode collapse
  3. Horizon Decay          — bước gần hơn được weight cao hơn
  4. Coverage Bonus         — khuyến khích P5-P95 bao phủ thực tế
"""

import torch
import torch.nn.functional as F


def quantile_loss_v2(
    preds: torch.Tensor,        # (B, T, NQ) — sqrt space, sorted
    targets: torch.Tensor,      # (B, T)     — sqrt space
    quantiles: list,
    horizon_decay: float = 0.02,     # decay nhanh hơn bản 168h vì forecast_len ngắn (24h mặc định)
    coverage_weight: float = 0.05,
    peak_weight: float = 0.15,
) -> torch.Tensor:
    device = preds.device
    B, T, NQ = preds.shape
    med_idx = len(quantiles) // 2

    qs = torch.tensor(quantiles, dtype=torch.float32, device=device)

    # ── 1. Pinball (Quantile) Loss ─────────────────────────────────────────────
    err = targets.unsqueeze(-1) - preds
    pinball = torch.max(qs * err, (qs - 1.0) * err)

    p50_bias = torch.ones(NQ, device=device)
    p50_bias[med_idx] = 1.1
    pinball = pinball * p50_bias.view(1, 1, -1)

    # ── 2. Horizon Decay ───────────────────────────────────────────────────────
    t_weights = torch.exp(-horizon_decay * torch.arange(T, dtype=torch.float32, device=device))
    t_weights = t_weights / t_weights.sum()

    pinball_loss = (pinball * t_weights.view(1, -1, 1)).sum(dim=1).mean()

    # ── 3. Peak-Aware MSE on P50 ───────────────────────────────────────────────
    median_pred = preds[:, :, med_idx]
    peak_w = torch.sqrt(targets + 1.0)
    peak_w = peak_w / (peak_w.mean() + 1e-8)
    peak_w = peak_w.clamp(max=5.0)

    mse_peak = (peak_w * (median_pred - targets) ** 2)
    mse_peak = (mse_peak * t_weights.view(1, -1)).sum(dim=1).mean()

    # ── 4. Coverage Bonus ─────────────────────────────────────────────────────
    p_low  = preds[:, :, 0]
    p_high = preds[:, :, -1]
    below = F.relu(p_low  - targets)
    above = F.relu(targets - p_high)
    coverage_loss = (
        (below * t_weights.view(1, -1)).sum(dim=1).mean() +
        (above * t_weights.view(1, -1)).sum(dim=1).mean()
    )

    total = (
        (1.0 - peak_weight - coverage_weight) * pinball_loss
        + peak_weight * mse_peak
        + coverage_weight * coverage_loss
    )
    return total
