"""
IDW (Inverse Distance Weighting) interpolation cho mưa.

Kế thừa ý tưởng masked_mean từ Google Flood Forecasting:
  - Nếu một trạm thiếu dữ liệu tại bước thời gian t → tự động loại trừ
  - Weight = 1/d² (d = khoảng cách Haversine), normalize về tổng = 1
  - Nếu tất cả trạm thiếu → trả về NaN (để caller xử lý)

Tham khảo: googlehydrology/datautils/union_features.py (masked_mean strategy)
"""

import math
import numpy as np
from typing import Optional


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


class IDWInterpolator:
    """
    Tính mưa bình quân lưu vực bằng IDW từ mạng lưới trạm.

    Cách dùng:
        interp = IDWInterpolator(basin_lat, basin_lon, station_coords)
        rain_at_basin = interp.interpolate(station_rain_array, nan_mask)

    station_coords: dict {station_id: (lat, lon)}
    """

    def __init__(
        self,
        target_lat: float,
        target_lon: float,
        station_coords: dict,
        power: float = 2.0,
        max_radius_km: float = 200.0,
    ):
        self.target_lat = target_lat
        self.target_lon = target_lon
        self.power = power

        self.station_ids = []
        self.raw_weights = []

        for sid, (slat, slon) in station_coords.items():
            d = haversine_km(target_lat, target_lon, slat, slon)
            if d <= max_radius_km:
                self.station_ids.append(sid)
                self.raw_weights.append(1.0 / max(d, 0.1) ** power)

        self.raw_weights = np.array(self.raw_weights, dtype=np.float64)

    def interpolate(
        self,
        station_values: dict,  # {station_id: float | nan}
        fallback: float = 0.0,
    ) -> float:
        """
        IDW với masked_mean (bỏ qua trạm thiếu, theo Google):
          - Nếu không còn trạm nào → trả về fallback
        """
        vals, weights = [], []
        for i, sid in enumerate(self.station_ids):
            v = station_values.get(sid, float("nan"))
            if not math.isnan(v):
                vals.append(v)
                weights.append(self.raw_weights[i])

        if not vals:
            return fallback

        w = np.array(weights)
        w = w / w.sum()
        return float(np.dot(w, vals))

    def interpolate_series(
        self,
        station_series: dict,  # {station_id: np.ndarray (T,)}
        fallback: float = 0.0,
    ) -> np.ndarray:
        """Interpolate toàn bộ time series (T,) cùng lúc — vectorized."""
        T = next(iter(station_series.values())).shape[0]
        result = np.full(T, fallback, dtype=np.float32)

        vals_matrix = []
        weights_list = []
        for i, sid in enumerate(self.station_ids):
            if sid in station_series:
                vals_matrix.append(station_series[sid])
                weights_list.append(self.raw_weights[i])

        if not vals_matrix:
            return result

        V = np.stack(vals_matrix, axis=1)         # (T, n_stations)
        W = np.array(weights_list, dtype=np.float64)  # (n_stations,)

        for t in range(T):
            valid = ~np.isnan(V[t])
            if valid.any():
                w = W[valid]
                w = w / w.sum()
                result[t] = float(np.dot(w, V[t, valid]))

        return result


def build_basin_interpolators(basins: dict, rain_stations: dict) -> dict:
    """
    Tạo IDWInterpolator cho từng hồ.

    Returns:
        {basin_key: IDWInterpolator}
    """
    interpolators = {}
    for basin_key, basin_info in basins.items():
        station_ids = basin_info["rain_station_ids"]
        station_coords = {
            sid: (rain_stations[sid]["lat"], rain_stations[sid]["lon"])
            for sid in station_ids
            if sid in rain_stations
        }
        interpolators[basin_key] = IDWInterpolator(
            target_lat=basin_info["lat"],
            target_lon=basin_info["lon"],
            station_coords=station_coords,
        )
    return interpolators
