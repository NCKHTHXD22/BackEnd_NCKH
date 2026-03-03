#settings.py
SEQ_LENGTH = 72
HORIZON = 12

HIDDEN_SIZE = 128 # Reduced from 256 to prevent overfitting
NUM_LAYERS = 2

BATCH_SIZE = 64
EPOCHS = 100 # Increased as we have better stability now
LR = 0.0001

QUANTILES = [0.1, 0.5, 0.9]
NUM_RESERVOIRS = 16