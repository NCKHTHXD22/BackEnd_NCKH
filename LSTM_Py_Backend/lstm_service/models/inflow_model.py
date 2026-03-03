import torch
import torch.nn as nn
import torch.nn.functional as F


class InflowForecastModel(nn.Module):

    def __init__(self, input_size, hidden_size,
                 horizon, quantiles, num_reservoirs):

        super().__init__()

        self.horizon = horizon
        self.num_q = len(quantiles)

        # 1. Static Embedding (Hồ chứa)
        self.embedding = nn.Embedding(num_reservoirs, 16)

        # 2. Dynamic Embeddings (Nhúng Đặc trưng Động)
        self.hindcast_embedding = nn.Linear(input_size, 32)
        self.forecast_embedding = nn.Linear(1, 16)

        self.encoder = nn.LSTM(
            32 + 16, # hindcast_emb + res_emb
            hidden_size,
            num_layers=2,
            dropout=0.2,
            batch_first=True
        )

        self.decoder = nn.LSTM(
            16 + 16 + self.num_q, # forecast_emb + res_emb + prev_q
            hidden_size,
            num_layers=2,
            dropout=0.2,
            batch_first=True
        )

        # 3. State Handoff Network (Refined based on Google architecture)
        self.handoff_net = nn.Sequential(
            nn.Linear(hidden_size * 2, hidden_size * 2),
            nn.LayerNorm(hidden_size * 2),
            nn.ReLU(),
            nn.Dropout(0.2) # Increased from 0.1
        )
        self.handoff_linear = nn.Linear(hidden_size * 2, hidden_size * 2)
        
        # Xavier Initialization for stability
        nn.init.xavier_uniform_(self.hindcast_embedding.weight)
        nn.init.xavier_uniform_(self.forecast_embedding.weight)
        nn.init.xavier_uniform_(self.handoff_linear.weight)

        # 4. Head Regularization
        self.dropout = nn.Dropout(0.2)
        self.fc = nn.Linear(hidden_size, self.num_q)

    def forward(self, x_past, x_future, rid):

        emb = self.embedding(rid)

        # Pass through dynamic embeddings
        past_emb = F.relu(self.hindcast_embedding(x_past))

        emb_enc = emb.unsqueeze(1).repeat(1, x_past.size(1), 1)
        enc_input = torch.cat([past_emb, emb_enc], dim=2)

        _, (h_enc, c_enc) = self.encoder(enc_input)

        # State Handoff
        handoff_in = torch.cat([h_enc, c_enc], dim=-1)
        x = self.handoff_net(handoff_in)
        initial_state = self.handoff_linear(x)
        h_dec, c_dec = initial_state.chunk(2, dim=-1)
        
        h_dec = h_dec.contiguous()
        c_dec = c_dec.contiguous()

        batch_size = x_past.size(0)
        device = x_past.device
        
        prev_q = torch.zeros(batch_size, 1, self.num_q, device=device)
        
        outputs = []
        for t in range(self.horizon):
            step_rain = x_future[:, t:t+1, :]
            step_rain_emb = F.relu(self.forecast_embedding(step_rain))
            
            emb_dec = emb.unsqueeze(1)
            
            dec_input = torch.cat([step_rain_emb, emb_dec, prev_q], dim=2)
            
            dec_out, (h_dec, c_dec) = self.decoder(dec_input, (h_dec, c_dec))
            
            step_q = self.fc(self.dropout(dec_out))
            step_q = F.softplus(step_q)
            
            outputs.append(step_q)
            prev_q = step_q
            
        out = torch.cat(outputs, dim=1)
        out = torch.sort(out, dim=2).values

        return out
