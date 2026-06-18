"""
FloodLSTM v2 — kiến trúc lấy cảm hứng từ Google Research Flood Forecasting.

Hai điểm khác biệt cốt lõi so với InflowForecastModel (v1):

  1. State Handoff rõ ràng:
       Hindcast LSTM (30 ngày lịch sử) → project final state → init Forecast LSTM
       Decoder KHÔNG chia sẻ weights với encoder — đây là key của Google's design.

  2. NWP Fusion Layer:
       Hỗ trợ đồng thời nhiều nguồn NWP (Open-Meteo, GFS, ERA5...).
       Dùng attention dựa trên availability mask — nếu source bị thiếu thì tự zero-weight.

  3. 7 quantiles (P5/P10/P25/P50/P75/P90/P95) thay vì 3:
       Tốt hơn cho early warning system cần xác suất vượt ngưỡng.

  4. Horizon-aware uncertainty scaling:
       Parameter học được per-timestep — tự nhiên mở rộng uncertainty band với thời gian.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


# ═══════════════════════════════════════════════════════════════════════════════
# NWP Fusion Layer
# ═══════════════════════════════════════════════════════════════════════════════

class NWPFusionLayer(nn.Module):
    """
    Fuse nhiều nguồn NWP thành một embedding thống nhất.

    Ý tưởng: mỗi nguồn (Open-Meteo, GFS...) project riêng, rồi dùng
    attention-weighted sum dựa trên availability. Nếu source không có data
    (availability=0) thì weight = 0, không ảnh hưởng output.

    Args:
        n_sources:  số nguồn NWP (mặc định 2)
        input_dim:  số feature mỗi source mỗi timestep (mặc định 6)
        embed_dim:  output embedding dimension
    """

    def __init__(self, n_sources: int, input_dim: int, embed_dim: int):
        super().__init__()
        self.n_sources = n_sources

        self.source_proj = nn.ModuleList([
            nn.Sequential(
                nn.Linear(input_dim, embed_dim),
                nn.LayerNorm(embed_dim),
                nn.GELU(),
                nn.Linear(embed_dim, embed_dim),
            )
            for _ in range(n_sources)
        ])

        # Availability → per-source attention logits
        self.avail_gate = nn.Sequential(
            nn.Linear(n_sources, n_sources * 8),
            nn.ReLU(),
            nn.Linear(n_sources * 8, n_sources),
        )

    def forward(
        self,
        sources: list,              # list of (B, T, input_dim) — T = forecast_len
        availability: torch.Tensor, # (B, n_sources) — 0/1 mask
    ) -> torch.Tensor:              # (B, T, embed_dim)

        projected = [proj(src) for proj, src in zip(self.source_proj, sources)]
        stacked = torch.stack(projected, dim=2)  # (B, T, n_sources, embed_dim)

        raw_w = self.avail_gate(availability.float())          # (B, n_sources)
        # Mask out unavailable sources before softmax
        mask_inf = (1.0 - availability.float()) * -1e9
        weights = F.softmax(raw_w + mask_inf, dim=-1)          # (B, n_sources)

        weights = weights.unsqueeze(1).unsqueeze(-1)            # (B, 1, n_sources, 1)
        fused = (stacked * weights).sum(dim=2)                  # (B, T, embed_dim)
        return fused


# ═══════════════════════════════════════════════════════════════════════════════
# Basin Cross-Attention
# ═══════════════════════════════════════════════════════════════════════════════

class BasinCrossAttention(nn.Module):
    """
    Cross-attention: forecast decoder query → hindcast encoder key/value.

    Cho phép decoder tập trung vào các thời điểm quan trọng trong lịch sử
    (vd: đỉnh lũ trước đó, trạng thái mưa dài hạn).
    """

    def __init__(self, hidden_size: int, n_heads: int = 4):
        super().__init__()
        self.attn = nn.MultiheadAttention(
            embed_dim=hidden_size,
            num_heads=n_heads,
            dropout=0.1,
            batch_first=True,
        )
        self.norm = nn.LayerNorm(hidden_size)

    def forward(
        self,
        query: torch.Tensor,     # (B, 1, H) — decoder hidden at step t
        key_value: torch.Tensor, # (B, T_enc, H) — projected encoder outputs
    ) -> torch.Tensor:           # (B, H) — attended basin context
        ctx, _ = self.attn(query, key_value, key_value)
        out = self.norm(ctx + query)  # residual
        return out.squeeze(1)         # (B, H)


# ═══════════════════════════════════════════════════════════════════════════════
# FloodLSTM v2 — Main Model
# ═══════════════════════════════════════════════════════════════════════════════

class FloodLSTMv2(nn.Module):
    """
    Two-phase flood forecasting model.

    Phase 1 — Hindcast (không thay đổi trong inference):
        Input : x_hindcast (B, 720, 46)  — 30 ngày lịch sử quan trắc
        Encoder: Bi-LSTM 2 layers → final state → project → decoder init
        Encoder output: (B, 720, H) → key/value cho cross-attention

    Phase 2 — Forecast (autoregressive 168 bước):
        NWP input: fused multi-source weather (B, 168, embed_dim)
        Decoder: LSTM 2 layers + cross-attention → 7 quantiles mỗi bước

    Output: (B, 168, 7) trong sqrt(Q) space, đã sort monotonic
    """

    def __init__(self, config):
        super().__init__()
        H  = config.hidden_size
        E  = config.reservoir_embed_dim
        NQ = config.n_quantiles

        # ── Reservoir embedding (dùng chung 2 phase) ──────────────────────────
        self.res_embed = nn.Embedding(config.n_reservoirs, E)

        # ── Phase 1: Hindcast Encoder ──────────────────────────────────────────
        # Input embedding: linear project + reservoir concat
        self.hindcast_proj = nn.Sequential(
            nn.Linear(config.n_hindcast_features + E, H),
            nn.LayerNorm(H),
            nn.GELU(),
        )
        self.hindcast_encoder = nn.LSTM(
            input_size=H,
            hidden_size=H,
            num_layers=config.num_layers,
            dropout=0.2,
            bidirectional=True,
            batch_first=True,
        )
        # Project encoder output (2H → H) cho cross-attention key/value
        self.enc_kv_proj = nn.Linear(H * 2, H)
        # Project bidirectional final state → unidirectional decoder init
        self.h_state_proj = nn.Linear(H * 2, H)
        self.c_state_proj = nn.Linear(H * 2, H)

        # ── Phase 2a: NWP Fusion ───────────────────────────────────────────────
        self.nwp_fusion = NWPFusionLayer(
            n_sources=config.n_nwp_sources,
            input_dim=config.n_nwp_features,
            embed_dim=config.nwp_embed_dim,
        )

        # ── Phase 2b: Cross-Attention (decoder → hindcast) ────────────────────
        self.cross_attn = BasinCrossAttention(H, n_heads=4)

        # ── Phase 2c: Forecast Decoder ─────────────────────────────────────────
        # Input mỗi bước: reservoir_emb + nwp_fused + prev_quantiles + attn_ctx
        dec_input_dim = E + config.nwp_embed_dim + NQ + H
        self.forecast_decoder = nn.LSTM(
            input_size=dec_input_dim,
            hidden_size=H,
            num_layers=config.num_layers,
            dropout=0.2,
            batch_first=True,
        )

        # ── Output head ────────────────────────────────────────────────────────
        self.output_head = nn.Sequential(
            nn.Linear(H, H // 2),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(H // 2, NQ),
        )

        # Horizon uncertainty scale: bước sau → khoảng tin cậy rộng hơn
        # Được học trong training, không hardcode
        # Scale tác động: mở rộng P5/P10 (lower) và P90/P95 (upper) ra khỏi P50
        self.horizon_unc_scale = nn.Parameter(
            torch.linspace(1.0, 2.5, config.forecast_len).unsqueeze(1)
        )  # (168, 1), trainable

        self.config = config
        self._init_weights()

    def _init_weights(self):
        for name, p in self.named_parameters():
            if "weight_ih" in name or "weight_hh" in name:
                nn.init.orthogonal_(p)
            elif "bias" in name:
                nn.init.zeros_(p)
            elif isinstance(p, nn.Linear):
                nn.init.xavier_uniform_(p.weight)

    def _project_encoder_state(
        self,
        h_n: torch.Tensor,  # (2*num_layers, B, H) bidirectional
        c_n: torch.Tensor,
    ):
        """
        Gộp forward+backward directions → decoder initial state.
        Mỗi layer: cat(h_fwd, h_bwd) → Linear(2H → H)
        """
        # h_n shape: (2*num_layers, B, H) — thứ tự [fwd_l0, bwd_l0, fwd_l1, bwd_l1]
        n_layers = self.config.num_layers
        h_fwd = h_n[0::2]  # (num_layers, B, H)
        h_bwd = h_n[1::2]
        c_fwd = c_n[0::2]
        c_bwd = c_n[1::2]

        h_cat = torch.cat([h_fwd, h_bwd], dim=-1)  # (num_layers, B, 2H)
        c_cat = torch.cat([c_fwd, c_bwd], dim=-1)

        h0 = self.h_state_proj(h_cat)  # (num_layers, B, H)
        c0 = self.c_state_proj(c_cat)
        return h0.contiguous(), c0.contiguous()

    def forward(
        self,
        x_hindcast: torch.Tensor,        # (B, 720, n_hindcast_features)
        reservoir_idx: torch.Tensor,      # (B,) long
        nwp_sources: list,               # list of (B, 168, n_nwp_features)
        nwp_availability: torch.Tensor,  # (B, n_sources) binary float/int
        teacher_forcing_ratio: float = 0.0,
        y_true_sqrt: torch.Tensor = None, # (B, 168) ground truth in sqrt space
    ) -> torch.Tensor:                    # (B, 168, n_quantiles)

        B = x_hindcast.size(0)
        device = x_hindcast.device
        NQ = self.config.n_quantiles
        med = self.config.median_idx

        # ── Reservoir embedding ────────────────────────────────────────────────
        r_emb = self.res_embed(reservoir_idx)  # (B, E)

        # ── Phase 1: Hindcast Encoding ─────────────────────────────────────────
        T_h = x_hindcast.size(1)
        r_expand = r_emb.unsqueeze(1).expand(-1, T_h, -1)  # (B, T_h, E)
        enc_input_raw = torch.cat([x_hindcast, r_expand], dim=-1)  # (B, T_h, 46+E)
        enc_input = self.hindcast_proj(enc_input_raw)               # (B, T_h, H)

        enc_out, (h_n, c_n) = self.hindcast_encoder(enc_input)
        # enc_out: (B, T_h, 2H)

        # Key/Value cho cross-attention
        enc_kv = self.enc_kv_proj(enc_out)  # (B, T_h, H)

        # Project encoder state → decoder init
        h0, c0 = self._project_encoder_state(h_n, c_n)  # each (num_layers, B, H)

        # ── Phase 2a: NWP Fusion ───────────────────────────────────────────────
        nwp_fused = self.nwp_fusion(nwp_sources, nwp_availability)  # (B, 168, nwp_embed)

        # ── Phase 2b+c: Autoregressive Forecast ───────────────────────────────
        outputs = []
        prev_q = torch.zeros(B, NQ, device=device)  # (B, NQ) — init = 0 sqrt space
        h_dec, c_dec = h0, c0

        for t in range(self.config.forecast_len):
            # Cross-attend: decoder hidden → hindcast encoder outputs
            query = h_dec[-1].unsqueeze(1)        # (B, 1, H) — last layer hidden
            ctx = self.cross_attn(query, enc_kv)  # (B, H)

            # Decoder input tại bước t
            nwp_t = nwp_fused[:, t, :]  # (B, nwp_embed)
            dec_in = torch.cat([r_emb, nwp_t, prev_q, ctx], dim=-1)  # (B, dec_input_dim)
            dec_in = dec_in.unsqueeze(1)  # (B, 1, dec_input_dim)

            dec_out, (h_dec, c_dec) = self.forecast_decoder(dec_in, (h_dec, c_dec))

            raw_q = self.output_head(dec_out.squeeze(1))  # (B, NQ) — raw, chưa clamp

            # Horizon-aware uncertainty scaling:
            # Giữ P50 cố định, scale P10/P90 ra xa theo thời gian
            scale = self.horizon_unc_scale[t].to(device)  # (1,)
            median_pred = raw_q[:, med:med+1]             # (B, 1)
            deviation = raw_q - median_pred               # (B, NQ)
            scaled_q = median_pred + deviation * scale    # (B, NQ)

            outputs.append(scaled_q)

            # Teacher forcing: dùng ground truth P50 làm prev_q (chỉ trong training)
            if teacher_forcing_ratio > 0.0 and y_true_sqrt is not None:
                use_gt = torch.rand(B, device=device) < teacher_forcing_ratio
                gt_q = prev_q.clone()
                gt_q[:, med] = y_true_sqrt[:, t]
                prev_q = torch.where(use_gt.unsqueeze(-1).expand_as(scaled_q), gt_q, scaled_q.detach())
            else:
                prev_q = scaled_q.detach()

        preds = torch.stack(outputs, dim=1)       # (B, 168, NQ)
        preds = torch.sort(preds, dim=-1).values  # đảm bảo P5 ≤ P10 ≤ ... ≤ P95
        return preds
