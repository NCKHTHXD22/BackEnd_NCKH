"""
Config cho LSTM_Py_Backend_v2 — 1 model độc lập cho MỖI hồ (không reservoir
embedding, không train chung 16 hồ).

Lý do tách khỏi lstm_service/config/settings_v2.py (FloodLSTMv2Config):
  - Baseline NSE cũ (artifacts/plots/metrics.txt, lstm_service) cho thấy model
    chung có độ lệch rất lớn giữa các hồ (0.87 xuống tới âm) — nghi ngờ 1 vài
    hồ dữ liệu xấu (xem INFLOW_CAPS_M3S bên dưới, đánh dấu "lỗi data") kéo NSE
    trung bình xuống hoặc gây nhiễu học chung.
  - Train riêng từng hồ: đổi 1 hồ dữ liệu xấu KHÔNG ảnh hưởng tới model của
    các hồ khác, dễ debug/so sánh NSE per-reservoir hơn.

Mặc định hindcast/forecast GIỮ NGUYÊN theo hợp đồng production hiện tại
(SEQ_LENGTH=240h/10 ngày, HORIZON=24h — xem lstm_service/config/settings.py)
để model mới có thể thay thế v1 sau này mà không cần đổi phía Node.js/cron.
Có thể chỉnh forecast_len=168 (7 ngày, kiểu Google FloodHub) nếu muốn.
"""

from dataclasses import dataclass, field


@dataclass
class ReservoirLSTMConfig:
    # ── Hồ đang train (bắt buộc set trước khi build dataset/train) ─────────────
    rid: int = 0                     # key trong config/reservoirs.py RESERVOIRS
    reservoir_name: str = ""         # điền tự động từ RESERVOIRS[rid]["name"]

    # ── Sequence lengths (giữ theo hợp đồng production v1) ──────────────────────
    hindcast_len: int = 240          # 10 ngày lịch sử (hourly) — SEQ_LENGTH cũ
    forecast_len: int = 24           # 24h dự báo — HORIZON cũ
    #   Muốn thử 7-ngày kiểu FloodLSTMv2/Google: hindcast_len=720, forecast_len=168

    # ── Model dimensions ──────────────────────────────────────────────────────
    hidden_size: int = 128           # nhỏ hơn bản dùng chung (256) vì data/model giờ nhỏ hơn nhiều
    num_layers: int = 2
    nwp_embed_dim: int = 32

    # ── Input features ─────────────────────────────────────────────────────────
    # 47 = 18 rain + 12 inflow + 6 reservoir + 5 meteo (temp/rh/pressure/et0/wind,
    # đủ 5 vì giờ có Open-Meteo archive — xem data/nwp_fetcher.py) + 6 thời gian
    n_hindcast_features: int = 47    # xem data/dataset_builder.py FEATURES
    n_nwp_features: int = 6          # rain_fc, rain_fc_3h, rain_fc_6h, rain_fc_24h, temp_fc, wind_fc
    n_nwp_sources: int = 1           # chỉ Open-Meteo — không có nguồn dự phòng như bản chung

    # ── Học trọng số trạm mưa (tùy chọn, TẮT mặc định) ───────────────────────────
    # data/rain_matrix_loader.py::load_station_rain_matrix() đã parse thật mưa từng
    # trạm từ Data_Tung_Ho_Ma_Tran_Rong/*.xlsx (Col 121+i*24, đã verify trên file
    # thật — xem data/dataset_builder.py). Bật cờ này để dataset_builder.py build
    # v2_station_rain.npy/v2_station_mask.npy/v2_station_prior_weights.npy — mặc
    # định TẮT vì cần rebuild dataset + train lại từ đầu (đổi input dim của model).
    use_station_attention: bool = False
    max_stations: int = 7            # số trạm tối đa/hồ, xem RESERVOIR_TO_STATIONS

    # ── Khử điểm nhiễu/outlier (Hampel filter) ───────────────────────────────────
    # Bổ sung cho INFLOW_CAPS_M3S (chỉ chặn trần cứng): rolling median + MAD có thể
    # phát hiện các điểm lệch bất thường nằm DƯỚI cap (vd cảm biến nhiễu ngắn hạn) —
    # xem data/dataset_builder.py::_hampel_despike(). ĐÃ TEST trên dữ liệu thật
    # (datasets/*/v2_y.npy): với window=7, tỷ lệ điểm bị sửa KHÔNG đặc hiệu cho các
    # hồ "lỗi data" — Sông Tranh 2 (hồ tốt, NSE=0.496) bị đụng ~4-5% điểm trong khi
    # Đắk Mi 4C/Sông Bung 6 (2 hồ nghi lỗi data nhất) chỉ ~0.02-0.16%. Tức là filter
    # generic nhạy với biến động giờ-theo-giờ tự nhiên của hồ lưu lượng lớn hơn là
    # nhạy với lỗi cảm biến thật. MẶC ĐỊNH TẮT — chỉ bật thủ công (per-reservoir)
    # sau khi build thử và xem log "Despike: thay N điểm" in ra; > ~1% nên coi là
    # dấu hiệu cần chỉnh window/n_sigmas riêng cho hồ đó, không dùng nguyên default.
    despike: bool = False
    despike_window: int = 7          # số giờ trong cửa sổ rolling median (lẻ)
    despike_n_sigmas: float = 8.0    # ngưỡng lệch (x MAD quy đổi độ lệch chuẩn) để coi là outlier

    # ── Quantile output (7 mức, giống FloodLSTMv2) ───────────────────────────────
    quantiles: list = field(
        default_factory=lambda: [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
    )

    # ── Training hyperparameters ────────────────────────────────────────────────
    batch_size: int = 128
    epochs: int = 100
    lr: float = 3e-4
    weight_decay: float = 1e-3
    warmup_epochs: int = 10
    grad_clip: float = 1.0
    # 20 -> 30: tránh dừng sớm khi val loss còn dao động (đặc biệt val set nhỏ
    # của 1 hồ, ~2-3K mẫu) trước khi thực sự hội tụ — xem chẩn đoán NSE thấp.
    patience: int = 30

    teacher_forcing_start: float = 0.8
    teacher_forcing_end: float = 0.0

    oversample_p95_factor: int = 2
    # 3 -> 6: cung ly do peak_weight o tren -- nhan ban manh hon top 1%%
    # gia tri cuc tri de model thay nhieu mau lu that hon trong 1 epoch.
    oversample_p99_factor: int = 6
    # Bo sung oversample theo % cuc tri o tren (chi bat DIEM DINH rieng le):
    # nhan ban them CA giai doan mua mua (khong chi diem dinh) de model hoc ky
    # hon dang tang/giam cua tran lu, khong chi hoc gia tri tai 1 thoi diem don
    # le -- xem train_reservoir.py/pretrain_pooled.py phan "Oversampling mua".
    rainy_season_months: list = field(default_factory=lambda: [8, 9, 10, 11, 12])
    oversample_rainy_season_factor: int = 1

    # ── Loss weights (quantile_loss_v2) ─────────────────────────────────────────
    # Trước đây hard-code trong models/quantile_loss_v2.py, giờ đưa vào config để
    # tinh chỉnh/ablation được (vd peak_weight=0, coverage_weight=0 -> pinball
    # loss thuần, so sánh NSE để tách bạch "model dở" khỏi "loss không tối ưu
    # trực tiếp NSE" — xem chẩn đoán NSE thấp per-reservoir).
    horizon_decay: float = 0.02
    coverage_weight: float = 0.05
    # 0.15 -> 0.35: du bao dinh lu hut 50-80% so voi thuc te (xem chan doan
    # event_diagnostics tren ket qua train that) -- tang manh trong so MSE
    # rieng cho P50 tai cac diem lu de buoc model uu tien do chinh xac dinh
    # hon la phan phoi quantile ho quan.
    peak_weight: float = 0.35

    target_noise_std: float = 0.005

    # ── Training splits (fixed-date) ────────────────────────────────────────────
    # Dữ liệu thật trải dài 2022-01-11 -> 2025-12-30 (giống hệt nhau ở cả 16 hồ).
    # Bộ mốc cũ (train<2024-08-31 / val 09-2024..01-2025 / test>=2025-09-01) bỏ
    # trống toàn bộ 2025-01-01..2025-09-01 (8 tháng, trọn mùa khô 2025) và khiến
    # tập test CHỈ còn tháng 9-12 (toàn mùa mưa) -- nse_dry_season/rainy_season
    # trong evaluate_model_on_reservoir() không bao giờ có đủ 2 mùa để so sánh.
    # Dời test_start lên đầu năm để test bao trọn 12 tháng cuối (đủ cả mùa khô
    # T1-8 và mùa mưa T9-12/2025), không còn khoảng trống dữ liệu.
    train_end: str = "2024-06-01"
    val_start: str = "2024-06-01"
    val_end: str = "2025-01-01"
    test_start: str = "2025-01-01"

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


# ═══════════════════════════════════════════════════════════════════════════════
# Giới hạn inflow hợp lý (m3/s) — copy từ lstm_service/data/dataset_builder.py.
# Các hồ đánh dấu "lỗi data" là nghi phạm hàng đầu cho NSE thấp trong baseline
# cũ (Song Bung 2 idx6, Song Bung 6 idx7, Dak Mi 3 idx10, Khe Dien idx11,
# Dak Mi 2 idx14) — ưu tiên kiểm tra lại coverage/outlier khi train hồ này.
# ═══════════════════════════════════════════════════════════════════════════════
INFLOW_CAPS_M3S = {
    1:  2500,   # HO A VUONG        (idx=0)
    2:  4500,   # HO DAK MI 4       (idx=1)
    3:  4500,   # HO SONG BUNG 4    (idx=2)
    4:  8000,   # HO SONG TRANH 2   (idx=3)
    7:  7000,   # HO SONG BUNG 4A   (idx=4)
    8:  7000,   # HO SONG BUNG 5    (idx=5)
    9:  800,    # HO SONG BUNG 2    (idx=6)  — lỗi data (p99.9=617, max quan trắc=19701)
    11: 8000,   # HO SONG BUNG 6    (idx=7)  — lỗi data (p99.9=5946, max quan trắc=40232)
    12: 12000,  # HO SONG TRANH 3   (idx=8)
    13: 2500,   # HO ZA HUNG        (idx=9)
    14: 2000,   # HO DAK MI 3       (idx=10) — lỗi data (p99.9=1350, max quan trắc=35321)
    15: 1000,   # HO KHE DIEN       (idx=11) — lỗi data (p99.9=729,  max quan trắc=6087)
    16: 900,    # HO SONG CON 2     (idx=12)
    17: 13000,  # HO SONG TRANH 4   (idx=13)
    18: 2500,   # HO DAK MI 2       (idx=14) — lỗi data rõ ràng (p99.9=1537, max quan trắc=391526)
    19: 700,    # HO DAK MI 4C      (idx=15)
}
