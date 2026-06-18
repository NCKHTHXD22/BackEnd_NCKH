"""
Output heads và loss functions cho HueLSTM.

Theo Google Flood Forecasting (modelzoo/head.py):
  1. QuantileHead   — Quantile regression (7 quantiles P5-P95)
  2. CMALHead       — Countable Mixture of Asymmetric Laplacians (Google production)

CMAL là output head trong production FloodHub:
  - Hỗn hợp N phân phối Laplace bất đối xứng
  - Samples 7,500 draws → lấy median làm point estimate
  - Tự nhiên hơn Gaussian cho streamflow (right-skewed distribution)
  - NLL loss (negative log-likelihood) thay vì pinball

QuantileHead dùng pinball loss — đơn giản hơn, vẫn probabilistic.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


# ═══════════════════════════════════════════════════════════════════════════════
# Output Heads
# ═══════════════════════════════════════════════════════════════════════════════

class QuantileHead(nn.Module):
    """
    Direct quantile regression: LSTM output → 7 quantiles.
    Simple, interpretable, no distributional assumptions.
    """

    def __init__(self, input_size: int, n_quantiles: int = 7, pred_clip: list = None):
        super().__init__()
        self.pred_clip = pred_clip or [0.0, None]
        self.fc = nn.Sequential(
            nn.Linear(input_size, input_size // 2),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(input_size // 2, n_quantiles),
        )
        nn.init.xavier_uniform_(self.fc[0].weight)
        nn.init.xavier_uniform_(self.fc[3].weight)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (B, T, H) → (B, T, n_quantiles), sorted monotonic"""
        out = self.fc(x)  # (B, T, Q)

        # Clip: Q ≥ 0 (không có lưu lượng âm)
        lo = self.pred_clip[0]
        out = torch.clamp(out, min=lo)

        # Enforce monotonicity: P5 ≤ P10 ≤ ... ≤ P95
        out = torch.sort(out, dim=-1).values
        return out


class CMALHead(nn.Module):
    """
    Countable Mixture of Asymmetric Laplacians — Google production output head.

    Mỗi bước thời gian output:
      mu  : (B, T, K) — means của K phân phối
      b   : (B, T, K) — scales (softplus ≥ 0)
      tau : (B, T, K) — skewness in [0,1] (sigmoid)
      pi  : (B, T, K) — mixture weights (softmax, sum=1)

    Loss: negative log-likelihood
    Inference: sample N_SAMPLES → lấy median / quantiles

    Tham khảo: google-research/flood-forecasting/googlehydrology/modelzoo/head.py
    """

    N_SAMPLES = 7500  # Theo Google production config

    def __init__(self, input_size: int, n_distributions: int = 3):
        super().__init__()
        self.K = n_distributions

        # 4 parameter groups × K distributions
        self.fc_mu  = nn.Linear(input_size, n_distributions)
        self.fc_b   = nn.Linear(input_size, n_distributions)   # log scale
        self.fc_tau = nn.Linear(input_size, n_distributions)   # logit skewness
        self.fc_pi  = nn.Linear(input_size, n_distributions)   # logit weights

        for fc in [self.fc_mu, self.fc_b, self.fc_tau, self.fc_pi]:
            nn.init.xavier_uniform_(fc.weight)
            nn.init.zeros_(fc.bias)

    def forward(self, x: torch.Tensor) -> dict:
        """
        Returns dict (không phải tensor) để dùng trong CMAL NLL loss.
        x: (B, T, H)
        """
        return {
            "mu":  self.fc_mu(x),                           # (B, T, K)
            "b":   F.softplus(self.fc_b(x)) + 1e-6,        # > 0
            "tau": torch.sigmoid(self.fc_tau(x)),           # (0, 1)
            "pi":  F.softmax(self.fc_pi(x), dim=-1),        # sum=1
        }

    @torch.no_grad()
    def sample_quantiles(
        self,
        params: dict,
        quantiles: list,
        n_samples: int = None,
    ) -> torch.Tensor:
        """
        Monte Carlo sampling → quantiles.
        params: output of forward()
        Returns: (B, T, len(quantiles))
        """
        n = n_samples or self.N_SAMPLES
        mu  = params["mu"]   # (B, T, K)
        b   = params["b"]
        tau = params["tau"]
        pi  = params["pi"]

        B, T, K = mu.shape
        device = mu.device

        # Sample mixture component
        comp = torch.multinomial(
            pi.reshape(B * T, K), n, replacement=True
        ).reshape(B, T, n)   # (B, T, n_samples)

        # Gather parameters for sampled components
        mu_s  = mu.unsqueeze(3).expand(-1, -1, -1, n).gather(2, comp.unsqueeze(2).expand(-1,-1,1,n)).squeeze(2)
        b_s   = b.unsqueeze(3).expand(-1,-1,-1,n).gather(2, comp.unsqueeze(2).expand(-1,-1,1,n)).squeeze(2)
        tau_s = tau.unsqueeze(3).expand(-1,-1,-1,n).gather(2, comp.unsqueeze(2).expand(-1,-1,1,n)).squeeze(2)

        # Sample from Asymmetric Laplace
        u = torch.rand(B, T, n, device=device)
        samples = torch.where(
            u < tau_s,
            mu_s + b_s * tau_s * torch.log(u / tau_s + 1e-8),
            mu_s - b_s * (1 - tau_s) * torch.log((1 - u) / (1 - tau_s) + 1e-8),
        )
        samples = torch.clamp(samples, min=0.0)  # Q ≥ 0

        # Compute quantiles
        qs = torch.tensor(quantiles, device=device)
        q_vals = torch.quantile(samples, qs, dim=-1)  # (len(q), B, T)
        return q_vals.permute(1, 2, 0)                 # (B, T, len(q))


# ═══════════════════════════════════════════════════════════════════════════════
# Loss Functions
# ═══════════════════════════════════════════════════════════════════════════════

def quantile_loss(
    preds: torch.Tensor,    # (B, T, Q) — sorted quantiles
    targets: torch.Tensor,  # (B, T)
    quantiles: list,
    horizon_decay: float = 0.015,  # bước sau weight ít hơn
    peak_weight: float = 0.15,     # extra weight cho đỉnh lũ
    coverage_weight: float = 0.05, # phạt khi target nằm ngoài [P5, P95]
) -> torch.Tensor:
    """
    Hybrid loss:
      80% pinball (uncertainty) + 15% peak-aware MSE (accuracy) + 5% coverage
    """
    device = preds.device
    B, T, Q = preds.shape
    med_idx = Q // 2

    qs = torch.tensor(quantiles, dtype=torch.float32, device=device)

    # Horizon decay weights: bước gần hơn → quan trọng hơn
    t_w = torch.exp(-horizon_decay * torch.arange(T, device=device, dtype=torch.float32))
    t_w = t_w / t_w.sum()

    # Pinball
    err = targets.unsqueeze(-1) - preds                 # (B, T, Q)
    pinball = torch.max(qs * err, (qs - 1) * err)       # (B, T, Q)
    pinball_loss = (pinball * t_w.view(1, -1, 1)).sum(dim=1).mean()

    # Peak-aware MSE on median
    med_pred = preds[:, :, med_idx]
    peak_w = torch.sqrt(targets + 1.0)
    peak_w = peak_w / (peak_w.mean() + 1e-8)
    peak_w = peak_w.clamp(max=5.0)
    mse_loss = (peak_w * (med_pred - targets) ** 2 * t_w.view(1, -1)).sum(dim=1).mean()

    # Coverage: target should be in [P5, P95]
    below = F.relu(preds[:, :, 0]  - targets)
    above = F.relu(targets - preds[:, :, -1])
    cov_loss = ((below + above) * t_w.view(1, -1)).sum(dim=1).mean()

    base_w = 1.0 - peak_weight - coverage_weight
    return base_w * pinball_loss + peak_weight * mse_loss + coverage_weight * cov_loss


def cmal_nll_loss(
    params: dict,
    targets: torch.Tensor,    # (B, T)
    target_noise_std: float = 0.005,
    horizon_decay: float = 0.015,
) -> torch.Tensor:
    """
    Negative log-likelihood của CMAL distribution.
    Theo Google: targets được thêm noise nhỏ để tránh overfit.

    Asymmetric Laplace NLL:
      p(y | mu, b, tau) = tau*(1-tau)/b * exp(-rho_tau((y-mu)/b))
      rho_tau(u) = u*(tau - 1_{u<0})
    """
    device = targets.device
    B, T = targets.shape

    if target_noise_std > 0:
        targets = targets + torch.randn_like(targets) * target_noise_std

    # Horizon decay
    t_w = torch.exp(-horizon_decay * torch.arange(T, device=device, dtype=torch.float32))
    t_w = t_w / t_w.sum()

    mu  = params["mu"]   # (B, T, K)
    b   = params["b"]
    tau = params["tau"]
    pi  = params["pi"]

    y = targets.unsqueeze(-1)  # (B, T, 1)

    # Asymmetric Laplace log-prob for each component
    residual = (y - mu) / b
    log_prob = (
        torch.log(tau * (1 - tau) + 1e-8)
        - torch.log(b + 1e-8)
        - torch.where(residual >= 0, (1 - tau) * residual, -tau * residual)
    )  # (B, T, K)

    # Mixture log-prob (log-sum-exp for numerical stability)
    log_mix = torch.log(pi + 1e-8) + log_prob
    nll = -torch.logsumexp(log_mix, dim=-1)  # (B, T)

    return (nll * t_w.view(1, -1)).sum(dim=1).mean()
