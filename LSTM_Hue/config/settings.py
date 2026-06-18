"""
Cấu hình cho HueLSTM — theo Google Flood Forecasting (MeanEmbeddingForecastLSTM).

Tham khảo: google-research/flood-forecasting/example-configs/floodhub-settings-config.yml
Thay đổi chính cho Thừa Thiên Huế:
  - 3 lưu vực thay vì global scale
  - Dữ liệu VNDMS + Open-Meteo thay vì ECMWF
  - Thêm typhoon feature (quan trọng cho Huế)
  - Basin embedding thay vì 100+ static attributes (ít hồ hơn, đủ dùng embedding)
"""

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class HueLSTMConfig:
    # ── Model ──────────────────────────────────────────────────────────────────
    model: str = "mean_embedding_forecast_lstm"

    # ── Architecture (theo Google production config) ────────────────────────────
    hidden_size: int = 256          # Google FloodHub dùng 512, ta dùng 256 (3 lưu vực)
    num_layers: int = 2
    dropout: float = 0.4
    fc_hidden: int = 128            # Hidden dim trong embedding FC networks
    basin_embed_dim: int = 32       # Thay thế static attributes (Google dùng 100+ features)

    # ── Features ───────────────────────────────────────────────────────────────
    n_hist_features: int = 45       # Hindcast observation features (xem feature_builder.py)
    n_nwp_features: int = 8         # NWP forecast features per timestep
    n_basins: int = 3               # Tả Trạch, Bình Điền, Hương Điền

    # ── Sequence lengths ───────────────────────────────────────────────────────
    hindcast_length: int = 720      # 30 ngày (có thể nâng 8760=365d sau khi có đủ data)
    forecast_length: int = 168      # 7 ngày (theo Google Flood Hub)

    # ── Probabilistic output ───────────────────────────────────────────────────
    head: str = "quantile"          # "quantile" | "cmal" (xem models/losses.py)
    quantiles: list = field(
        default_factory=lambda: [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
    )
    n_distributions: int = 3        # Cho CMAL head (Countable Mixture of Asymmetric Laplacians)
    pred_clip: list = field(default_factory=lambda: [0.0, None])  # clip Q ≥ 0

    # ── Data transform ─────────────────────────────────────────────────────────
    sqrt_transform: bool = True     # Q → √Q (ổn định training, theo v1)
    target_noise_std: float = 0.005 # Gaussian noise on targets (theo Google: tránh overfit)

    # ── Training splits (fixed-date) ───────────────────────────────────────────
    train_start: str = "2012-01-01"
    train_end: str = "2022-12-31"
    val_start: str = "2023-01-01"   # Mùa lũ 2023
    val_end: str = "2023-12-31"
    test_start: str = "2024-01-01"  # Mùa lũ 2024 — holdout

    # ── Training hyperparameters ────────────────────────────────────────────────
    batch_size: int = 64
    epochs: int = 100
    lr: float = 5e-4
    weight_decay: float = 0.0       # Google không dùng L2 (CMAL đã regularize đủ)
    warmup_epochs: int = 10
    gradient_clip_norm: float = 1.0 # Giống Google config

    # Teacher forcing: giảm tuyến tính (giảm compounding error trong AR decoder)
    teacher_forcing_start: float = 0.8
    teacher_forcing_end: float = 0.0

    # ── LR Scheduler ───────────────────────────────────────────────────────────
    scheduler: str = "cosine"       # "cosine" | "reduce_on_plateau"

    # ── Oversampling (flood events) ─────────────────────────────────────────────
    oversample_p95_factor: int = 2
    oversample_p99_factor: int = 3

    # ── Inference ──────────────────────────────────────────────────────────────
    inference_method: str = "median"  # Theo Google FloodHub

    # ── Paths ──────────────────────────────────────────────────────────────────
    data_dir: str = "."
    artifacts_dir: str = "artifacts"

    @property
    def n_quantiles(self) -> int:
        return len(self.quantiles)

    @property
    def median_idx(self) -> int:
        return self.n_quantiles // 2

    def teacher_forcing_ratio(self, epoch: int) -> float:
        p = epoch / max(self.epochs - 1, 1)
        return self.teacher_forcing_start * (1 - p) + self.teacher_forcing_end * p

    @classmethod
    def from_yaml(cls, path: str) -> "HueLSTMConfig":
        import yaml
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        obj = cls()
        for k, v in data.items():
            if hasattr(obj, k):
                setattr(obj, k, v)
        return obj

    def to_yaml(self, path: str):
        import yaml
        from dataclasses import asdict
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(asdict(self), f, default_flow_style=False, allow_unicode=True)
