# data/idw_calculator.py
# Tính mưa lưu vực theo phương pháp IDW (Inverse Distance Weighting)
# Công thức: rain_basin(t) = Σ(Wi × raini(t)) / Σ(Wi)
# Trọng số: Wi = 1 / di^2, di = Khoảng cách Haversine (km)
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
        Dict {station_key: weight (0~1, sum=1.0)}
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


def compute_all_weights() -> dict:
    """
    Tính trọng số IDW cho tất cả các hồ.
    Returns:
        Dict {reservoir_id: {station_key: weight}}
    """
    all_weights = {}
    for rid in RESERVOIRS:
        all_weights[rid] = compute_idw_weights(rid)
    return all_weights


def print_weights_table():
    """In bảng trọng số IDW để kiểm tra."""
    print("\n" + "="*80)
    print("BẢNG TRỌNG SỐ IDW CHO TỪNG HỒ THỦY ĐIỆN")
    print("="*80)
    all_w = compute_all_weights()
    for rid, info in RESERVOIRS.items():
        weights = all_w.get(rid, {})
        print(f"\n🏔  {info['name']} (ID={rid})")
        if not weights:
            print("   ⚠ Không có trạm liên quan!")
            continue
        for sk, w in sorted(weights.items(), key=lambda x: -x[1]):
            s = RAIN_STATIONS.get(sk, {})
            d = haversine_km(info["lat"], info["lon"], s.get("lat", 0), s.get("lon", 0))
            print(f"   {sk:20s}  Khoảng cách: {d:6.1f} km  Trọng số: {w:.3f} ({w*100:.1f}%)")
    print("="*80)


def apply_idw(all_vndms: pd.DataFrame, reservoir_id: int,
              station_timeseries_fn) -> pd.DataFrame:
    """
    Tính chuỗi mưa lưu vực theo IDW cho hồ reservoir_id.
    
    Args:
        all_vndms: DataFrame [station, time, rain] đọc từ VNDMS
        reservoir_id: ID hồ
        station_timeseries_fn: function(all_vndms, station_key) → DataFrame(time, rain)
    
    Returns:
        pd.DataFrame với cột [time, rain] - lượng mưa lưu vực theo IDW
    """
    weights = compute_idw_weights(reservoir_id)
    if not weights:
        return pd.DataFrame(columns=["time", "rain"])

    weighted_series = []
    for sk, w in weights.items():
        ts = station_timeseries_fn(all_vndms, sk)
        if ts.empty:
            print(f"  ⚠ Không tìm thấy dữ liệu trạm {sk}")
            continue
        ts = ts.set_index("time")["rain"] * w
        ts.name = sk
        weighted_series.append(ts)

    if not weighted_series:
        return pd.DataFrame(columns=["time", "rain"])

    # Căn giờ chung và tổng hợp
    combined = pd.concat(weighted_series, axis=1)
    basin_rain = combined.sum(axis=1, min_count=1).reset_index()
    basin_rain.columns = ["time", "rain"]
    basin_rain = basin_rain.sort_values("time").reset_index(drop=True)
    
    return basin_rain
