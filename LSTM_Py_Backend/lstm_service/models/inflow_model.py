import torch
import torch.nn as nn
import torch.nn.functional as F


class InflowForecastModel(nn.Module):
    """
    Bi-LSTM Encoder + Autoregressive Decoder với Multi-Head Attention.

    Kiến trúc mới (v2):
      - X_past    : (B, SEQ_LENGTH, input_size)  — lịch sử 240h
      - X_future  : (B, HORIZON, n_future)       — dự báo mưa 24h tới (oracle train / Open-Meteo inference)
                    Nếu None → chạy như v1 (không có future input)
      - rid       : (B,)                          — reservoir index

    X_future features (n_future=3): [rain_fc, rain_fc_6h, rain_fc_24h]
    """

    def __init__(self, input_size, hidden_size,
                 horizon, quantiles, num_reservoirs,
                 n_future: int = 3):

        super().__init__()

        self.horizon  = horizon
        self.num_q    = len(quantiles)
        self.n_future = n_future

        # ── 1. Static Embedding (Reservoir ID) ────────────────────────────────
        self.embedding = nn.Embedding(num_reservoirs, 16)

        # ── 2. Hindcast Embedding ─────────────────────────────────────────────
        self.hindcast_embedding = nn.Linear(input_size, 32)

        # ── 3. Encoder: Bi-LSTM ────────────────────────────────────────────────
        self.encoder = nn.LSTM(
            32 + 16,        # hindcast_emb + res_emb
            hidden_size,
            num_layers=2,
            dropout=0.2,
            batch_first=True,
            bidirectional=True,
        )

        # Project Bi-LSTM output (2*H) → H cho Attention
        self.enc_repro = nn.Linear(hidden_size * 2, hidden_size)

        # ── 4. Multi-Head Attention ────────────────────────────────────────────
        self.attention = nn.MultiheadAttention(
            embed_dim=hidden_size,
            num_heads=4,
            dropout=0.1,
            batch_first=True,
        )

        # ── 5. Future Rain Embedding ───────────────────────────────────────────
        # Project X_future features → decoder input space
        self.future_embedding = nn.Linear(n_future, 16) if n_future > 0 else None

        # ── 6. Decoder: Autoregressive ────────────────────────────────────────
        # Input: res_emb(16) + attn_context(H) + prev_q(Q) + future_emb(16)
        future_dim = 16 if n_future > 0 else 0
        self.decoder = nn.LSTM(
            16 + hidden_size + self.num_q + future_dim,
            hidden_size,
            num_layers=2,
            dropout=0.2,
            batch_first=True,
        )

        # ── 7. State Handoff (Encoder → Decoder) ──────────────────────────────
        self.handoff_net = nn.Sequential(
            nn.Linear(hidden_size * 4, hidden_size * 2),
            nn.LayerNorm(hidden_size * 2),
            nn.ReLU(),
            nn.Dropout(0.2),
        )
        self.handoff_linear = nn.Linear(hidden_size * 2, hidden_size * 2)

        # Xavier init
        nn.init.xavier_uniform_(self.hindcast_embedding.weight)
        nn.init.xavier_uniform_(self.handoff_linear.weight)
        if self.future_embedding is not None:
            nn.init.xavier_uniform_(self.future_embedding.weight)

        # ── 8. Output Head ─────────────────────────────────────────────────────
        self.dropout = nn.Dropout(0.2)
        self.fc      = nn.Linear(hidden_size, self.num_q)

    def forward(self, x_past, rid, x_future=None):
        """
        Args:
            x_past   : (B, SEQ_LENGTH, input_size)
            rid      : (B,)
            x_future : (B, HORIZON, n_future) hoặc None
        Returns:
            out: (B, HORIZON, num_q)  — Q10/Q50/Q90 trong sqrt space
        """
        emb = self.embedding(rid)   # (B, 16)

        # ── Encoder ───────────────────────────────────────────────────────────
        past_emb = F.relu(self.hindcast_embedding(x_past))         # (B, T, 32)
        emb_enc  = emb.unsqueeze(1).repeat(1, x_past.size(1), 1)  # (B, T, 16)
        enc_input = torch.cat([past_emb, emb_enc], dim=2)          # (B, T, 48)

        enc_out, (h_enc, c_enc) = self.encoder(enc_input)          # (B, T, 2H)
        enc_out_proj = self.enc_repro(enc_out)                      # (B, T, H)

        # ── State Handoff ─────────────────────────────────────────────────────
        h_last = torch.cat([h_enc[-2], h_enc[-1]], dim=-1)   # (B, 2H)
        c_last = torch.cat([c_enc[-2], c_enc[-1]], dim=-1)   # (B, 2H)
        handoff_in = torch.cat([h_last, c_last], dim=-1)     # (B, 4H)
        x = self.handoff_net(handoff_in)
        initial_state = self.handoff_linear(x)
        h_dec, c_dec = initial_state.chunk(2, dim=-1)
        h_dec = h_dec.unsqueeze(0).repeat(2, 1, 1).contiguous()
        c_dec = c_dec.unsqueeze(0).repeat(2, 1, 1).contiguous()

        # ── Autoregressive Decoder ────────────────────────────────────────────
        batch_size = x_past.size(0)
        device     = x_past.device
        prev_q     = torch.zeros(batch_size, 1, self.num_q, device=device)

        outputs = []
        for t in range(self.horizon):
            # Attention: query = decoder hidden
            query    = h_dec[-1].unsqueeze(1)                              # (B, 1, H)
            attn_out, _ = self.attention(query, enc_out_proj, enc_out_proj)  # (B, 1, H)

            emb_dec = emb.unsqueeze(1)                                     # (B, 1, 16)

            # Future rain embedding cho bước t
            if self.future_embedding is not None and x_future is not None:
                fut_t    = x_future[:, t:t+1, :]                          # (B, 1, n_future)
                fut_emb  = F.relu(self.future_embedding(fut_t))            # (B, 1, 16)
                dec_input = torch.cat([emb_dec, attn_out, prev_q, fut_emb], dim=2)
            else:
                dec_input = torch.cat([emb_dec, attn_out, prev_q], dim=2)

            dec_out, (h_dec, c_dec) = self.decoder(dec_input, (h_dec, c_dec))
            step_q = F.softplus(self.fc(self.dropout(dec_out)))            # (B, 1, Q)

            outputs.append(step_q)
            prev_q = step_q

        out = torch.cat(outputs, dim=1)              # (B, HORIZON, Q)
        out = torch.sort(out, dim=2).values          # P10 <= P50 <= P90
        return out
