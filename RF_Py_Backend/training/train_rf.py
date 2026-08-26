# training/train_rf.py
"""
Huan luyen mo hinh Random Forest GLOBAL (16 ho chung, reservoir idx la 1
feature one-hot) de du bao luu luong den (Qvao), direct multi-horizon
(1..24h), 3 quantile P10/P50/P90 -- cung response contract voi LSTM/XGBoost.

Dung Quantile Regression Forest (thu vien quantile-forest, Meinshausen 2006)
thay vi RandomForestRegressor thuong: 1 RF cho ca 3 quantile cung luc (khong
can train 3 model rieng nhu pinball-loss approach cua XGBoost), vi RF khong
co objective quantile native nhu XGBoost -- QRF lay quantile thuc nghiem tu
phan phoi gia tri o cac leaf node thay vi chi lay trung binh.

Vi sao model GLOBAL (khong train rieng tung ho): LSTM_Py_Backend_v2 tung thu
bo global-model de train rieng tung ho va ket qua te hon han (vd A Vuong NSE
0.316 so voi 0.804 cua global model) -- xem [[project_scopus_paper_gaps]].
RF/XGBoost di theo huong global da duoc kiem chung tot hon.

Chay: python training/train_rf.py
Yeu cau: pip install quantile-forest
"""
import os
import sys
import time
import numpy as np
import joblib
from quantile_forest import RandomForestQuantileRegressor

if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from config.settings import HORIZON
from data.tabular_dataset import build_tabular_dataset, split_by_date

ARTIFACT_DIR = "artifacts/rf"


def flood_sample_weight(y_train: np.ndarray) -> np.ndarray:
    """Oversampling lu dinh qua sample_weight (khong duplicate row) -- top 5%
    peak -> weight x2, top 1% -> weight x3. Giong train_global.py/train_xgb.py."""
    peak = y_train.max(axis=1)
    w = np.ones(len(y_train), dtype=np.float32)
    thr_95 = np.percentile(peak, 95)
    thr_99 = np.percentile(peak, 99)
    w[peak >= thr_95] = 2.0
    w[peak >= thr_99] = 3.0
    return w


def train():
    print("=" * 70)
    print("TRAIN RANDOM FOREST GLOBAL -- Quantile Regression Forest (direct multi-horizon)")
    print("=" * 70)

    X, y, rid, ts = build_tabular_dataset()
    train_idx, val_idx, test_idx = split_by_date(ts)
    print(f"Train : {len(train_idx):,}")
    print(f"Val   : {len(val_idx):,}  (khong dung de early-stop -- RF khong co early stopping "
          f"native nhu XGBoost/LSTM; giu val_idx de doi chieu/tune n_estimators thu cong)")
    print(f"Test  : {len(test_idx):,}")
    if len(train_idx) == 0:
        raise RuntimeError("Train set rong -- kiem tra lai dataset_ts trong LSTM_Py_Backend_v2/datasets/.")

    sample_weight = flood_sample_weight(y[train_idx])
    os.makedirs(ARTIFACT_DIR, exist_ok=True)

    t0 = time.time()
    for h in range(HORIZON):
        qrf = RandomForestQuantileRegressor(
            n_estimators=300,
            max_depth=14,
            min_samples_leaf=5,
            n_jobs=-1,
            random_state=42,
        )
        qrf.fit(X[train_idx], y[train_idx, h], sample_weight=sample_weight)
        joblib.dump(qrf, f"{ARTIFACT_DIR}/h{h + 1:02d}.joblib")
        print(f"  [OK] horizon h+{h + 1:02d}/{HORIZON}")

    elapsed = time.time() - t0
    print(f"\nDa train {HORIZON} Quantile Regression Forest trong {elapsed:.1f}s -> {ARTIFACT_DIR}/")
    print("Tiep theo: python training/evaluate_rf.py")


if __name__ == "__main__":
    train()
