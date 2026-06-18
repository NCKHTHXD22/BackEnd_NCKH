from dataclasses import dataclass, field


@dataclass
class FloodLSTMv2Config:
    """
    Configuration cho FloodLSTM v2 — Google Flood Forecasting inspired.

    Thay đổi chính so với v1 (settings.py):
      - Hindcast 30 ngày (720h) thay vì 10 ngày (240h)
      - Forecast 7 ngày (168h) thay vì 24h
      - 7 quantiles (P5–P95) thay vì 3 (P10/P50/P90)
      - Teacher forcing annealing trong training
      - NWP fusion hỗ trợ multi-source
    """

    # ── Sequence lengths ───────────────────────────────────────────────────────
    hindcast_len: int = 720     # 30 ngày lịch sử (hourly)
    forecast_len: int = 168     # 7 ngày dự báo

    # ── Model dimensions ───────────────────────────────────────────────────────
    hidden_size: int = 256
    num_layers: int = 2
    reservoir_embed_dim: int = 16
    nwp_embed_dim: int = 64     # output dim của NWP fusion layer

    # ── Input features ─────────────────────────────────────────────────────────
    n_hindcast_features: int = 46   # giữ nguyên 46 features từ feature_engineering.py
    n_nwp_features: int = 6         # per NWP source: rain, rain_3h, rain_6h, rain_24h, temp, wind
    n_nwp_sources: int = 2          # Open-Meteo + backup (GFS/ERA5); source 2 có thể zero

    # ── Reservoir ──────────────────────────────────────────────────────────────
    n_reservoirs: int = 20          # 16 hiện tại + padding cho mở rộng

    # ── Quantile output ────────────────────────────────────────────────────────
    quantiles: list = field(
        default_factory=lambda: [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
    )

    # ── Training ───────────────────────────────────────────────────────────────
    batch_size: int = 128           # nhỏ hơn v1 do sequence dài hơn
    epochs: int = 80
    lr: float = 1e-4
    weight_decay: float = 1e-3
    warmup_epochs: int = 10
    grad_clip: float = 1.0

    # Teacher forcing: bắt đầu 0.8 → giảm tuyến tính về 0.0 ở epoch cuối
    # Epoch đầu: 80% khả năng dùng ground-truth làm decoder input (ổn định hơn)
    # Epoch cuối: 0% — model tự predict như lúc inference (giảm compounding error)
    teacher_forcing_start: float = 0.8
    teacher_forcing_end: float = 0.0

    # ── Oversampling thresholds (giữ nguyên từ train_global.py) ───────────────
    oversample_p95_factor: int = 2
    oversample_p99_factor: int = 3

    @property
    def n_quantiles(self) -> int:
        return len(self.quantiles)

    @property
    def median_idx(self) -> int:
        return self.n_quantiles // 2

    def teacher_forcing_ratio(self, epoch: int) -> float:
        progress = epoch / max(self.epochs - 1, 1)
        return self.teacher_forcing_start * (1.0 - progress) + self.teacher_forcing_end * progress
