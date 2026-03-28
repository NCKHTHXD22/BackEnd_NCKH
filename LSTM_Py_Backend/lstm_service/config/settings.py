#settings.py
SEQ_LENGTH = 72
HORIZON = 12

HIDDEN_SIZE = 192
NUM_LAYERS = 2

BATCH_SIZE = 128
EPOCHS = 150
LR = 2e-4        # Reduced from 5e-4 to prevent overshooting
WEIGHT_DECAY = 1e-3  # Stronger L2 regularization vs 1e-4 before
WARMUP_EPOCHS = 5     # Cosine warmup before decay begins

QUANTILES = [0.1, 0.5, 0.9]
NUM_RESERVOIRS = 16