# settings.py
SEQ_LENGTH = 240   # 10 ngày lịch sử (hourly)
HORIZON    = 24    # 24h dự báo

HIDDEN_SIZE = 128
NUM_LAYERS  = 2

BATCH_SIZE    = 512
EPOCHS        = 60
LR            = 2e-4
WEIGHT_DECAY  = 1e-3
WARMUP_EPOCHS = 8

QUANTILES      = [0.1, 0.5, 0.9]
NUM_RESERVOIRS = 16

# ── X_future ──────────────────────────────────────────────────────────────────
# Số features mỗi bước tương lai: [rain_fc, rain_fc_6h, rain_fc_24h]
N_FUTURE_FEATURES = 3