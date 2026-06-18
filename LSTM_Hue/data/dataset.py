"""
HueFloodDataset — PyTorch Dataset cho HueLSTM.

Theo Google Flood Forecasting:
  - Mỗi sample = (hindcast_window, nwp_window, target_flow)
  - Hindcast: 720h (30 ngày) observation features
  - NWP: 168h (7 ngày) weather forecast features
  - Target: 168h inflow forecast (√Q space)

Định dạng .npy files (prefix: hue_):
  hue_X_hist.npy     : (N, 720, 47) — hindcast features, đã scale
  hue_X_nwp.npy      : (N, 168, 8)  — NWP features
  hue_y.npy          : (N, 168)     — target √(inflow)
  hue_basin_id.npy   : (N,)         — 0/1/2 (Tả Trạch / Bình Điền / Hương Điền)
  hue_timestamps.npy : (N,)         — datetime64[s] bắt đầu forecast

Inflow outlier caps (√Q space) — từ thống kê thực tế + p99.9:
  Tả Trạch:   √4500  ≈ 67.1
  Bình Điền:  √5200  ≈ 72.1
  Hương Điền: √9000  ≈ 94.9
"""

import os
import numpy as np
import torch
from torch.utils.data import Dataset


INFLOW_CAPS_SQRT = {
    0: np.sqrt(4500),   # Tả Trạch — thiết kế max 4,500 m³/s
    1: np.sqrt(5200),   # Bình Điền — thiết kế max 5,200 m³/s
    2: np.sqrt(9000),   # Hương Điền — thiết kế max 9,000 m³/s
}


class HueFloodDataset(Dataset):
    """
    Load hue_*.npy và trả về tensor cho HueLSTM.

    Mỗi item: (x_hist, x_nwp, y, basin_id)
      x_hist   : (720, 47) float32
      x_nwp    : (168, 8)  float32
      y        : (168,)    float32 — √(inflow)
      basin_id : () long
    """

    def __init__(self, data_dir: str = "."):
        self.X_hist     = np.load(os.path.join(data_dir, "hue_X_hist.npy"),      mmap_mode="r")
        self.X_nwp      = np.load(os.path.join(data_dir, "hue_X_nwp.npy"),       mmap_mode="r")
        self.y          = np.load(os.path.join(data_dir, "hue_y.npy"),            mmap_mode="r")
        self.basin_id   = np.load(os.path.join(data_dir, "hue_basin_id.npy"),     mmap_mode="r")

        ts_path = os.path.join(data_dir, "hue_timestamps.npy")
        self.timestamps = np.load(ts_path) if os.path.exists(ts_path) else None

        print(
            f"HueFloodDataset: {len(self):,} samples | "
            f"hindcast={self.X_hist.shape[1]}h | forecast={self.y.shape[1]}h | "
            f"basins={np.unique(self.basin_id).tolist()}"
        )

    def __len__(self) -> int:
        return len(self.y)

    def __getitem__(self, idx: int):
        bid = int(self.basin_id[idx])
        cap = INFLOW_CAPS_SQRT.get(bid)

        y = np.array(self.y[idx], copy=True, dtype=np.float32)
        if cap is not None:
            y = np.clip(y, 0.0, cap)

        x_hist = torch.from_numpy(np.array(self.X_hist[idx], copy=False)).float()
        x_nwp  = torch.from_numpy(np.array(self.X_nwp[idx],  copy=False)).float()
        y_t    = torch.from_numpy(y).float()
        bid_t  = torch.tensor(bid, dtype=torch.long)

        return x_hist, x_nwp, y_t, bid_t


# ═══════════════════════════════════════════════════════════════════════════════
# Dataset Builder
# ═══════════════════════════════════════════════════════════════════════════════

class HueDatasetBuilder:
    """
    Xây dựng hue_*.npy từ time series đã feature-engineer và scale.

    Cách dùng (trong main_build_dataset.py):
        builder = HueDatasetBuilder(hindcast_len=720, forecast_len=168)
        builder.add_basin(
            basin_id=0,
            X_series=...,      # (T, 47) đã scale — features lịch sử
            y_series=...,      # (T,) √(inflow) đã scale
            nwp_series=...,    # (T, 8) NWP oracle aligned (training: dùng actual rain)
            timestamps=...,    # (T,) datetime64[s]
        )
        builder.save(".")
    """

    def __init__(self, hindcast_len: int = 720, forecast_len: int = 168, stride: int = 1):
        self.hindcast_len = hindcast_len
        self.forecast_len = forecast_len
        self.stride = stride
        self._window_len = hindcast_len + forecast_len

        self._X_hist: list = []
        self._X_nwp: list  = []
        self._y: list      = []
        self._bids: list   = []
        self._ts: list     = []

    def add_basin(
        self,
        basin_id: int,
        X_series: np.ndarray,     # (T, n_hist_features)
        y_series: np.ndarray,     # (T,) √(inflow)
        nwp_series: np.ndarray,   # (T, n_nwp_features) — oracle NWP aligned
        timestamps: np.ndarray | None = None,
    ):
        T = len(y_series)
        n_added = 0

        for start in range(0, T - self._window_len + 1, self.stride):
            hind_end = start + self.hindcast_len
            fc_end   = hind_end + self.forecast_len

            self._X_hist.append(X_series[start:hind_end].astype(np.float32))
            self._X_nwp.append(nwp_series[hind_end:fc_end].astype(np.float32))
            self._y.append(y_series[hind_end:fc_end].astype(np.float32))
            self._bids.append(basin_id)

            if timestamps is not None:
                self._ts.append(timestamps[hind_end])

            n_added += 1

        basin_names = {0: "Tả Trạch", 1: "Bình Điền", 2: "Hương Điền"}
        print(f"  {basin_names.get(basin_id, f'basin{basin_id}')}: T={T:,}h → {n_added:,} samples")

    def save(self, out_dir: str = "."):
        os.makedirs(out_dir, exist_ok=True)
        N = len(self._y)
        print(f"\nBuilding HueFloodDataset: {N:,} total samples")

        np.save(os.path.join(out_dir, "hue_X_hist.npy"),
                np.stack(self._X_hist, axis=0))
        np.save(os.path.join(out_dir, "hue_X_nwp.npy"),
                np.stack(self._X_nwp, axis=0))
        np.save(os.path.join(out_dir, "hue_y.npy"),
                np.stack(self._y, axis=0))
        np.save(os.path.join(out_dir, "hue_basin_id.npy"),
                np.array(self._bids, dtype=np.int32))

        if self._ts:
            np.save(os.path.join(out_dir, "hue_timestamps.npy"),
                    np.array(self._ts))

        print(f"  Shapes: X_hist={np.stack(self._X_hist).shape} | "
              f"X_nwp={np.stack(self._X_nwp).shape} | y={np.stack(self._y).shape}")
        print(f"Saved to: {os.path.abspath(out_dir)}")
