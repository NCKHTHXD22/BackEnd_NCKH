import torch
import torch.nn.functional as F


def quantile_loss(preds, target, qs):
    """
    Hybrid Loss: Quantile Loss + MSE for maximum NSE performance.
    """
    # 1. Quantile Loss
    if not isinstance(qs, torch.Tensor):
        qs = torch.tensor(qs, device=preds.device)
        
    errors = target.unsqueeze(-1) - preds
    q_loss = torch.max((qs - 1) * errors, qs * errors)
    
    # Priority on P50 (index 1) 
    p50_bias = torch.ones_like(q_loss)
    p50_bias[:, :, 1] *= 1.5
    q_loss = q_loss * p50_bias

    # 2. MSE Loss on P50 (Median) to drive NSE up
    mse_loss = F.mse_loss(preds[:, :, 1], target)

    # 3. Horizon Weights
    horizon_weights = torch.exp(
        -0.05 * torch.arange(preds.shape[1], device=preds.device)
    )

    weighted_q_loss = (q_loss * horizon_weights.unsqueeze(0).unsqueeze(-1)).mean()
    
    # Combined Loss: 70% Quantile, 30% MSE
    total_loss = 0.7 * weighted_q_loss + 0.3 * mse_loss

    return total_loss