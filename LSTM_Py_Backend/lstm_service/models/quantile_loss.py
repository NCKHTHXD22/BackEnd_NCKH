import torch


def quantile_loss(preds, target, qs):
    """
    Hybrid Loss: Quantile Loss + Peak-Weighted MSE for maximum NSE performance.
    Optimized for hydrological forecasting.
    """
    if not isinstance(qs, torch.Tensor):
        qs = torch.tensor(qs, device=preds.device)
        
    errors = target.unsqueeze(-1) - preds # (B, T, Q)
    q_loss = torch.max((qs - 1) * errors, qs * errors)
    
    # 1. Balanced Quantile Loss
    # Reduce P50 bias from 2.0 to 1.2 to allow P10 and P90 to diverge and capture uncertainty.
    p50_bias = torch.ones_like(q_loss)
    p50_bias[:, :, 1] *= 1.2 
    q_loss = q_loss * p50_bias

    # 2. Stable Peak-Aware MSE on P50 (Median)
    # Using sqrt(target) instead of target**2 to avoid extreme gradients that cause mode collapse.
    median_preds = preds[:, :, 1]
    
    # Weight favors high inflow values but in a more stable way.
    peak_weights = torch.sqrt(target + 1.0) / (torch.sqrt(target + 1.0).mean() + 1e-8)
    peak_weights = peak_weights.clamp(max=5.0) # Lower clamp to prevent overpowering quantiles
    
    mse_loss = (peak_weights * (median_preds - target)**2).mean()

    # 3. Horizon Decay
    # Give slightly more weight to immediate steps (0 to 6h)
    horizon_weights = torch.exp(
        -0.02 * torch.arange(preds.shape[1], device=preds.device)
    )

    weighted_q_loss = (q_loss * horizon_weights.unsqueeze(0).unsqueeze(-1)).mean()
    
    # Combined Loss: 80% Quantile (Uncertainty), 20% Peak-Aware MSE (Accuracy)
    # This ratio helps prevent the quantiles from collapsing into the median.
    total_loss = 0.8 * weighted_q_loss + 0.2 * mse_loss

    return total_loss