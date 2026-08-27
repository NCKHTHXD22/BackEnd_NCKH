# training/train_xgb.py
"""
Huan luyen mo hinh XGBoost GLOBAL (16 ho chung 1 bo booster, reservoir index
la 1 feature one-hot) de du bao luu luong den (Qvao), direct multi-horizon
(1..24h), 3 quantile P10/P50/P90 -- cung response contract voi LSTM/RF.

Nguon du lieu: data/tabular_dataset.py (doc tu LSTM_Py_Backend_v2/datasets/
da build san, fallback Kaggle input / Hugging Face 'Anvo2004/dataset_all_lake'
-- KHONG con phu thuoc Excel goc, xem README.md).

Vi sao model GLOBAL: xem README.md -- LSTM_Py_Backend_v2 tung bo global-model
va ket qua tung ho te hon han.

Chay: python training/train_xgb.py
Yeu cau: pip install xgboost>=2.0
"""
import os
import sys
import time
import numpy as np
import xgboost as xgb

if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from config.settings import QUANTILES, HORIZON, RAINY_SEASON_WEIGHT
from data.tabular_dataset import build_tabular_dataset, split_60_20_20, RAINY_SEASON_MONTHS

ARTIFACT_DIR = "artifacts/xgb"


def flood_sample_weight(y_train: np.ndarray, ts_train: np.ndarray) -> np.ndarray:
    """Trong so mau -- bien do dinh lu (top5%->x2, top1%->x3, giong
    train_global.py/train_rf.py) NHAN THEM RAINY_SEASON_WEIGHT cho mau roi
    vao mua lu Vu Gia - Thu Bon (thang 9 -> thang 1 nam sau), theo yeu cau
    uu tien bat dinh lu tap trung mua mua cua du an."""
    peak = y_train.max(axis=1)
    w = np.ones(len(y_train), dtype=np.float32)
    thr_95 = np.percentile(peak, 95)
    thr_99 = np.percentile(peak, 99)
    w[peak >= thr_95] = 2.0
    w[peak >= thr_99] = 3.0

    months = ts_train.astype("datetime64[M]").astype(int) % 12 + 1
    is_rainy = np.isin(months, list(RAINY_SEASON_MONTHS))
    w[is_rainy] *= RAINY_SEASON_WEIGHT
    return w


def train():
    print("=" * 70)
    print("TRAIN XGBOOST GLOBAL -- direct multi-horizon quantile regression")
    print("=" * 70)

    X, y, rid, ts = build_tabular_dataset()
    train_idx, val_idx, test_idx = split_60_20_20(ts)
    print(f"Total samples: {len(X):,} | features: {X.shape[1]}")
    print(f"Train : {len(train_idx):,}  (60%)")
    print(f"Val   : {len(val_idx):,}  (20%)")
    print(f"Test  : {len(test_idx):,}  (20%)")
    if len(train_idx) == 0 or len(val_idx) == 0:
        raise RuntimeError("Train/Val rong -- kiem tra du lieu trong LSTM_Py_Backend_v2/datasets/.")

    sample_weight = flood_sample_weight(y[train_idx], ts[train_idx])
    os.makedirs(ARTIFACT_DIR, exist_ok=True)

    params_base = dict(
        tree_method="hist",
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_lambda=1.0,
    )

    t0 = time.time()
    n_trained = 0
    for h in range(HORIZON):
        dtrain = xgb.DMatrix(X[train_idx], label=y[train_idx, h], weight=sample_weight)
        dval = xgb.DMatrix(X[val_idx], label=y[val_idx, h])

        for q in QUANTILES:
            params = {**params_base, "objective": "reg:quantileerror", "quantile_alpha": q}
            bst = xgb.train(
                params, dtrain,
                num_boost_round=2000,
                evals=[(dval, "val")],
                early_stopping_rounds=50,
                verbose_eval=False,
            )
            bst.save_model(f"{ARTIFACT_DIR}/h{h + 1:02d}_q{int(q * 100):02d}.json")
            n_trained += 1

        print(f"  [OK] horizon h+{h + 1:02d}/{HORIZON}")

    elapsed = time.time() - t0
    print(f"\nDa train {n_trained} booster ({HORIZON} horizon x {len(QUANTILES)} quantile) "
          f"trong {elapsed:.1f}s -> {ARTIFACT_DIR}/")
    print("Tiep theo: python training/evaluate_xgb.py")


if __name__ == "__main__":
    train()
