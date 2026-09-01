# models/flood_lstm_v2.py
"""
ReservoirLSTM — bản 1-hồ của FloodLSTM v2 (lstm_service/models/flood_lstm_v2.py).

Khác bản gốc:
  1. KHÔNG có reservoir embedding / reservoir_idx — mỗi model chỉ phục vụ 1 hồ
     (xem config/settings.py ReservoirLSTMConfig, context ở đây được lấy hết
     từ chính dữ liệu của hồ đó, không cần phân biệt "hồ nào").
  2. NWPEmbedding thay NWPFusionLayer — bản gốc hỗ trợ nhiều nguồn NWP với
     attention theo availability mask; ở đây chỉ có 1 nguồn (Open-Meteo) nên
     đơn giản hoá thành 1 projection layer.
  3. StationRainAttention (tùy chọn) không cần reservoir context nữa — xem
     models/station_attention.py bản 1-hồ.

Giữ nguyên từ bản gốc (không phụ thuộc số hồ):
  - Hindcast Encoder (Bi-LSTM) + Forecast Decoder (LSTM autoregressive)
  - Cross-attention: decoder query -> hindcast encoder key/value
  - Horizon-aware uncertainty scaling (P50 cố định, P5/P95 giãn theo lead-time)
  - Quantile head 7 mức
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

from .station_attention import StationRainAttention


# ═══════════════════════════════════════════════════════════════════════════════
# NWP Embedding — đơn giản hoá NWPFusionLayer (bản gốc hỗ trợ multi-source)
# ═══════════════════════════════════════════════════════════════════════════════

class NWPEmbedding(nn.Module):
    """Project NWP features (rain/temp/wind...) -> embedding, 1 nguồn duy nhất."""

    def __init__(self, input_dim: int, embed_dim: int):
        super().__init__()
        self.proj = nn.Sequential(
            nn.Linear(input_dim, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.GELU(),
            nn.Linear(embed_dim, embed_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # (B, T, input_dim) -> (B, T, embed_dim)
        return self.proj(x)


# ═══════════════════════════════════════════════════════════════════════════════
# Hindcast Cross-Attention
# ═══════════════════════════════════════════════════════════════════════════════

class HindcastCrossAttention(nn.Module):
    """
    Cross-attention: forecast decoder query -> hindcast encoder key/value.
    Cho phép decoder tập trung vào các thời điểm quan trọng trong lịch sử
    (vd: đỉnh lũ trước đó, trạng thái mưa dài hạn).
    """

    def __init__(self, hidden_size: int, n_heads: int = 4):
        super().__init__()
        self.attn = nn.MultiheadAttention(
            embed_dim=hidden_size, num_heads=n_heads, dropout=0.1, batch_first=True,
        )
        self.norm = nn.LayerNorm(hidden_size)

    def forward(self, query: torch.Tensor, key_value: torch.Tensor) -> torch.Tensor:
        ctx, _ = self.attn(query, key_value, key_value)
        out = self.norm(ctx + query)
        return out.squeeze(1)  # (B, H)


# ═══════════════════════════════════════════════════════════════════════════════
# ReservoirLSTM — Main Model
# ═══════════════════════════════════════════════════════════════════════════════

class ReservoirLSTM(nn.Module):
    """
    Two-phase flood forecasting model cho 1 hồ.

    Phase 1 — Hindcast:
        Input : x_hindcast (B, hindcast_len, n_hindcast_features)
        Encoder: Bi-LSTM 2 layers -> final state -> project -> decoder init
        Encoder output: (B, hindcast_len, H) -> key/value cho cross-attention

    Phase 2 — Forecast (autoregressive):
        NWP input: (B, forecast_len, n_nwp_features) — Open-Meteo, 1 nguồn
        Decoder: LSTM 2 layers + cross-attention -> 7 quantiles mỗi bước

    Output: (B, forecast_len, 7) trong sqrt(Q) space, đã sort monotonic
    """

    def __init__(self, config):
        super().__init__()
        H  = config.hidden_size
        NQ = config.n_quantiles

        # ── Học trọng số trạm mưa (tùy chọn) ──────────────────────────────────
        self.use_station_attention = getattr(config, "use_station_attention", False)
        if self.use_station_attention:
            self.station_attn = StationRainAttention(max_stations=config.max_stations)
        station_extra = 1 if self.use_station_attention else 0

        # ── Phase 1: Hindcast Encoder ──────────────────────────────────────────
        self.hindcast_proj = nn.Sequential(
            nn.Linear(config.n_hindcast_features + station_extra, H),
            nn.LayerNorm(H),
            nn.GELU(),
        )
        self.hindcast_encoder = nn.LSTM(
            input_size=H, hidden_size=H, num_layers=config.num_layers,
            dropout=0.2 if config.num_layers > 1 else 0.0,
            bidirectional=True, batch_first=True,
        )
        self.enc_kv_proj   = nn.Linear(H * 2, H)
        self.h_state_proj  = nn.Linear(H * 2, H)
        self.c_state_proj  = nn.Linear(H * 2, H)

        # ── Phase 2a: NWP Embedding ─────────────────────────────────────────────
        self.nwp_embed = NWPEmbedding(config.n_nwp_features, config.nwp_embed_dim)

        # ── Phase 2b: Cross-Attention (decoder -> hindcast) ─────────────────────
        self.cross_attn = HindcastCrossAttention(H, n_heads=4)

        # ── Phase 2c: Forecast Decoder ───────────────────────────────────────────
        dec_input_dim = config.nwp_embed_dim + NQ + H
        self.forecast_decoder = nn.LSTM(
            input_size=dec_input_dim, hidden_size=H, num_layers=config.num_layers,
            dropout=0.2 if config.num_layers > 1 else 0.0, batch_first=True,
        )

        # ── Output head ────────────────────────────────────────────────────────
        self.output_head = nn.Sequential(
            nn.Linear(H, H // 2),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(H // 2, NQ),
        )

        # Horizon uncertainty scale: bước sau -> khoảng tin cậy rộng hơn (học được)
        self.horizon_unc_scale = nn.Parameter(
            torch.linspace(1.0, 2.5, config.forecast_len).unsqueeze(1)
        )  # (forecast_len, 1)

        self.config = config
        self._init_weights()

    def _init_weights(self):
        for name, p in self.named_parameters():
            if "weight_ih" in name or "weight_hh" in name:
                nn.init.orthogonal_(p)
            elif "bias" in name and p.dim() == 1 and "horizon_unc_scale" not in name:
                nn.init.zeros_(p)

    def _project_encoder_state(self, h_n: torch.Tensor, c_n: torch.Tensor):
        """Gộp forward+backward directions -> decoder initial state."""
        n_layers = self.config.num_layers
        h_fwd, h_bwd = h_n[0::2], h_n[1::2]
        c_fwd, c_bwd = c_n[0::2], c_n[1::2]
        h_cat = torch.cat([h_fwd, h_bwd], dim=-1)
        c_cat = torch.cat([c_fwd, c_bwd], dim=-1)
        h0 = self.h_state_proj(h_cat).contiguous()
        c0 = self.c_state_proj(c_cat).contiguous()
        return h0, c0

    def forward(
        self,
        x_hindcast: torch.Tensor,          # (B, hindcast_len, n_hindcast_features)
        x_nwp: torch.Tensor,               # (B, forecast_len, n_nwp_features)
        teacher_forcing_ratio: float = 0.0,
        y_true_sqrt: torch.Tensor = None,  # (B, forecast_len) ground truth, sqrt space
        station_rain: torch.Tensor = None, # (B, hindcast_len, max_stations)
        station_mask: torch.Tensor = None, # (B, hindcast_len, max_stations) bool
    ) -> torch.Tensor:                     # (B, forecast_len, n_quantiles)

        B = x_hindcast.size(0)
        device = x_hindcast.device
        NQ  = self.config.n_quantiles
        med = self.config.median_idx

        # ── Phase 1: Hindcast Encoding ──────────────────────────────────────────
        if self.use_station_attention and station_rain is not None:
            learned_rain, _ = self.station_attn(station_rain, station_mask)
            enc_input_raw = torch.cat([x_hindcast, learned_rain], dim=-1)
        else:
            enc_input_raw = x_hindcast
        enc_input = self.hindcast_proj(enc_input_raw)

        enc_out, (h_n, c_n) = self.hindcast_encoder(enc_input)   # enc_out: (B, T_h, 2H)
        enc_kv = self.enc_kv_proj(enc_out)                       # (B, T_h, H)
        h0, c0 = self._project_encoder_state(h_n, c_n)

        # ── Phase 2a: NWP Embedding ──────────────────────────────────────────────
        nwp_emb = self.nwp_embed(x_nwp)   # (B, forecast_len, nwp_embed_dim)

        # ── Phase 2b+c: Autoregressive Forecast ─────────────────────────────────
        outputs = []
        prev_q = torch.zeros(B, NQ, device=device)
        h_dec, c_dec = h0, c0

        for t in range(self.config.forecast_len):
            query = h_dec[-1].unsqueeze(1)          # (B, 1, H)
            ctx = self.cross_attn(query, enc_kv)     # (B, H)

            nwp_t = nwp_emb[:, t, :]                 # (B, nwp_embed_dim)
            dec_in = torch.cat([nwp_t, prev_q, ctx], dim=-1).unsqueeze(1)

            dec_out, (h_dec, c_dec) = self.forecast_decoder(dec_in, (h_dec, c_dec))
            raw_q = self.output_head(dec_out.squeeze(1))  # (B, NQ)

            scale = self.horizon_unc_scale[t].to(device)
            median_pred = raw_q[:, med:med + 1]
            scaled_q = median_pred + (raw_q - median_pred) * scale

            outputs.append(scaled_q)

            if teacher_forcing_ratio > 0.0 and y_true_sqrt is not None:
                use_gt = torch.rand(B, device=device) < teacher_forcing_ratio
                gt_q = prev_q.clone()
                gt_q[:, med] = y_true_sqrt[:, t]
                prev_q = torch.where(use_gt.unsqueeze(-1).expand_as(scaled_q), gt_q, scaled_q.detach())
            else:
                prev_q = scaled_q.detach()

        preds = torch.stack(outputs, dim=1)
        preds = torch.sort(preds, dim=-1).values
        return preds
