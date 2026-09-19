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
    obs_mask: torch.Tensor | None = None,   # (B, T) bool
) -> torch.Tensor:
    """
    obs_mask: True = bước giờ này là nhãn quan trắc THẬT (không phải đoạn nội
    suy tuyến tính giả có sẵn trong Excel gốc — xem data/dataset_builder.py::
    v2_obs_mask.npy, ARIMAX/arimax_regional/qc.py). Khi truyền vào, trọng số
    horizon_decay bị đặt về 0 tại các bước nội suy rồi RENORMALIZE lại theo
    từng mẫu để tổng trọng số vẫn = 1 — tránh model học theo đường thẳng giả.
    Mẫu nào cả forecast_len giờ đều là nội suy (không có nhãn thật nào) sẽ bị
    loại khỏi batch loss (đóng góp 0). None (hoặc dataset chưa có obs_mask) ->
    hành vi CŨ, tính loss trên mọi bước như trước.
    """
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

    # ── 2. Horizon Decay (+ loại bước nội suy giả nếu có obs_mask) ─────────────
    base_w = torch.exp(-horizon_decay * torch.arange(T, dtype=torch.float32, device=device))
    if obs_mask is not None:
        w = base_w.view(1, -1) * obs_mask.float()          # (B, T)
        denom = w.sum(dim=1, keepdim=True)
        has_label = denom.squeeze(-1) > 0                   # (B,) mẫu có ít nhất 1 nhãn thật
        w = w / denom.clamp_min(1e-8)                        # tổng=1/mẫu (0 nếu mẫu không có nhãn thật)
    else:
        w = (base_w / base_w.sum()).view(1, -1).expand(B, -1)
        has_label = torch.ones(B, dtype=torch.bool, device=device)

    def _mean_over_valid(per_sample: torch.Tensor) -> torch.Tensor:
        return per_sample[has_label].mean() if has_label.any() else per_sample.mean()

    pinball_per_sample = (pinball * w.unsqueeze(-1)).sum(dim=1).mean(dim=1)   # (B,)
    pinball_loss = _mean_over_valid(pinball_per_sample)

    # ── 3. Peak-Aware MSE on P50 ───────────────────────────────────────────────
    median_pred = preds[:, :, med_idx]
    peak_w = torch.sqrt(targets + 1.0)
    peak_w = peak_w / (peak_w.mean() + 1e-8)
    peak_w = peak_w.clamp(max=5.0)

    mse_peak = (peak_w * (median_pred - targets) ** 2)
    mse_peak_per_sample = (mse_peak * w).sum(dim=1)                            # (B,)
    mse_peak_loss = _mean_over_valid(mse_peak_per_sample)

    # ── 4. Coverage Bonus ─────────────────────────────────────────────────────
    p_low  = preds[:, :, 0]
    p_high = preds[:, :, -1]
    below = F.relu(p_low  - targets)
    above = F.relu(targets - p_high)
    coverage_per_sample = (below * w).sum(dim=1) + (above * w).sum(dim=1)      # (B,)
    coverage_loss = _mean_over_valid(coverage_per_sample)

    total = (
        (1.0 - peak_weight - coverage_weight) * pinball_loss
        + peak_weight * mse_peak_loss
        + coverage_weight * coverage_loss
    )
    return total
