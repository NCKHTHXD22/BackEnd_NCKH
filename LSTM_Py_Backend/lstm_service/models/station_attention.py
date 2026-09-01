# models/station_attention.py
"""
StationRainAttention — học trọng số gộp mưa đa trạm bằng attention,
thay vì cố định theo nghịch đảo bình phương khoảng cách (IDW).

Động lực (từ repo tham khảo aba-hash/CNN-LSTM-Attention-Model-for-Runoff-
Prediction, model.py — AttenCLSTM): repo đó xử lý từng trạm khí tượng
riêng biệt rồi để attention học cách trộn. Pipeline hiện tại
(data/idw_calculator.py) gộp cứng mưa nhiều trạm thành 1 scalar bằng IDW
TRƯỚC KHI model nhìn thấy dữ liệu — mạng không bao giờ học được rằng 1
trạm cụ thể có thể đáng tin/kém tin cậy hơn trọng số tĩnh theo khoảng cách
gợi ý (trạm hỏng, trạm đại diện tốt hơn cho 1 tiểu lưu vực dễ sinh lũ...).

Thiết kế: giữ IDW làm PRIOR vật lý, không thay thế:
  - Bias của attention logit (prior_bias) khởi tạo bằng log(idw_weight) qua
    init_prior() → lúc mới train, hành vi ~ giống hệt IDW hiện tại.
  - Logit động = bias_prior[reservoir, station] + MLP(rain_value, res_emb).
  - Trạm thiếu dữ liệu tại thời điểm t (mask=False) bị loại khỏi softmax.
  - Nếu toàn bộ trạm thiếu tại 1 thời điểm → trả về 0 (graceful fallback).

Dùng cho FloodLSTM v2 (R&D, chưa deploy) — KHÔNG áp dụng cho InflowForecastModel
v1 (models/inflow_model.py) đang chạy production, để không phá vỡ checkpoint
đang phục vụ main_predict.py/main_api.py.

Input bổ sung (không thay thế feature "rain" hiện có trong
features/feature_engineering.py) — an toàn ngược, chỉ kích hoạt khi
config.use_station_attention=True VÀ dataset có v2_station_rain.npy.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class StationRainAttention(nn.Module):
    """
    Input:
        station_rain : (B, T, S) — mưa thô từng trạm (mm), 0 nếu thiếu
        station_mask : (B, T, S) bool — True nếu trạm hợp lệ tại t (có dữ
                       liệu VÀ trạm đó thuộc lưu vực của reservoir_idx tương ứng)
        reservoir_idx: (B,) long
        res_emb      : (B, E) — reservoir embedding đã tính sẵn (dùng chung
                       với FloodLSTMv2.res_embed, không tạo embedding riêng)

    Output:
        learned_rain : (B, T, 1) — mưa lưu vực đã học trọng số
        attn_weights : (B, T, S) — trọng số attention (để log/debug)
    """

    def __init__(self, n_reservoirs: int, max_stations: int, res_embed_dim: int, hidden_dim: int = 16):
        super().__init__()
        self.max_stations = max_stations

        # Bias tĩnh theo (reservoir, station) — khởi tạo từ trọng số IDW, học
        # tiếp trong quá trình training (không đóng băng).
        self.prior_bias = nn.Embedding(n_reservoirs, max_stations)
        nn.init.zeros_(self.prior_bias.weight)

        # Logit động theo giá trị mưa hiện tại + reservoir embedding
        self.score_net = nn.Sequential(
            nn.Linear(1 + res_embed_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, 1),
        )
        nn.init.xavier_uniform_(self.score_net[0].weight)
        nn.init.zeros_(self.score_net[0].bias)
        nn.init.zeros_(self.score_net[2].weight)
        nn.init.zeros_(self.score_net[2].bias)

    def init_prior(self, reservoir_idx: int, weights: list):
        """
        Khởi tạo bias cho 1 reservoir từ trọng số IDW tĩnh (log space).
        weights: list trọng số IDW đã normalize (sum=1), lấy từ
        data/idw_calculator.py compute_idw_weights(), độ dài <= max_stations.
        """
        padded = list(weights) + [0.0] * (self.max_stations - len(weights))
        log_w = [math.log(w) if w > 1e-8 else -20.0 for w in padded[: self.max_stations]]
        with torch.no_grad():
            self.prior_bias.weight[reservoir_idx] = torch.tensor(log_w, dtype=torch.float32)

    def forward(self, station_rain, station_mask, reservoir_idx, res_emb):
        B, T, S = station_rain.shape
        assert S == self.max_stations, f"expected {self.max_stations} stations, got {S}"

        bias = self.prior_bias(reservoir_idx)                     # (B, S)
        bias = bias.unsqueeze(1).expand(-1, T, -1)                  # (B, T, S)

        rain_in = station_rain.unsqueeze(-1)                        # (B, T, S, 1)
        res_ctx = res_emb.unsqueeze(1).unsqueeze(2).expand(-1, T, S, -1)  # (B, T, S, E)
        score_in = torch.cat([rain_in, res_ctx], dim=-1)            # (B, T, S, 1+E)
        dyn_score = self.score_net(score_in).squeeze(-1)            # (B, T, S)

        logits = bias + dyn_score
        logits = logits.masked_fill(~station_mask, float("-inf"))

        # Timestep không còn trạm hợp lệ nào → tránh NaN từ softmax toàn -inf
        no_valid = (~station_mask).all(dim=-1, keepdim=True)         # (B, T, 1)
        safe_logits = torch.where(no_valid.expand_as(logits), torch.zeros_like(logits), logits)

        attn = F.softmax(safe_logits, dim=-1)                        # (B, T, S)
        attn = attn.masked_fill(no_valid.expand_as(attn), 0.0)

        learned_rain = (attn * station_rain).sum(dim=-1, keepdim=True)  # (B, T, 1)
        return learned_rain, attn
