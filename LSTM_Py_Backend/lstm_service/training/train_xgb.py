# training/train_xgb.py
"""
Huấn luyện mô hình XGBoost GLOBAL (16 hồ chung 1 bộ booster, reservoir index
là 1 feature one-hot) để dự báo lưu lượng đến (Qvào), direct multi-horizon
(1..24h), 3 quantile P10/P50/P90 — cùng response contract với LSTM/RF.

Vì sao GLOBAL model (không train riêng từng hồ):
LSTM_Py_Backend_v2 từng thử bỏ global-model để train riêng từng hồ và kết quả
tệ hơn hẳn (vd A Vương NSE 0.316 so với 0.804 của global model) — xem
[[project_scopus_paper_gaps]]. XGBoost đi theo hướng global đã được kiểm
chứng tốt hơn, đồng thời hồ nào ít dữ liệu vẫn học được nhờ chia sẻ pattern
từ các hồ khác.

Dùng đúng ngày train/val/test split với train_global.py (LSTM) để so sánh
NSE công bằng giữa 2 mô hình trên cùng 1 khoảng test.

Chạy: python training/train_xgb.py
Yêu cầu: đã chạy `python main_build_tabular_dataset.py` trước để sinh
dataset_X_tabular.npy / dataset_y_tabular.npy / dataset_rid_tabular.npy /
dataset_ts_tabular.npy.
"""
import os
import sys
import time
import numpy as np
import xgboost as xgb

# Console Windows mac dinh dung cp1252, khong encode duoc dau tieng Viet trong
# cac print() ben duoi -> crash UnicodeEncodeError o cuoi script (da gap khi
# test). Ep UTF-8 de chay an toan tren moi platform (Windows/Linux/Kaggle).
if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from config.settings import QUANTILES, HORIZON, NUM_RESERVOIRS

ARTIFACT_DIR = "artifacts/xgb"

# Cap sqrt-space theo hồ, giống INFLOW_CAPS_SQRT trong train_global.py — tránh
# vài điểm lỗi dữ liệu (giá trị inflow phi thực tế) kéo lệch quantile cao.
INFLOW_CAPS_SQRT = {
    0:  np.sqrt(2500),   1:  np.sqrt(4500),   2:  np.sqrt(4500),   3:  np.sqrt(8000),
    4:  np.sqrt(7000),   5:  np.sqrt(7000),   6:  np.sqrt(800),    7:  np.sqrt(8000),
    8:  np.sqrt(12000),  9:  np.sqrt(2500),   10: np.sqrt(2000),   11: np.sqrt(1000),
    12: np.sqrt(900),    13: np.sqrt(13000),  14: np.sqrt(2500),   15: np.sqrt(700),
}


def load_dataset():
    X   = np.load("dataset_X_tabular.npy")
    y   = np.load("dataset_y_tabular.npy")
    rid = np.load("dataset_rid_tabular.npy")
    ts  = np.load("dataset_ts_tabular.npy")
    return X, y, rid, ts


def clip_targets(y: np.ndarray, rid: np.ndarray) -> np.ndarray:
    y = y.copy()
    for r, cap in INFLOW_CAPS_SQRT.items():
        mask = rid == r
        if mask.any():
            y[mask] = np.clip(y[mask], 0, cap)
    return y


def build_features(X: np.ndarray, rid: np.ndarray) -> np.ndarray:
    """Ghép one-hot reservoir index vào feature matrix -> model GLOBAL."""
    rid_onehot = np.eye(NUM_RESERVOIRS, dtype=np.float32)[rid]
    return np.concatenate([X, rid_onehot], axis=1)


def split_by_date(ts: np.ndarray):
    """Fixed-date split — GIỐNG HỆT train_global.py để so NSE công bằng.
    Train : < 2024-09-01 | Val (flood season 2024): 2024-09-01..2025-01-01
    Test  (flood season 2025 holdout): >= 2025-09-01"""
    VAL_START  = np.datetime64("2024-09-01", "s")
    VAL_END    = np.datetime64("2025-01-01", "s")
    TEST_START = np.datetime64("2025-09-01", "s")

    train_idx = np.where(ts < VAL_START)[0]
    val_idx   = np.where((ts >= VAL_START) & (ts < VAL_END))[0]
    test_idx  = np.where(ts >= TEST_START)[0]
    return train_idx, val_idx, test_idx


def flood_sample_weight(y_train: np.ndarray) -> np.ndarray:
    """Oversampling lũ đỉnh qua sample_weight (thay vì duplicate row như LSTM) —
    top 5% peak -> weight x2, top 1% -> weight x3."""
    peak = y_train.max(axis=1)
    w = np.ones(len(y_train), dtype=np.float32)
    thr_95 = np.percentile(peak, 95)
    thr_99 = np.percentile(peak, 99)
    w[peak >= thr_95] = 2.0
    w[peak >= thr_99] = 3.0
    return w


def train():
    print("=" * 70)
    print("TRAIN XGBOOST GLOBAL — direct multi-horizon quantile regression")
    print("=" * 70)

    X, y, rid, ts = load_dataset()
    y = clip_targets(y, rid)
    X_full = build_features(X, rid)
    print(f"Total samples: {len(X_full):,} | features: {X_full.shape[1]} "
          f"({X.shape[1]} base + {NUM_RESERVOIRS} one-hot reservoir)")

    train_idx, val_idx, test_idx = split_by_date(ts)
    print(f"Train : {len(train_idx):,}")
    print(f"Val   : {len(val_idx):,}")
    print(f"Test  : {len(test_idx):,}")
    if len(train_idx) == 0 or len(val_idx) == 0:
        raise RuntimeError("Train/Val rỗng — kiểm tra lại dataset_ts_tabular.npy có đúng khoảng ngày không.")

    sample_weight = flood_sample_weight(y[train_idx])

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
    for h in range(HORIZON):  # 0..23 -> horizon h+1
        dtrain = xgb.DMatrix(X_full[train_idx], label=y[train_idx, h], weight=sample_weight)
        dval   = xgb.DMatrix(X_full[val_idx],   label=y[val_idx, h])

        for q in QUANTILES:  # [0.1, 0.5, 0.9] — 1 booster/quantile (tương thích mọi bản xgboost>=2.0)
            params = {**params_base, "objective": "reg:quantileerror", "quantile_alpha": q}
            bst = xgb.train(
                params, dtrain,
                num_boost_round=2000,
                evals=[(dval, "val")],
                early_stopping_rounds=50,
                verbose_eval=False,
            )
            bst.save_model(f"{ARTIFACT_DIR}/h{h+1:02d}_q{int(q*100):02d}.json")
            n_trained += 1

        print(f"  [OK] horizon h+{h+1:02d}/{HORIZON}  (best_iteration per quantile saved)")

    elapsed = time.time() - t0
    print(f"\nĐã train {n_trained} booster ({HORIZON} horizon x {len(QUANTILES)} quantile) "
          f"trong {elapsed:.1f}s -> {ARTIFACT_DIR}/")
    print("Tiếp theo: python training/evaluate_xgb.py")


if __name__ == "__main__":
    train()
