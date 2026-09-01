# models/station_attention.py
"""
StationRainAttention — bản 1-hồ (không có reservoir embedding/context).

Khác bản ở lstm_service/models/station_attention.py: bản đó phục vụ 1 model
CHUNG nhiều hồ nên cần bảng bias theo (reservoir, station) + reservoir embedding
làm context cho score_net. Ở đây mỗi model chỉ phục vụ ĐÚNG 1 hồ, nên:
  - prior_bias là 1 vector duy nhất (không phải bảng tra theo hồ)
  - score_net chỉ nhận giá trị mưa hiện tại (không cần context "hồ nào")

Thiết kế attention giữ nguyên ý tưởng gốc (lấy cảm hứng từ AttenCLSTM trong
CNN-LSTM-Attention-Model-for-Runoff-Prediction): giữ IDW làm prior vật lý
(bias khởi tạo từ log(idw_weight) qua init_prior()), rồi để attention học điều
chỉnh dần trong quá trình train. Trạm thiếu dữ liệu tại thời điểm t bị loại
khỏi softmax qua mask.

TẮT mặc định (config.use_station_attention=False) — xem TODO trong
data/dataset_builder.py về việc parse mưa từng trạm từ Excel.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class StationRainAttention(nn.Module):
    """
    Input:
        station_rain : (B, T, S) — mưa thô từng trạm (mm), 0 nếu thiếu
        station_mask : (B, T, S) bool — True nếu trạm hợp lệ tại t

    Output:
        learned_rain : (B, T, 1) — mưa lưu vực đã học trọng số
        attn_weights : (B, T, S) — trọng số attention (để log/debug)
    """

    def __init__(self, max_stations: int, hidden_dim: int = 16):
        super().__init__()
        self.max_stations = max_stations

        # Bias tĩnh theo trạm — khởi tạo từ trọng số IDW (init_prior), học tiếp khi train
        self.prior_bias = nn.Parameter(torch.zeros(max_stations))

        # Logit động theo giá trị mưa hiện tại tại mỗi trạm
        self.score_net = nn.Sequential(
            nn.Linear(1, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, 1),
        )
        nn.init.xavier_uniform_(self.score_net[0].weight)
        nn.init.zeros_(self.score_net[0].bias)
        nn.init.zeros_(self.score_net[2].weight)
        nn.init.zeros_(self.score_net[2].bias)

    def init_prior(self, weights: list):
        """Khởi tạo bias từ trọng số IDW tĩnh đã normalize (sum=1), log space."""
        padded = list(weights) + [0.0] * (self.max_stations - len(weights))
        log_w = [math.log(w) if w > 1e-8 else -20.0 for w in padded[: self.max_stations]]
        with torch.no_grad():
            self.prior_bias.copy_(torch.tensor(log_w, dtype=torch.float32))

    def forward(self, station_rain: torch.Tensor, station_mask: torch.Tensor):
        B, T, S = station_rain.shape
        assert S == self.max_stations, f"expected {self.max_stations} stations, got {S}"

        bias = self.prior_bias.view(1, 1, -1).expand(B, T, -1)   # (B, T, S)
        dyn_score = self.score_net(station_rain.unsqueeze(-1)).squeeze(-1)  # (B, T, S)

        logits = bias + dyn_score
        logits = logits.masked_fill(~station_mask, float("-inf"))

        no_valid = (~station_mask).all(dim=-1, keepdim=True)      # (B, T, 1)
        safe_logits = torch.where(no_valid.expand_as(logits), torch.zeros_like(logits), logits)

        attn = F.softmax(safe_logits, dim=-1)
        attn = attn.masked_fill(no_valid.expand_as(attn), 0.0)

        learned_rain = (attn * station_rain).sum(dim=-1, keepdim=True)  # (B, T, 1)
        return learned_rain, attn
