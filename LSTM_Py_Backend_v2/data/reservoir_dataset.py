# data/reservoir_dataset.py
"""PyTorch Dataset cho 1 hồ — load v2_*.npy do data/dataset_builder.py sinh ra."""

import os
import numpy as np
import torch
from torch.utils.data import Dataset


class ReservoirDataset(Dataset):
    """
    Load datasets/<reservoir_key>/v2_*.npy.

    Mỗi item: (x_hindcast, x_nwp, y, station_rain, station_mask)
      x_hindcast   : (hindcast_len, n_hindcast_features) float32
      x_nwp        : (forecast_len, n_nwp_features)       float32
      y            : (forecast_len,)                       float32 — sqrt(inflow)
      station_rain : (hindcast_len, max_stations)          float32 — 0 nếu chưa build
      station_mask : (hindcast_len, max_stations)          bool    — False nếu chưa build

    station_rain/station_mask CHỈ có ý nghĩa khi config.use_station_attention=True
    (xem models/flood_lstm_v2.py). Luôn trả về đủ 5 phần tử để vòng lặp train/val/
    test không cần if/else riêng.
    """

    def __init__(self, data_dir: str, inflow_cap_sqrt: float | None = None, max_stations: int = 7):
        self.X_hind = np.load(os.path.join(data_dir, "v2_X_hindcast.npy"), mmap_mode="r")
        self.X_nwp  = np.load(os.path.join(data_dir, "v2_X_nwp.npy"),      mmap_mode="r")
        self.y      = np.load(os.path.join(data_dir, "v2_y.npy"),           mmap_mode="r")

        ts_path = os.path.join(data_dir, "v2_timestamps.npy")
        self.timestamps = np.load(ts_path) if os.path.exists(ts_path) else None

        rain_path   = os.path.join(data_dir, "v2_station_rain.npy")
        mask_path   = os.path.join(data_dir, "v2_station_mask.npy")
        prior_path  = os.path.join(data_dir, "v2_station_prior_weights.npy")
        self.has_station_data = os.path.exists(rain_path) and os.path.exists(mask_path)
        if self.has_station_data:
            self.station_rain = np.load(rain_path, mmap_mode="r")
            self.station_mask = np.load(mask_path, mmap_mode="r")
            self.max_stations = self.station_rain.shape[-1]
            self.station_prior_weights = (
                np.load(prior_path).tolist() if os.path.exists(prior_path) else None
            )
        else:
            self.station_rain = None
            self.station_mask = None
            self.max_stations = max_stations
            self.station_prior_weights = None

        self.inflow_cap_sqrt = inflow_cap_sqrt

        print(
            f"ReservoirDataset({data_dir}): {len(self):,} samples | "
            f"hindcast={self.X_hind.shape[1]}h | forecast={self.y.shape[1]}h | "
            f"station_attention_data={'ON' if self.has_station_data else 'OFF'}"
        )

    def __len__(self) -> int:
        return len(self.y)

    def __getitem__(self, idx: int):
        y = np.array(self.y[idx], copy=True, dtype=np.float32)
        if self.inflow_cap_sqrt is not None:
            y = np.clip(y, 0.0, self.inflow_cap_sqrt)

        x_hind = torch.from_numpy(np.array(self.X_hind[idx], copy=False)).float()
        x_nwp  = torch.from_numpy(np.array(self.X_nwp[idx],  copy=False)).float()
        y_t    = torch.from_numpy(y).float()

        if self.has_station_data:
            station_rain = torch.from_numpy(np.array(self.station_rain[idx], copy=False)).float()
            station_mask = torch.from_numpy(np.array(self.station_mask[idx], copy=False)).bool()
        else:
            T_h = x_hind.shape[0]
            station_rain = torch.zeros(T_h, self.max_stations, dtype=torch.float32)
            station_mask = torch.zeros(T_h, self.max_stations, dtype=torch.bool)

        return x_hind, x_nwp, y_t, station_rain, station_mask
