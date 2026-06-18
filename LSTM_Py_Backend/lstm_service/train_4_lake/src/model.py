"""
model.py  –  PerReservoirModel
------------------------------
Bi-LSTM Encoder + Autoregressive Decoder cho từng hồ riêng biệt.
Không dùng reservoir embedding (khác với InflowForecastModel gốc).

Architecture:
  x_past  (B, SEQ_LEN, 46)  → Hindcast Proj(32) → Bi-LSTM(H) → Attention
  x_future(B, 24,      3)   → Future Emb(16)     → Decoder input mỗi step
  Decoder: autoregressive 24 steps → (B, 24, 3) quantiles [P10, P50, P90]
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class PerReservoirModel(nn.Module):

    def __init__(self, input_size: int, hidden_size: int,
                 horizon: int, quantiles: list, n_future: int = 3):
        super().__init__()
        self.horizon  = horizon
        self.num_q    = len(quantiles)
        self.n_future = n_future

        # ── 1. Hindcast Projection ─────────────────────────────────────────────
        self.hindcast_proj = nn.Linear(input_size, 32)

        # ── 2. Bi-LSTM Encoder ─────────────────────────────────────────────────
        self.encoder = nn.LSTM(
            32, hidden_size, num_layers=2,
            dropout=0.2, batch_first=True, bidirectional=True,
        )

        # Project Bi-LSTM output (2H) → H cho Attention
        self.enc_proj = nn.Linear(hidden_size * 2, hidden_size)

        # ── 3. Multi-Head Attention ────────────────────────────────────────────
        self.attention = nn.MultiheadAttention(
            embed_dim=hidden_size, num_heads=4, dropout=0.1, batch_first=True,
        )

        # ── 4. Future Rain Embedding ───────────────────────────────────────────
        self.future_emb = nn.Linear(n_future, 16) if n_future > 0 else None
        future_dim      = 16 if n_future > 0 else 0

        # ── 5. State Handoff (Encoder → Decoder) ──────────────────────────────
        # Encoder cuối: (h_last_fwd, h_last_bwd, c_last_fwd, c_last_bwd) → (B, 4H)
        self.handoff = nn.Sequential(
            nn.Linear(hidden_size * 4, hidden_size * 2),
            nn.LayerNorm(hidden_size * 2),
            nn.ReLU(),
            nn.Dropout(0.2),
        )
        self.handoff_out = nn.Linear(hidden_size * 2, hidden_size * 2)

        # ── 6. Autoregressive Decoder ─────────────────────────────────────────
        # Input mỗi step: attn_ctx(H) + prev_q(Q) + future_emb(16)
        self.decoder = nn.LSTM(
            hidden_size + self.num_q + future_dim,
            hidden_size, num_layers=2, dropout=0.2, batch_first=True,
        )

        # ── 7. Output Head ─────────────────────────────────────────────────────
        self.dropout = nn.Dropout(0.2)
        self.fc      = nn.Linear(hidden_size, self.num_q)

        # Xavier init
        nn.init.xavier_uniform_(self.hindcast_proj.weight)
        nn.init.xavier_uniform_(self.handoff_out.weight)
        if self.future_emb is not None:
            nn.init.xavier_uniform_(self.future_emb.weight)

    def forward(self, x_past: torch.Tensor,
                x_future: torch.Tensor | None = None) -> torch.Tensor:
        """
        x_past  : (B, SEQ_LEN, input_size)
        x_future: (B, HORIZON, n_future) hoặc None
        Returns : (B, HORIZON, num_q)  –  sorted quantiles trong sqrt space
        """
        # ── Encoder ───────────────────────────────────────────────────────────
        enc_in  = F.relu(self.hindcast_proj(x_past))        # (B, T, 32)
        enc_out, (h_enc, c_enc) = self.encoder(enc_in)      # (B, T, 2H)
        enc_proj = self.enc_proj(enc_out)                    # (B, T, H)

        # ── State Handoff ─────────────────────────────────────────────────────
        # Lấy top layer của bi-LSTM: h_enc[-2]=fwd, h_enc[-1]=bwd
        h_last = torch.cat([h_enc[-2], h_enc[-1]], dim=-1)  # (B, 2H)
        c_last = torch.cat([c_enc[-2], c_enc[-1]], dim=-1)  # (B, 2H)
        hc = self.handoff_out(
            self.handoff(torch.cat([h_last, c_last], dim=-1))  # (B, 4H → 2H → 2H)
        )
        h_dec, c_dec = hc.chunk(2, dim=-1)                  # each (B, H)
        h_dec = h_dec.unsqueeze(0).repeat(2, 1, 1).contiguous()  # (2, B, H)
        c_dec = c_dec.unsqueeze(0).repeat(2, 1, 1).contiguous()

        # ── Autoregressive Decoder ────────────────────────────────────────────
        B     = x_past.size(0)
        prev_q = torch.zeros(B, 1, self.num_q, device=x_past.device)
        outputs = []

        for t in range(self.horizon):
            query   = h_dec[-1].unsqueeze(1)                          # (B, 1, H)
            ctx, _  = self.attention(query, enc_proj, enc_proj)       # (B, 1, H)

            if self.future_emb is not None and x_future is not None:
                fut_t   = x_future[:, t:t+1, :]                      # (B, 1, n_f)
                fut_emb = F.relu(self.future_emb(fut_t))              # (B, 1, 16)
                dec_in  = torch.cat([ctx, prev_q, fut_emb], dim=2)
            else:
                dec_in = torch.cat([ctx, prev_q], dim=2)

            dec_out, (h_dec, c_dec) = self.decoder(dec_in, (h_dec, c_dec))
            step_q = F.softplus(self.fc(self.dropout(dec_out)))       # (B, 1, Q)
            outputs.append(step_q)
            prev_q = step_q

        out = torch.cat(outputs, dim=1)          # (B, HORIZON, Q)
        return torch.sort(out, dim=2).values     # P10 ≤ P50 ≤ P90


def count_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
