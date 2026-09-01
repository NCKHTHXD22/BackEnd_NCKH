# data/idw_calculator.py
# Copy từ lstm_service/data/idw_calculator.py — tính trọng số IDW cho từng trạm mưa
# gắn với 1 hồ. Dùng để khởi tạo prior cho StationRainAttention (init_prior()) —
# không dùng để tính lại cột "rain" (đã có sẵn IDW trong Excel).
import numpy as np
import pandas as pd
from math import radians, sin, cos, sqrt, atan2
from config.rain_stations import RAIN_STATIONS, RESERVOIR_TO_STATIONS
from config.reservoirs import RESERVOIRS


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    """Tính khoảng cách Haversine (km) giữa 2 tọa độ."""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def compute_idw_weights(reservoir_id: int) -> dict:
    """
    Tính trọng số IDW cho tất cả trạm liên quan đến hồ reservoir_id.
    Returns:
        Dict {station_key: weight (0~1, sum=1.0)}, theo đúng thứ tự
        RESERVOIR_TO_STATIONS[reservoir_id] (dict Python giữ thứ tự insert).
    """
    if reservoir_id not in RESERVOIRS:
        return {}
    if reservoir_id not in RESERVOIR_TO_STATIONS:
        return {}

    res = RESERVOIRS[reservoir_id]
    res_lat, res_lon = res["lat"], res["lon"]
    station_keys = RESERVOIR_TO_STATIONS[reservoir_id]

    weights = {}
    for sk in station_keys:
        if sk not in RAIN_STATIONS:
            continue
        s = RAIN_STATIONS[sk]
        d = haversine_km(res_lat, res_lon, s["lat"], s["lon"])
        if d < 0.01:
            d = 0.01  # Tránh chia cho 0
        weights[sk] = 1.0 / (d ** 2)

    # Normalize
    total = sum(weights.values())
    if total > 0:
        weights = {k: v / total for k, v in weights.items()}

    return weights


def ordered_prior_weights(reservoir_id: int) -> list:
    """
    Trọng số IDW đã normalize, sắp theo ĐÚNG thứ tự RESERVOIR_TO_STATIONS[rid]
    (khớp với thứ tự cột trong Excel — xem data/rain_matrix_loader.py::
    parse_station_rain). Dùng trực tiếp cho StationRainAttention.init_prior().
    """
    weights_dict = compute_idw_weights(reservoir_id)
    station_keys = RESERVOIR_TO_STATIONS.get(reservoir_id, [])
    return [weights_dict.get(sk, 0.0) for sk in station_keys]
