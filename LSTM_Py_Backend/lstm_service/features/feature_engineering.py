import numpy as np


# ================= TIME =================
def add_time_features(df):
    df["hour_sin"]   = np.sin(2*np.pi*df.time.dt.hour/24)
    df["hour_cos"]   = np.cos(2*np.pi*df.time.dt.hour/24)
    df["doy_sin"]    = np.sin(2*np.pi*df.time.dt.dayofyear/365)
    df["doy_cos"]    = np.cos(2*np.pi*df.time.dt.dayofyear/365)
    df["month_sin"]  = np.sin(2*np.pi*df.time.dt.month/12)
    df["month_cos"]  = np.cos(2*np.pi*df.time.dt.month/12)
    return df


# ================= RAIN =================
def add_rain_features(df):
    df["rain_3h"]   = df["rain"].rolling(3).sum()
    df["rain_6h"]   = df["rain"].rolling(6).sum()
    df["rain_12h"]  = df["rain"].rolling(12).sum()
    df["rain_24h"]  = df["rain"].rolling(24).sum()
    df["rain_48h"]  = df["rain"].rolling(48).sum()
    df["rain_72h"]  = df["rain"].rolling(72).sum()    # 3 ngày
    df["rain_96h"]  = df["rain"].rolling(96).sum()    # 4 ngày
    df["rain_120h"] = df["rain"].rolling(120).sum()   # 5 ngày — proxy ẩm đất
    df["rain_168h"] = df["rain"].rolling(168).sum()   # 7 ngày — proxy ẩm đất dài

    df["rain_intensity"] = df["rain_3h"] / 3
    df["rain_12h_std"]   = df["rain"].rolling(12).std()
    df["rain_24h_max"]   = df["rain"].rolling(24).max()

    df["rain_lag_1"]  = df["rain"].shift(1)
    df["rain_lag_3"]  = df["rain"].shift(3)
    df["rain_lag_6"]  = df["rain"].shift(6)
    df["rain_lag_12"] = df["rain"].shift(12)
    df["rain_lag_24"] = df["rain"].shift(24)
    return df


# ================= INFLOW =================
def add_inflow_features(df):
    df["inflow_prev"]    = df["inflow"].shift(1)
    df["inflow_diff"]    = df["inflow"].diff()
    df["inflow_diff_2"]  = df["inflow"].diff(2)

    df["inflow_3h_avg"]  = df["inflow"].rolling(3).mean()
    df["inflow_6h_avg"]  = df["inflow"].rolling(6).mean()
    df["inflow_12h_avg"] = df["inflow"].rolling(12).mean()
    df["inflow_24h_avg"] = df["inflow"].rolling(24).mean()
    df["inflow_48h_avg"] = df["inflow"].rolling(48).mean()

    df["inflow_rising"] = (df["inflow_diff"] > 0).astype(float)

    # Interaction features
    df["rain_inflow_interaction"] = df["rain_12h"] * df["inflow_prev"]
    df["soil_moisture_x_inflow"]  = df["rain_168h"] * df["inflow_prev"]
    return df


# ================= HỒ CHỨA (Reservoir State) =================
def add_reservoir_features(df):
    """
    Thêm features trạng thái hồ chứa từ water_level (Z) và outflow.
    Các cột này có sẵn từ Excel (sau update_excel_z_qout.py).
    """
    if "water_level" in df.columns:
        # Tốc độ thay đổi mực nước (m/h) — dương = đang tích, âm = đang xả
        df["Z_diff"] = df["water_level"].diff()
        # Trung bình Z 24h — proxy mức độ tích nước hiện tại
        df["Z_24h_avg"] = df["water_level"].rolling(24).mean()
    else:
        df["Z_diff"]    = 0.0
        df["Z_24h_avg"] = 0.0

    if "outflow" in df.columns:
        # Tốc độ thay đổi lưu lượng xả (m3/s/h)
        df["outflow_diff"] = df["outflow"].diff()
        # Tỉ lệ xả / vào — ngưỡng vận hành
        inflow_safe = df["inflow"].replace(0, np.nan)
        df["Q_ratio"] = (df["outflow"] / inflow_safe).clip(0, 10).fillna(0)
    else:
        df["outflow_diff"] = 0.0
        df["Q_ratio"]      = 0.0

    return df


# ================= KHÍ TƯỢNG (Meteorological) =================
def add_meteo_features(df):
    """
    Thêm features khí tượng từ Open-Meteo archive.
    Chỉ et0 và wind_speed được dùng trong training (temperature và relative_humidity
    bị loại vì không có dữ liệu lịch sử trong Excel → train/inference mismatch).
    """
    for col in ("et0", "wind_speed"):
        if col not in df.columns:
            df[col] = 0.0
    return df