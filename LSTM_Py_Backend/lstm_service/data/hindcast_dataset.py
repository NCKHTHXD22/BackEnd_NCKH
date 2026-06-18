"""
HindcastDataset — Dataset cho FloodLSTM v2.

Tạo sliding windows (720h hindcast + 168h forecast) từ time series thô mỗi hồ.
Dùng raw time-series array (đã feature-engineer và scale) — không build lại từ Excel.

Cách tích hợp với pipeline hiện tại:
  1. Chạy dataset_builder.py như cũ để có dữ liệu đã xử lý
  2. Dùng HindcastDatasetV2Builder để stitching lại thành cửa sổ 720h+168h
  3. HindcastDataset load .npy files mới này cho training

Định dạng .npy mới (prefix: v2_):
  v2_X_hindcast.npy   : (N, 720, 46)  — 30 ngày lịch sử, đã scale
  v2_X_nwp_src0.npy   : (N, 168, 6)  — Open-Meteo forecast features
  v2_X_nwp_src1.npy   : (N, 168, 6)  — Backup NWP (zeros nếu không có)
  v2_nwp_avail.npy    : (N, 2)       — availability mask
  v2_y.npy            : (N, 168)     — target inflow, sqrt space
  v2_rid.npy          : (N,)        — reservoir index
  v2_timestamps.npy   : (N,)        — datetime64[s] của bước đầu forecast
"""

import os
import numpy as np
import torch
from torch.utils.data import Dataset


# Kế thừa INFLOW_CAPS_SQRT từ train_global.py
INFLOW_CAPS_SQRT = {
    0:  np.sqrt(2500),
    1:  np.sqrt(4500),
    2:  np.sqrt(4500),
    3:  np.sqrt(8000),
    4:  np.sqrt(7000),
    5:  np.sqrt(7000),
    6:  np.sqrt(800),
    7:  np.sqrt(8000),
    8:  np.sqrt(12000),
    9:  np.sqrt(2500),
    10: np.sqrt(2000),
    11: np.sqrt(1000),
    12: np.sqrt(900),
    13: np.sqrt(13000),
    14: np.sqrt(2500),
    15: np.sqrt(700),
}


class HindcastDataset(Dataset):
    """
    Dataset cho FloodLSTM v2.

    Load v2_*.npy files đã được build bởi HindcastDatasetV2Builder.
    Mỗi sample = (x_hindcast, nwp_src0, nwp_src1, nwp_avail, y, rid).
    """

    def __init__(self, data_dir: str = "."):
        self.X_hind  = np.load(os.path.join(data_dir, "v2_X_hindcast.npy"),  mmap_mode="r")
        self.X_nwp0  = np.load(os.path.join(data_dir, "v2_X_nwp_src0.npy"), mmap_mode="r")
        self.X_nwp1  = np.load(os.path.join(data_dir, "v2_X_nwp_src1.npy"), mmap_mode="r")
        self.avail   = np.load(os.path.join(data_dir, "v2_nwp_avail.npy"),   mmap_mode="r")
        self.y       = np.load(os.path.join(data_dir, "v2_y.npy"),            mmap_mode="r")
        self.rid     = np.load(os.path.join(data_dir, "v2_rid.npy"),          mmap_mode="r")

        ts_path = os.path.join(data_dir, "v2_timestamps.npy")
        self.timestamps = np.load(ts_path) if os.path.exists(ts_path) else None

        print(f"HindcastDataset: {len(self):,} samples | "
              f"hindcast={self.X_hind.shape[1]}h | forecast={self.y.shape[1]}h")

    def __len__(self) -> int:
        return len(self.y)

    def __getitem__(self, idx: int):
        rid_val = int(self.rid[idx])
        cap = INFLOW_CAPS_SQRT.get(rid_val)

        y = np.array(self.y[idx], copy=True, dtype=np.float32)
        if cap is not None:
            y = np.clip(y, 0.0, cap)

        x_hind = torch.from_numpy(np.array(self.X_hind[idx],  copy=False)).float()
        x_nwp0 = torch.from_numpy(np.array(self.X_nwp0[idx],  copy=False)).float()
        x_nwp1 = torch.from_numpy(np.array(self.X_nwp1[idx],  copy=False)).float()
        avail  = torch.from_numpy(np.array(self.avail[idx],    copy=False)).float()
        y_t    = torch.from_numpy(y).float()
        rid_t  = torch.tensor(rid_val, dtype=torch.long)

        return x_hind, x_nwp0, x_nwp1, avail, y_t, rid_t


# ═══════════════════════════════════════════════════════════════════════════════
# Builder — Xây dựng v2_*.npy từ existing per-reservoir time series
# ═══════════════════════════════════════════════════════════════════════════════

class HindcastDatasetV2Builder:
    """
    Xây dựng dataset v2 từ per-reservoir time series arrays.

    Cách dùng:
        builder = HindcastDatasetV2Builder(hindcast_len=720, forecast_len=168)

        # Mỗi hồ: thêm time series đã feature-engineer và scale
        builder.add_reservoir(
            rid=0,
            X_series=np.array(...),     # (T, 46) — đã scale
            y_series=np.array(...),     # (T,)    — sqrt(inflow), đã scale
            nwp_src0=np.array(...),     # (T, 6)  — Open-Meteo forecast aligned
            nwp_src1=np.array(...),     # (T, 6)  — backup NWP (None → zeros)
            timestamps=np.array(...),   # (T,) datetime64[s]
        )

        builder.save(".")  # lưu v2_*.npy vào thư mục hiện tại

    LƯU Ý về NWP alignment:
        nwp_src0[t] = forecast cho 168h TỪ thời điểm t (forecast start).
        Trong training: dùng oracle rain (quan trắc thực) để tránh compounding error.
        Trong inference: dùng Open-Meteo 7-day forecast thực sự.
    """

    def __init__(self, hindcast_len: int = 720, forecast_len: int = 168, stride: int = 1):
        self.hindcast_len = hindcast_len
        self.forecast_len = forecast_len
        self.stride = stride
        self._window_len = hindcast_len + forecast_len

        self._X_hind: list  = []
        self._X_nwp0: list  = []
        self._X_nwp1: list  = []
        self._avail: list   = []
        self._y: list       = []
        self._rid: list     = []
        self._ts: list      = []

    def add_reservoir(
        self,
        rid: int,
        X_series: np.ndarray,               # (T, n_features)
        y_series: np.ndarray,               # (T,) sqrt inflow
        nwp_src0: np.ndarray,              # (T, n_nwp) oracle/forecast rain aligned
        nwp_src1: np.ndarray | None = None, # (T, n_nwp) optional backup
        timestamps: np.ndarray | None = None,
    ):
        T = len(y_series)
        n_nwp = nwp_src0.shape[-1]
        _nwp1 = nwp_src1 if nwp_src1 is not None else np.zeros_like(nwp_src0)
        _avail1 = 1.0 if nwp_src1 is not None else 0.0

        n_added = 0
        for start in range(0, T - self._window_len + 1, self.stride):
            hind_end = start + self.hindcast_len
            fc_end   = hind_end + self.forecast_len

            self._X_hind.append(X_series[start:hind_end].astype(np.float32))
            self._X_nwp0.append(nwp_src0[hind_end:fc_end].astype(np.float32))
            self._X_nwp1.append(_nwp1[hind_end:fc_end].astype(np.float32))
            self._avail.append(np.array([1.0, _avail1], dtype=np.float32))
            self._y.append(y_series[hind_end:fc_end].astype(np.float32))
            self._rid.append(rid)

            if timestamps is not None:
                self._ts.append(timestamps[hind_end])

            n_added += 1

        print(f"  rid={rid:2d}: T={T:,}h → {n_added:,} samples")

    def save(self, out_dir: str = "."):
        os.makedirs(out_dir, exist_ok=True)

        def _stack_save(name, data):
            arr = np.stack(data, axis=0)
            path = os.path.join(out_dir, name)
            np.save(path, arr)
            print(f"  Saved {name}: {arr.shape}")
            return arr

        print(f"\nBuilding v2 dataset: {len(self._y):,} total samples")
        _stack_save("v2_X_hindcast.npy",  self._X_hind)
        _stack_save("v2_X_nwp_src0.npy",  self._X_nwp0)
        _stack_save("v2_X_nwp_src1.npy",  self._X_nwp1)
        _stack_save("v2_nwp_avail.npy",   self._avail)
        _stack_save("v2_y.npy",           self._y)

        rid_arr = np.array(self._rid, dtype=np.int32)
        np.save(os.path.join(out_dir, "v2_rid.npy"), rid_arr)
        print(f"  Saved v2_rid.npy: {rid_arr.shape}")

        if self._ts:
            ts_arr = np.array(self._ts)
            np.save(os.path.join(out_dir, "v2_timestamps.npy"), ts_arr)
            print(f"  Saved v2_timestamps.npy: {ts_arr.shape}")

        print(f"Done. Dataset saved to: {os.path.abspath(out_dir)}")
