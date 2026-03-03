import torch
import torch.nn as nn
import torch.nn.functional as F


class GlobalLSTM(nn.Module):

    def __init__(self, input_size, hidden_size, horizon, quantiles, num_reservoirs):
        super().__init__()

        self.horizon = horizon
        self.num_q = len(quantiles)

        self.embedding = nn.Embedding(num_reservoirs, 16)

        self.rnn = nn.GRU(
            input_size + 16,
            hidden_size,
            num_layers=2,
            dropout=0.2,
            batch_first=True
        )

        self.fc = nn.Sequential(
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, horizon * self.num_q)
        )

    def forward(self, x, rid):

        emb = self.embedding(rid)
        emb = emb.unsqueeze(1).repeat(1, x.size(1), 1)

        x = torch.cat([x, emb], dim=2)

        out, _ = self.rnn(x)

        # dùng last hidden thay attention (nhanh hơn)
        context = out[:, -1, :]

        out = self.fc(context)
        out = F.softplus(out)

        out = out.view(-1, self.horizon, self.num_q)
        out = torch.sort(out, dim=2).values

        return out