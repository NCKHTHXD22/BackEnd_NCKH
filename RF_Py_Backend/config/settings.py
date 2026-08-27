# config/settings.py
HORIZON = 24                    # 24h du bao (giong LSTM/XGBoost)
QUANTILES = [0.1, 0.5, 0.9]     # P10/P50/P90 -- dung contract voi ForecastRF (Node)

# Split 60% train / 20% val / 20% test THEO THOI GIAN (data/tabular_dataset.py
# ::split_60_20_20) -- theo yeu cau phuong phap cua du an, thay cho fixed-date
# split truoc day.

# Trong so mua lu Vu Gia - Thu Bon (thang 9 -> thang 1 nam sau) khi train --
# xem data/tabular_dataset.py::RAINY_SEASON_MONTHS. Nhan them vao trong so
# theo bien do dinh lu da co (top5%->2x, top1%->3x).
RAINY_SEASON_WEIGHT = 1.5

# Nguon backup Hugging Face khi khong co data local/Kaggle input -- xem
# LSTM_Py_Backend_v2/kaggle/generate_notebook_all.py (cung 1 nguon). LUU Y:
# repo nay hien TRONG (khong co file zip that) -- xem README.md.
HF_REPO_ID = "Anvo2004/dataset_all_lake"
HF_ZIP_FILENAME = "datasets_all_reservoirs.zip"
