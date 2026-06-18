"""
Feature engineering cho HueLSTM.

Tổng 45 features per timestep (hindcast) — nhóm giống Google Flood Forecasting
nhưng bổ sung typhoon indicator (đặc thù Thừa Thiên Huế).

Groups:
  Rain       (18): raw + rolling + lags + intensity
  Inflow     (10): flow + derivatives + rolling avgs
  Reservoir   (6): level, storage, outflow, proximity-to-limit
  Meteo       (5): temp, wind, pressure, rh, ET0
  Temporal    (6): sin/cos encoding cho hour, doy, month
  Typhoon     (2): is_nearby, intensity (KEY feature cho Huế)
               ──
  Total      = 47 → sau khi remove correlated → ~45
"""

import numpy as np
from datetime import datetime


FEATURE_NAMES = [
    # ── Rain (18) ─────────────────────────────────────────────────────────────
    "rain_mm",           # mưa thô (mm/h)
    "rain_3h",           # tổng 3h
    "rain_6h",           # tổng 6h
    "rain_12h",          # tổng 12h
    "rain_24h",          # tổng 24h
    "rain_48h",          # tổng 48h
    "rain_72h",          # tổng 72h
    "rain_120h",         # tổng 120h (5 ngày)
    "rain_168h",         # tổng 168h (7 ngày) — long memory
    "rain_lag1h",        # lag 1h
    "rain_lag3h",        # lag 3h
    "rain_lag6h",        # lag 6h
    "rain_lag12h",       # lag 12h
    "rain_lag24h",       # lag 24h
    "rain_intensity",    # cường độ mưa: 1 nếu rain > 5mm/h
    "rain_std_24h",      # độ lệch chuẩn 24h — biến động mưa
    "rain_max_6h",       # max trong 6h — đỉnh mưa ngắn hạn
    "rain_max_24h",      # max trong 24h

    # ── Inflow (10) ───────────────────────────────────────────────────────────
    "inflow_m3s",        # lưu lượng vào hồ
    "inflow_diff1h",     # biến thiên 1h
    "inflow_diff6h",     # biến thiên 6h
    "inflow_3h_avg",     # trung bình 3h
    "inflow_6h_avg",     # trung bình 6h
    "inflow_12h_avg",    # trung bình 12h
    "inflow_24h_avg",    # trung bình 24h
    "inflow_48h_avg",    # trung bình 48h
    "is_rising",         # 1 nếu inflow tăng so với 3h trước
    "rain_flow_ratio",   # rain / inflow — proxy cho soil moisture state

    # ── Reservoir state (6) ──────────────────────────────────────────────────
    "water_level_m",     # mực nước hiện tại (Z)
    "level_diff_24h",    # thay đổi mực nước 24h
    "storage_ratio",     # Z_current / Z_total — % dung tích
    "outflow_m3s",       # lưu lượng xả
    "outflow_diff1h",    # biến thiên xả
    "headroom_m",        # Z_flood_limit - Z_current (khoảng trống phòng lũ còn lại)

    # ── Meteorological (5) ───────────────────────────────────────────────────
    "temp_2m_c",         # nhiệt độ 2m (°C)
    "wind_speed_ms",     # tốc độ gió (m/s)
    "pressure_hpa",      # áp suất khí quyển (hPa)
    "rel_humidity_pct",  # độ ẩm tương đối (%)
    "et0_mm",            # bốc thoát hơi nước tiềm năng (mm/h)

    # ── Temporal (6) ─────────────────────────────────────────────────────────
    "hour_sin",          # sin(hour * 2π/24)
    "hour_cos",
    "doy_sin",           # sin(day_of_year * 2π/365)
    "doy_cos",
    "month_sin",         # sin(month * 2π/12)
    "month_cos",

    # ── Typhoon (2) — đặc thù Thừa Thiên Huế ─────────────────────────────────
    "is_typhoon",        # 1 nếu có bão/ATNĐ ảnh hưởng trong 72h
    "typhoon_intensity", # cấp độ gió (0-5, 0 nếu không có bão)
]

N_HIST_FEATURES = len(FEATURE_NAMES)  # 47


def build_feature_matrix(
    timestamps: np.ndarray,  # (T,) datetime64[s]
    rain_mm: np.ndarray,     # (T,) mưa bình quân lưu vực (từ IDW)
    inflow: np.ndarray,      # (T,) lưu lượng vào (m³/s)
    water_level: np.ndarray, # (T,) mực nước hồ (m)
    outflow: np.ndarray,     # (T,) lưu lượng xả (m³/s)
    flood_limit_m: float,    # mực nước giới hạn lũ (m)
    temp_c: np.ndarray | None = None,    # (T,)
    wind_ms: np.ndarray | None = None,   # (T,)
    pressure_hpa: np.ndarray | None = None,
    rh_pct: np.ndarray | None = None,
    et0_mm: np.ndarray | None = None,
    is_typhoon: np.ndarray | None = None, # (T,) binary
    typhoon_intensity: np.ndarray | None = None, # (T,) 0-5
) -> np.ndarray:
    """
    Xây dựng ma trận features (T, N_HIST_FEATURES) cho một lưu vực.
    Missing inputs → zero (Google: masked_mean xử lý NaN, ta đơn giản hóa = 0).
    """
    T = len(timestamps)

    def _z(arr, default=0.0) -> np.ndarray:
        if arr is None:
            return np.full(T, default, dtype=np.float32)
        a = np.array(arr, dtype=np.float32)
        a = np.where(np.isfinite(a), a, default)
        return a

    rain      = _z(rain_mm)
    q_in      = _z(inflow)
    z_level   = _z(water_level)
    q_out     = _z(outflow)
    temp      = _z(temp_c, 25.0)
    wind      = _z(wind_ms)
    pressure  = _z(pressure_hpa, 1013.0)
    rh        = _z(rh_pct, 80.0)
    et0       = _z(et0_mm)
    typhoon   = _z(is_typhoon).astype(np.float32)
    t_intens  = _z(typhoon_intensity).astype(np.float32)

    # Precompute rolling windows
    def rolling_sum(arr, w):
        cs = np.concatenate([[0.0], np.cumsum(arr)])
        result = np.zeros(T, dtype=np.float32)
        for t in range(T):
            result[t] = cs[t + 1] - cs[max(0, t + 1 - w)]
        return result

    def rolling_mean(arr, w):
        return rolling_sum(arr, w) / w

    def rolling_std(arr, w):
        result = np.zeros(T, dtype=np.float32)
        for t in range(T):
            start = max(0, t + 1 - w)
            window = arr[start:t + 1]
            result[t] = float(window.std()) if len(window) > 1 else 0.0
        return result

    def rolling_max(arr, w):
        result = np.zeros(T, dtype=np.float32)
        for t in range(T):
            result[t] = arr[max(0, t + 1 - w):t + 1].max()
        return result

    def lag(arr, n):
        result = np.zeros(T, dtype=np.float32)
        result[n:] = arr[:-n]
        return result

    # ── Temporal encoding ─────────────────────────────────────────────────────
    dts = timestamps.astype("datetime64[s]").astype(object)
    hours   = np.array([dt.hour for dt in dts], dtype=np.float32)
    doys    = np.array([dt.timetuple().tm_yday for dt in dts], dtype=np.float32)
    months  = np.array([dt.month for dt in dts], dtype=np.float32)

    hour_sin = np.sin(hours * 2 * np.pi / 24).astype(np.float32)
    hour_cos = np.cos(hours * 2 * np.pi / 24).astype(np.float32)
    doy_sin  = np.sin(doys  * 2 * np.pi / 365).astype(np.float32)
    doy_cos  = np.cos(doys  * 2 * np.pi / 365).astype(np.float32)
    mon_sin  = np.sin(months * 2 * np.pi / 12).astype(np.float32)
    mon_cos  = np.cos(months * 2 * np.pi / 12).astype(np.float32)

    # ── Build feature columns ─────────────────────────────────────────────────
    rain_3h   = rolling_sum(rain, 3)
    rain_6h   = rolling_sum(rain, 6)
    rain_12h  = rolling_sum(rain, 12)
    rain_24h  = rolling_sum(rain, 24)
    rain_48h  = rolling_sum(rain, 48)
    rain_72h  = rolling_sum(rain, 72)
    rain_120h = rolling_sum(rain, 120)
    rain_168h = rolling_sum(rain, 168)

    inflow_diff1h = np.diff(q_in, prepend=q_in[0]).astype(np.float32)
    inflow_diff6h = q_in - lag(q_in, 6)
    inflow_3h_avg  = rolling_mean(q_in, 3)
    inflow_6h_avg  = rolling_mean(q_in, 6)
    inflow_12h_avg = rolling_mean(q_in, 12)
    inflow_24h_avg = rolling_mean(q_in, 24)
    inflow_48h_avg = rolling_mean(q_in, 48)
    is_rising = (q_in > inflow_3h_avg).astype(np.float32)
    safe_inflow = np.where(q_in > 0, q_in, 1.0)
    rain_flow_ratio = np.clip(rain_24h / safe_inflow, 0, 100).astype(np.float32)

    level_diff_24h = z_level - lag(z_level, 24)
    storage_ratio  = np.clip((z_level - 0) / max(flood_limit_m, 1.0), 0, 1)
    outflow_diff1h = np.diff(q_out, prepend=q_out[0]).astype(np.float32)
    headroom       = np.clip(flood_limit_m - z_level, 0, None).astype(np.float32)

    # ── Stack ─────────────────────────────────────────────────────────────────
    X = np.column_stack([
        rain, rain_3h, rain_6h, rain_12h, rain_24h, rain_48h, rain_72h, rain_120h, rain_168h,
        lag(rain, 1), lag(rain, 3), lag(rain, 6), lag(rain, 12), lag(rain, 24),
        (rain > 5.0).astype(np.float32),     # rain_intensity
        rolling_std(rain, 24),
        rolling_max(rain, 6),
        rolling_max(rain, 24),
        q_in, inflow_diff1h, inflow_diff6h,
        inflow_3h_avg, inflow_6h_avg, inflow_12h_avg, inflow_24h_avg, inflow_48h_avg,
        is_rising, rain_flow_ratio,
        z_level, level_diff_24h, storage_ratio, q_out, outflow_diff1h, headroom,
        temp, wind, pressure, rh, et0,
        hour_sin, hour_cos, doy_sin, doy_cos, mon_sin, mon_cos,
        typhoon, t_intens,
    ]).astype(np.float32)

    return X  # (T, 47)


# ── NWP feature builder (cho forecast phase) ──────────────────────────────────

NWP_FEATURE_NAMES = [
    "nwp_rain",       # mm/h
    "nwp_rain_3h",    # rolling 3h
    "nwp_rain_6h",    # rolling 6h
    "nwp_rain_24h",   # rolling 24h
    "nwp_temp",       # °C (chuẩn hóa)
    "nwp_wind",       # m/s (chuẩn hóa)
    "nwp_pressure",   # hPa (chuẩn hóa)
    "nwp_rh",         # % (chuẩn hóa)
]

N_NWP_FEATURES = len(NWP_FEATURE_NAMES)  # 8


def build_nwp_features(
    rain_fc: np.ndarray,      # (168,) mm/h
    temp_fc: np.ndarray,      # (168,) °C
    wind_fc: np.ndarray,      # (168,) m/s
    pressure_fc: np.ndarray,  # (168,) hPa
    rh_fc: np.ndarray,        # (168,) %
) -> np.ndarray:              # (168, 8)
    """Xây dựng NWP feature matrix từ Open-Meteo forecast."""
    T = len(rain_fc)

    def rolling_sum(arr, w):
        cs = np.concatenate([[0.0], np.cumsum(arr)])
        result = np.zeros(T, dtype=np.float32)
        for t in range(T):
            result[t] = cs[t + 1] - cs[max(0, t + 1 - w)]
        return result

    rain   = np.array(rain_fc,     dtype=np.float32)
    temp   = np.array(temp_fc,     dtype=np.float32)
    wind   = np.array(wind_fc,     dtype=np.float32)
    pres   = np.array(pressure_fc, dtype=np.float32)
    rh     = np.array(rh_fc,       dtype=np.float32)

    return np.column_stack([
        rain,
        rolling_sum(rain, 3),
        rolling_sum(rain, 6),
        rolling_sum(rain, 24),
        (temp - temp.mean()) / (temp.std() + 1e-6),
        wind / (wind.max() + 1e-6),
        (pres - 1013.0) / 10.0,
        rh / 100.0,
    ]).astype(np.float32)
