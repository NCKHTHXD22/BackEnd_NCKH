"""
Embedding networks cho HueLSTM.

Theo Google Flood Forecasting (modelzoo/fc.py):
  - Mỗi nhóm feature có embedding network riêng (FC layers)
  - Masked mean aggregation: tổng hợp embeddings, bỏ qua NaN
  - Static basin embedding: thay thế 100+ static attributes (Google) bằng learned embedding (3 lưu vực)

Kiến trúc embedding: Linear → GELU → LayerNorm → Linear → GELU
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class EmbeddingNet(nn.Module):
    """
    FC embedding network — biến đổi raw features thành embedded representation.
    Giống Google's fc.py nhưng đơn giản hóa (2 layers thay vì có thể nhiều hơn).

    Input:  (B, T, input_dim)
    Output: (B, T, embed_dim)
    """

    def __init__(self, input_dim: int, embed_dim: int, hidden_dim: int = 128, dropout: float = 0.2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.GELU(),
            nn.LayerNorm(hidden_dim),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, embed_dim),
            nn.GELU(),
        )
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class BasinEmbedding(nn.Module):
    """
    Learned basin embedding (thay thế static catchment attributes của Google).

    3 lưu vực → embedding vector (basin_embed_dim,)
    Được broadcast sang mọi timestep.

    Khởi tạo từ basin_static_vector() (face value của catchment attributes)
    để embedding bắt đầu với prior vật lý.
    """

    def __init__(self, n_basins: int, embed_dim: int, static_init: list | None = None):
        super().__init__()
        self.embed = nn.Embedding(n_basins, embed_dim)

        if static_init is not None:
            import numpy as np
            # Khởi tạo bằng static attributes — cho prior vật lý trước khi train
            static_t = torch.tensor(static_init, dtype=torch.float32)
            # Pad hoặc project về embed_dim
            if static_t.shape[1] <= embed_dim:
                padded = F.pad(static_t, (0, embed_dim - static_t.shape[1]))
            else:
                padded = static_t[:, :embed_dim]
            with torch.no_grad():
                self.embed.weight.copy_(padded)

    def forward(self, basin_id: torch.Tensor) -> torch.Tensor:
        """basin_id: (B,) → (B, embed_dim)"""
        return self.embed(basin_id)


def masked_mean(
    x: torch.Tensor,     # (B, T, embed_dim)
    mask: torch.Tensor | None = None,  # (B, T) bool — True = valid (NOT NaN)
) -> torch.Tensor:       # (B, embed_dim)
    """
    Masked temporal mean — cốt lõi của Google's NaN-handling strategy.

    Nếu mask=None: simple mean (tất cả valid).
    Nếu mask có False: bỏ qua bước đó khi tính mean.
    Nếu toàn bộ mask=False tại một sample: trả về zeros (graceful degradation).

    Tham khảo: googlehydrology/datautils/union_features.py masked_mean aggregation.
    """
    if mask is None:
        return x.mean(dim=1)  # (B, embed_dim)

    # mask: (B, T) → (B, T, 1) để broadcast
    m = mask.unsqueeze(-1).float()  # (B, T, 1)
    sum_valid = (x * m).sum(dim=1)  # (B, embed_dim)
    count = m.sum(dim=1).clamp(min=1.0)  # (B, 1), avoid div-by-zero
    return sum_valid / count  # (B, embed_dim)


def build_nan_mask(x: torch.Tensor) -> torch.Tensor:
    """
    Tạo validity mask từ tensor (True = valid, False = NaN).
    Input: (B, T, F) → Output: (B, T) — True nếu không có NaN ở bất kỳ feature nào.
    """
    return (~torch.isnan(x).any(dim=-1))
