"""
dataset.py  –  ReservoirDataset + split + oversample
------------------------------------------------------
Load .npy files cho một hồ, split theo ngày cố định (flood-season aware),
và oversample các đỉnh lũ để cân bằng class.
"""

import os
import numpy as np
import torch
from torch.utils.data import Dataset, Subset


# Giới hạn outlier cho từng hồ trong sqrt space
INFLOW_CAPS_SQRT = {
    "avuong":    np.sqrt(2500),   # HO A VUONG      p99.9 ≈ 1705 m³/s
    "dakmi4":    np.sqrt(4500),   # HO DAK MI 4     p99.9 ≈ 2591 m³/s
    "songbung4": np.sqrt(4500),   # HO SONG BUNG 4  p99.9 ≈ 2078 m³/s
    "songtranh2":np.sqrt(8000),   # HO SONG TRANH 2 p99.9 ≈ 3686 m³/s
}


class ReservoirDataset(Dataset):
    """Dataset cho một hồ đơn. X_past đã được scale bởi global_scaler."""

    def __init__(self, X_past: np.ndarray, X_future: np.ndarray | None,
                 y: np.ndarray, cap: float | None = None):
        self.X_past   = X_past
        self.X_future = X_future
        self.y        = y
        self.cap      = cap

    def __len__(self) -> int:
        return len(self.X_past)

    def __getitem__(self, idx: int):
        y = np.array(self.y[idx], copy=True).astype(np.float32)
        if self.cap is not None:
            y = np.clip(y, 0.0, self.cap)

        x_past = torch.from_numpy(np.array(self.X_past[idx], copy=False)).float()
        x_fut  = (
            torch.from_numpy(np.array(self.X_future[idx], copy=False)).float()
            if self.X_future is not None
            else torch.zeros(0)
        )
        return x_past, x_fut, torch.from_numpy(y).float()


def load_npy_files(data_dir: str, reservoir_name: str):
    """
    Load .npy files từ data_dir/reservoir_name/.
    Trả về (X_past, X_future|None, y, timestamps, cap).
    """
    d = os.path.join(data_dir, reservoir_name)
    X_past     = np.load(os.path.join(d, "X_past.npy"),     mmap_mode="r")
    y          = np.load(os.path.join(d, "y.npy"),          mmap_mode="r")
    timestamps = np.load(os.path.join(d, "timestamps.npy"), mmap_mode="r")

    x_fut_path = os.path.join(d, "X_future.npy")
    X_future   = np.load(x_fut_path, mmap_mode="r") if os.path.exists(x_fut_path) else None

    cap = INFLOW_CAPS_SQRT.get(reservoir_name)
    return X_past, X_future, y, timestamps, cap


def make_split(X_past, X_future, y, timestamps, cap=None):
    """
    Fixed-date split (flood-season aware):
      Train : 2022-01-01 → 2024-08-31
      Val   : 2024-09-01 → 2024-12-31  (mùa lũ 2024 → early stopping thực tế)
      Test  : 2025-09-01 → 2025-12-31  (holdout 2025)
      Bỏ qua: 2025-01-01 → 2025-08-31  (giữ test sạch)

    Trả về (train_ds, val_ds, test_ds, train_y_peaks).
    """
    VAL_START  = np.datetime64("2024-09-01", "s")
    VAL_END    = np.datetime64("2025-01-01", "s")
    TEST_START = np.datetime64("2025-09-01", "s")

    all_idx    = np.arange(len(timestamps))
    train_idx  = all_idx[timestamps < VAL_START]
    val_idx    = all_idx[(timestamps >= VAL_START) & (timestamps < VAL_END)]
    test_idx   = all_idx[timestamps >= TEST_START]

    train_ds = ReservoirDataset(X_past[train_idx], X_future[train_idx] if X_future is not None else None, y[train_idx], cap)
    val_ds   = ReservoirDataset(X_past[val_idx],   X_future[val_idx]   if X_future is not None else None, y[val_idx],   cap)
    test_ds  = ReservoirDataset(X_past[test_idx],  X_future[test_idx]  if X_future is not None else None, y[test_idx],  cap)

    train_y_peaks = np.array(y[train_idx]).max(axis=1)  # (N_train,) – peak per sample
    return train_ds, val_ds, test_ds, train_y_peaks


def oversample_floods(train_ds: ReservoirDataset,
                      train_y_peaks: np.ndarray) -> Subset:
    """
    Flood oversampling:
      Top 5% (p95 peaks) → lặp 2×
      Top 1% (p99 peaks) → lặp 3×
    """
    thr_95 = float(np.percentile(train_y_peaks, 95))
    thr_99 = float(np.percentile(train_y_peaks, 99))

    idx_95 = np.where(train_y_peaks >= thr_95)[0].tolist()
    idx_99 = np.where(train_y_peaks >= thr_99)[0].tolist()

    all_indices = list(range(len(train_ds))) + idx_95 * 2 + idx_99 * 3
    return Subset(train_ds, all_indices)
