"""
HuongDienLSTM — Encoder-Decoder LSTM cho dự báo lưu lượng Hồ Hương Điền.

Kiến trúc:
  Encoder : LSTM(n_features, hidden) × num_layers  — học hindcast 48h
  Decoder : LSTM(1, hidden) × num_layers → FC → (horizon, n_quantiles)
             ↑ khởi tạo từ state của Encoder (STATE HANDOFF)

Output head: 3 quantiles [Q10, Q50, Q90] — cho phép báo cáo uncertainty.
Loss:        Pinball / Quantile Loss.

Biến đổi target: y = √inflow  (variance stabilization, inflow có phân phối lệch phải)
                 → inverse: inflow = y²
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


# ══════════════════════════════════════════════════════════════════════════════
#  QUANTILE LOSS
# ══════════════════════════════════════════════════════════════════════════════

def quantile_loss(
    preds: torch.Tensor,    # (B, T, n_q)
    targets: torch.Tensor,  # (B, T)
    quantiles: list,
) -> torch.Tensor:
    """Pinball loss tổng hợp cho n quantiles."""
    loss = 0.0
    for i, q in enumerate(quantiles):
        err = targets - preds[:, :, i]
        loss = loss + torch.mean(torch.max(q * err, (q - 1) * err))
    return loss / len(quantiles)


# ══════════════════════════════════════════════════════════════════════════════
#  MODEL
# ══════════════════════════════════════════════════════════════════════════════

class HuongDienLSTM(nn.Module):
    """
    Encoder-Decoder LSTM cho Hương Điền.

    Args:
        n_features    : số chiều feature mỗi timestep (output của preprocess)
        hidden_size   : kích thước hidden state LSTM
        num_layers    : số layer LSTM stacked
        dropout       : dropout giữa các layer (chỉ áp dụng khi num_layers > 1)
        horizon       : số bước dự báo (24h)
        n_quantiles   : số quantile đầu ra (default: 3 → Q10, Q50, Q90)
    """

    def __init__(
        self,
        n_features: int,
        hidden_size: int = 128,
        num_layers:  int = 2,
        dropout:     float = 0.3,
        horizon:     int = 24,
        n_quantiles: int = 3,
    ):
        super().__init__()
        self.horizon     = horizon
        self.n_quantiles = n_quantiles
        self.hidden_size = hidden_size
        self.num_layers  = num_layers

        # ── Input projection (giúp normalize chiều input trước LSTM) ──────────
        self.input_proj = nn.Sequential(
            nn.Linear(n_features, hidden_size),
            nn.LayerNorm(hidden_size),
            nn.ReLU(),
        )

        # ── Encoder LSTM (học pattern từ 48h quá khứ) ─────────────────────────
        self.encoder = nn.LSTM(
            input_size  = hidden_size,
            hidden_size = hidden_size,
            num_layers  = num_layers,
            dropout     = dropout if num_layers > 1 else 0.0,
            batch_first = True,
        )

        # ── Decoder LSTM (auto-regressive, init từ encoder state) ─────────────
        # Input: projected từ last encoder output
        self.decoder_input_proj = nn.Linear(hidden_size, hidden_size)

        self.decoder = nn.LSTM(
            input_size  = hidden_size,
            hidden_size = hidden_size,
            num_layers  = num_layers,
            dropout     = dropout if num_layers > 1 else 0.0,
            batch_first = True,
        )

        # ── Output head: hidden → n_quantiles per timestep ────────────────────
        self.fc_out = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU(),
            nn.Linear(hidden_size // 2, n_quantiles),
        )

        # ── Số giờ forecast input cho decoder ─────────────────────────────────
        # Dùng "learned start token" thay vì teacher forcing khi inference
        self.start_token = nn.Parameter(torch.zeros(1, 1, hidden_size))

        self._init_weights()

    def _init_weights(self):
        for lstm in [self.encoder, self.decoder]:
            for name, p in lstm.named_parameters():
                if "weight_ih" in name:
                    nn.init.xavier_uniform_(p)
                elif "weight_hh" in name:
                    nn.init.orthogonal_(p)
                elif "bias" in name:
                    nn.init.zeros_(p)
                    # Forget gate bias = 1 (giúp giữ memory dài)
                    n = p.size(0) // 4
                    p.data[n:2*n].fill_(1.0)

    def forward(
        self,
        x_hist: torch.Tensor,          # (B, lookback, n_features)
        teacher_forcing: bool = False,
        y_teacher: torch.Tensor = None, # (B, horizon) — dùng khi teacher forcing
    ) -> torch.Tensor:
        """
        Returns:
            preds: (B, horizon, n_quantiles) — √inflow predictions
        """
        B = x_hist.size(0)

        # ── Encoder ───────────────────────────────────────────────────────────
        enc_in = self.input_proj(x_hist)          # (B, lookback, H)
        enc_out, (h_n, c_n) = self.encoder(enc_in)

        # ── Decoder ───────────────────────────────────────────────────────────
        # Start token (learned constant, repeat cho batch)
        dec_in = self.start_token.expand(B, -1, -1)  # (B, 1, H)
        h, c   = h_n, c_n

        preds_list = []

        for t in range(self.horizon):
            dec_out, (h, c) = self.decoder(dec_in, (h, c))   # (B, 1, H)
            q_t = self.fc_out(dec_out.squeeze(1))             # (B, n_q)
            preds_list.append(q_t)

            # Chuẩn bị input bước tiếp
            if teacher_forcing and y_teacher is not None and t < self.horizon - 1:
                # Teacher forcing: dùng ground truth làm input
                # Embed scalar y → hidden dimension (đơn giản: linear)
                next_val = y_teacher[:, t:t+1]               # (B, 1)
                # Project sang hidden space qua decoder_input_proj
                next_emb = self.decoder_input_proj(
                    torch.cat([next_val.unsqueeze(-1).expand(B, 1, 1)
                               .repeat(1, 1, self.hidden_size)], dim=-1)[:, :, :self.hidden_size]
                )
                dec_in = next_emb
            else:
                # Free-running: dùng median prediction (Q50 = index 1)
                median_idx = self.n_quantiles // 2
                next_val = q_t[:, median_idx:median_idx+1]   # (B, 1)
                # Project scalar → hidden
                dummy = next_val.unsqueeze(-1).expand(B, 1, self.hidden_size)
                dec_in = self.decoder_input_proj(dummy)       # (B, 1, H)

        preds = torch.stack(preds_list, dim=1)    # (B, horizon, n_q)

        # Clip predictions ≥ 0 (√inflow không âm)
        preds = F.relu(preds)

        return preds


# ══════════════════════════════════════════════════════════════════════════════
#  METRICS (NSE, KGE, RMSE, MAE)
# ══════════════════════════════════════════════════════════════════════════════

def compute_metrics(
    y_pred_sqrt: torch.Tensor,   # (N, horizon) — √inflow dự báo (Q50)
    y_true_sqrt: torch.Tensor,   # (N, horizon) — √inflow thực
    horizon_h: int = 24,
) -> dict:
    """
    Tính metrics trên không gian INFLOW GỐC (m³/s) — inverse transform √.

    Trả về dict với scalar metrics cho từng forecast horizon:
      nse, kge, rmse, mae, bias_pct
    """
    # Inverse transform
    y_pred = y_pred_sqrt.pow(2)
    y_true = y_true_sqrt.pow(2)

    # Tính trên toàn bộ horizon
    y_p = y_pred.reshape(-1).numpy()
    y_t = y_true.reshape(-1).numpy()

    # NSE (Nash-Sutcliffe Efficiency)
    ss_res = ((y_t - y_p) ** 2).sum()
    ss_tot = ((y_t - y_t.mean()) ** 2).sum()
    nse = 1 - ss_res / (ss_tot + 1e-8)

    # KGE (Kling-Gupta Efficiency)
    r   = float(torch.corrcoef(torch.tensor([y_p, y_t]))[0, 1])
    alpha = y_p.std() / (y_t.std() + 1e-8)
    beta  = y_p.mean() / (y_t.mean() + 1e-8)
    kge   = 1 - ((r - 1)**2 + (alpha - 1)**2 + (beta - 1)**2)**0.5

    rmse = float(((y_t - y_p)**2).mean()**0.5)
    mae  = float(abs(y_t - y_p).mean())
    bias = float((y_p - y_t).mean() / (y_t.mean() + 1e-8) * 100)

    # Per-horizon metrics (t+1h, t+6h, t+12h, t+24h)
    per_h = {}
    for h in [0, 5, 11, 23]:
        if h < horizon_h:
            y_p_h = y_pred[:, h].numpy()
            y_t_h = y_true[:, h].numpy()
            ss_r  = ((y_t_h - y_p_h)**2).sum()
            ss_to = ((y_t_h - y_t_h.mean())**2).sum()
            per_h[f"nse_t{h+1}h"] = float(1 - ss_r / (ss_to + 1e-8))
            per_h[f"rmse_t{h+1}h"] = float(((y_t_h - y_p_h)**2).mean()**0.5)

    return {
        "nse":      float(nse),
        "kge":      float(kge),
        "rmse_m3s": rmse,
        "mae_m3s":  mae,
        "bias_pct": bias,
        **per_h,
    }
