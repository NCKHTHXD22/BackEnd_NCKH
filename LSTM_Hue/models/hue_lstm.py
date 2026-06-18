"""
HueLSTM — Mean Embedding Forecast LSTM cho 3 hồ Thừa Thiên Huế.

Trung thành với kiến trúc Google Flood Forecasting (production 2025):
  mean_embedding_forecast_lstm.py

Hai pha chính:
  1. Hindcast: Embedding(obs) → masked_mean → LSTM → (h, c)
  2. Forecast:  Embedding(nwp) → masked_mean → LSTM (init từ h,c) → Output Head

Key differences vs InflowForecastModel (LSTM_Py_Backend v1):
  - Embedding networks TRƯỚC LSTM (FC → LSTM thay vì input → LSTM trực tiếp)
  - Masked mean aggregation (NaN-safe — theo Google)
  - Hai LSTM riêng biệt (hindcast & forecast) không share weights
  - CMAL output hoặc Quantile output (cùng interface)
  - Không có autoregressive feedback của prev_q (Google không dùng)
    → Thay vào đó: forecast LSTM tự học sequential pattern từ NWP sequence
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

from .embedding import EmbeddingNet, BasinEmbedding, masked_mean, build_nan_mask
from .losses import QuantileHead, CMALHead


class HueLSTM(nn.Module):
    """
    Mean Embedding Forecast LSTM cho hệ thống 3 hồ Huế.

    Forward pass:
        x_hist   : (B, 720, n_hist_features) — hindcast observations
        x_nwp    : (B, 168, n_nwp_features)  — NWP forecast
        basin_id : (B,) long — 0/1/2

    Output:
        (B, 168, n_quantiles) nếu head="quantile"
        dict với params nếu head="cmal"
    """

    def __init__(self, config):
        super().__init__()
        H  = config.hidden_size
        E  = config.basin_embed_dim
        FC = config.fc_hidden

        # ── Basin embedding (thay static attributes) ───────────────────────────
        self.basin_embed = BasinEmbedding(config.n_basins, E)

        # ── Hindcast embedding network ─────────────────────────────────────────
        # Input: obs features + basin emb (broadcast per timestep)
        self.hindcast_emb = EmbeddingNet(
            input_dim=config.n_hist_features + E,
            embed_dim=H,
            hidden_dim=FC,
            dropout=config.dropout,
        )

        # ── Hindcast LSTM ──────────────────────────────────────────────────────
        self.hindcast_lstm = nn.LSTM(
            input_size=H,
            hidden_size=H,
            num_layers=config.num_layers,
            dropout=config.dropout if config.num_layers > 1 else 0.0,
            batch_first=True,
        )

        # ── Forecast embedding network ─────────────────────────────────────────
        self.forecast_emb = EmbeddingNet(
            input_dim=config.n_nwp_features + E,
            embed_dim=H,
            hidden_dim=FC,
            dropout=config.dropout,
        )

        # ── Forecast LSTM (riêng biệt với hindcast, theo Google) ────────────────
        self.forecast_lstm = nn.LSTM(
            input_size=H,
            hidden_size=H,
            num_layers=config.num_layers,
            dropout=config.dropout if config.num_layers > 1 else 0.0,
            batch_first=True,
        )

        # ── Output Head ────────────────────────────────────────────────────────
        if config.head == "quantile":
            self.head = QuantileHead(
                input_size=H,
                n_quantiles=config.n_quantiles,
                pred_clip=config.pred_clip,
            )
        elif config.head == "cmal":
            self.head = CMALHead(
                input_size=H,
                n_distributions=config.n_distributions,
            )
        else:
            raise ValueError(f"Unknown head: {config.head}")

        self.config = config
        self._init_lstm_weights()

    def _init_lstm_weights(self):
        for lstm in [self.hindcast_lstm, self.forecast_lstm]:
            for name, p in lstm.named_parameters():
                if "weight_ih" in name or "weight_hh" in name:
                    nn.init.orthogonal_(p)
                elif "bias" in name:
                    nn.init.zeros_(p)

    def forward(
        self,
        x_hist: torch.Tensor,    # (B, T_hist, n_hist_features)
        x_nwp: torch.Tensor,     # (B, T_fc, n_nwp_features)
        basin_id: torch.Tensor,  # (B,) long
    ) -> torch.Tensor:
        B = x_hist.size(0)
        T_hist = x_hist.size(1)
        T_fc   = x_nwp.size(1)

        # ── Basin embedding → broadcast ────────────────────────────────────────
        b_emb = self.basin_embed(basin_id)                      # (B, E)
        b_h   = b_emb.unsqueeze(1).expand(-1, T_hist, -1)     # (B, T_hist, E)
        b_f   = b_emb.unsqueeze(1).expand(-1, T_fc, -1)       # (B, T_fc, E)

        # ── Phase 1: Hindcast ──────────────────────────────────────────────────
        # Concat features + basin emb → embedding network
        hist_in = torch.cat([x_hist, b_h], dim=-1)             # (B, T_hist, n_hist+E)

        # NaN mask (masked_mean strategy từ Google)
        hist_mask = build_nan_mask(hist_in)                     # (B, T_hist) bool

        # Replace NaN với 0 trước khi qua embedding (embedding handle riêng)
        hist_in_clean = torch.nan_to_num(hist_in, nan=0.0)
        hist_emb = self.hindcast_emb(hist_in_clean)             # (B, T_hist, H)

        # Masked mean không dùng ở đây — LSTM xử lý sequence trực tiếp
        # masked_mean ở đây dùng cho multi-source fusion (future work với nhiều NWP)
        # Hiện tại: forward full sequence qua LSTM, mask chỉ dùng cho loss
        _, (h_n, c_n) = self.hindcast_lstm(hist_emb)
        # h_n, c_n: (num_layers, B, H)

        # ── Phase 2: Forecast ──────────────────────────────────────────────────
        fc_in = torch.cat([x_nwp, b_f], dim=-1)                # (B, T_fc, n_nwp+E)
        fc_in_clean = torch.nan_to_num(fc_in, nan=0.0)
        fc_emb = self.forecast_emb(fc_in_clean)                 # (B, T_fc, H)

        # Init forecast LSTM với state từ hindcast (STATE HANDOFF)
        fc_out, _ = self.forecast_lstm(fc_emb, (h_n, c_n))     # (B, T_fc, H)

        # ── Output head ────────────────────────────────────────────────────────
        return self.head(fc_out)                                 # (B, T_fc, n_q) or dict


class HueLSTMEnsemble(nn.Module):
    """
    Ensemble của N HueLSTM models — tăng robustness cho vùng khó predict.
    Dùng khi inference: average predictions của N models.

    Google FloodHub: không document ensemble cụ thể, nhưng CMAL đã implicit ensemble
    qua mixture components. Đây là explicit ensemble option.
    """

    def __init__(self, models: list):
        super().__init__()
        self.models = nn.ModuleList(models)

    @torch.no_grad()
    def forward(self, x_hist, x_nwp, basin_id) -> torch.Tensor:
        preds = [m(x_hist, x_nwp, basin_id) for m in self.models]
        return torch.stack(preds, dim=0).mean(dim=0)
