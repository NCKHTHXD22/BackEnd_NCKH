import torch
import torch.nn.functional as F


def quantile_loss(preds, target, qs):
    """
    Hybrid Loss: Quantile Loss + Peak-Weighted MSE for maximum NSE performance.
    Optimized for hydrological forecasting.
    """
    if not isinstance(qs, torch.Tensor):
        qs = torch.tensor(qs, device=preds.device)
        
    errors = target.unsqueeze(-1) - preds # (B, T, Q)
    q_loss = torch.max((qs - 1) * errors, qs * errors)
    
    # 1. Priority on P50 (Median)
    p50_bias = torch.ones_like(q_loss)
    p50_bias[:, :, 1] *= 2.0 # Increased priority for NSE
    q_loss = q_loss * p50_bias

    # 2. Peak-Weighted MSE on P50 (Median)
    # Why? NSE is highly sensitive to large errors in peak values.
    # We weight the MSE by the target value to force the model to fit peaks better.
    median_preds = preds[:, :, 1]
    
    # Weight favors high inflow values (peaks)
    # Using exp weighting to really emphasize the floods
    peak_weights = torch.exp(target) / torch.exp(target).mean()
    
    mse_loss = (peak_weights * (median_preds - target)**2).mean()

    # 3. Horizon Decay
    # Future steps are harder; we give slightly more weight to immediate steps
    horizon_weights = torch.exp(
        -0.03 * torch.arange(preds.shape[1], device=preds.device)
    )

    weighted_q_loss = (q_loss * horizon_weights.unsqueeze(0).unsqueeze(-1)).mean()
    
    # Combined Loss: 60% Quantile (Uncertainty), 40% NSE-targeted MSE
    total_loss = 0.6 * weighted_q_loss + 0.4 * mse_loss

    return total_loss