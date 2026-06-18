"""
loss.py  –  Hybrid Quantile Loss
---------------------------------
Copy từ models/quantile_loss.py gốc, không thay đổi logic.

Components:
  1. Balanced Quantile (Pinball) Loss  – P50 bias x1.2
  2. Peak-Aware MSE on Median          – sqrt(target+1) weight, clamped
  3. Horizon Decay                     – exp(-0.02*t)

Công thức: 0.8 × quantile + 0.2 × peak_mse
"""

import torch


def quantile_loss(preds: torch.Tensor,
                  target: torch.Tensor,
                  qs: list | torch.Tensor) -> torch.Tensor:
    """
    preds  : (B, T, Q)  –  predicted quantiles trong sqrt space
    target : (B, T)     –  ground truth trong sqrt space
    qs     : list of quantile levels, e.g. [0.1, 0.5, 0.9]
    """
    if not isinstance(qs, torch.Tensor):
        qs = torch.tensor(qs, device=preds.device, dtype=preds.dtype)

    errors = target.unsqueeze(-1) - preds          # (B, T, Q)
    q_loss = torch.max((qs - 1) * errors, qs * errors)

    # 1. P50 bias: giảm thiên lệch về median, cho phép P10/P90 phân kỳ
    p50_bias = torch.ones_like(q_loss)
    p50_bias[:, :, 1] *= 1.2
    q_loss = q_loss * p50_bias

    # 2. Peak-Aware MSE trên median
    median_preds = preds[:, :, 1]
    peak_w = torch.sqrt(target + 1.0)
    peak_w = peak_w / (peak_w.mean() + 1e-8)
    peak_w = peak_w.clamp(max=5.0)
    mse_loss = (peak_w * (median_preds - target) ** 2).mean()

    # 3. Horizon Decay: trọng số giảm dần theo độ trễ dự báo
    hw = torch.exp(
        -0.02 * torch.arange(preds.shape[1], device=preds.device, dtype=preds.dtype)
    )
    weighted_q = (q_loss * hw.unsqueeze(0).unsqueeze(-1)).mean()

    return 0.8 * weighted_q + 0.2 * mse_loss
