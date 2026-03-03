import numpy as np


# ================= TIME =================
def add_time_features(df):
    df["hour_sin"] = np.sin(2*np.pi*df.time.dt.hour/24)
    df["hour_cos"] = np.cos(2*np.pi*df.time.dt.hour/24)
    df["doy_sin"] = np.sin(2*np.pi*df.time.dt.dayofyear/365)
    df["doy_cos"] = np.cos(2*np.pi*df.time.dt.dayofyear/365)
    df["month_sin"] = np.sin(2*np.pi*df.time.dt.month/12)
    df["month_cos"] = np.cos(2*np.pi*df.time.dt.month/12)
    return df


# ================= RAIN =================
def add_rain_features(df):

    df["rain_3h"] = df["rain"].rolling(3).sum()
    df["rain_6h"] = df["rain"].rolling(6).sum()
    df["rain_12h"] = df["rain"].rolling(12).sum()
    df["rain_24h"] = df["rain"].rolling(24).sum()

    df["rain_intensity"] = df["rain_3h"] / 3

    df["rain_lag_1"] = df["rain"].shift(1)
    df["rain_lag_3"] = df["rain"].shift(3)
    df["rain_lag_6"] = df["rain"].shift(6)

    return df


# ================= INFLOW =================
def add_inflow_features(df):

    df["inflow_prev"] = df["inflow"].shift(1)
    df["inflow_diff"] = df["inflow"].diff()
    df["inflow_diff_2"] = df["inflow"].diff(2)

    df["inflow_3h_avg"] = df["inflow"].rolling(3).mean()
    df["inflow_6h_avg"] = df["inflow"].rolling(6).mean()
    df["inflow_12h_avg"] = df["inflow"].rolling(12).mean()

    return df