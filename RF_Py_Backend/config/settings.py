# config/settings.py
HORIZON = 24                    # 24h du bao (giong LSTM/XGBoost)
QUANTILES = [0.1, 0.5, 0.9]     # P10/P50/P90 -- dung contract voi ForecastRF (Node)

# Fixed-date split -- GIONG HET LSTM_Py_Backend_v2/config/settings.py
# (ReservoirLSTMConfig.train_end/val_start/val_end/test_start) de so NSE
# cong bang giua RF/XGBoost/LSTM tren cung 1 khoang test.
TRAIN_END = "2024-08-31"
VAL_START = "2024-09-01"
VAL_END = "2025-01-01"
TEST_START = "2025-09-01"

# Nguon backup Hugging Face khi khong co data local/Kaggle input -- xem
# LSTM_Py_Backend_v2/kaggle/generate_notebook_all.py (cung 1 nguon).
HF_REPO_ID = "Anvo2004/dataset_all_lake"
HF_ZIP_FILENAME = "datasets_all_reservoirs.zip"
