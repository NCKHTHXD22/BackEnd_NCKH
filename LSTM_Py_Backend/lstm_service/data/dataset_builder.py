# dataset_builder.py
import numpy as np
import pandas as pd

from config.reservoirs import RESERVOIRS
from config.settings import SEQ_LENGTH, HORIZON
from data.data_fetcher import fetch_hydro_data, fetch_rain_data
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features
)
from utils.scaler_utils import GlobalScaler


def build_global_dataset(days=180):

    X_past, X_future, y, rid_all = [], [], [], []

    for rid, info in RESERVOIRS.items():

        print("Building dataset for", info["name"])

        hydro = fetch_hydro_data(rid, days)
        rain = fetch_rain_data(info["lat"], info["lon"], days)

        if hydro.empty:
            continue

        if rain.empty:
            print(f"⚠ Không thể lấy dữ liệu mưa cho {info['name']} (Timeout/Error) → Tự động điền 0.")
            rain = pd.DataFrame(columns=["time", "rain"])

        df = pd.merge(hydro, rain, on="time", how="left")
        
        # Silence FutureWarning and handle downcasting
        pd.set_option('future.no_silent_downcasting', True)
        df["rain"] = df["rain"].fillna(0).infer_objects(copy=False)

        df["inflow"] = np.log1p(df["inflow"].clip(0))

        df = add_time_features(df)
        df = add_rain_features(df)
        df = add_inflow_features(df)

        df = df.dropna()

        if len(df) < SEQ_LENGTH + HORIZON:
            continue

        features = [
            "rain","rain_3h","rain_6h","rain_12h",
            "rain_24h",
            "rain_intensity",
            "rain_lag_1","rain_lag_3","rain_lag_6",
            "inflow","inflow_prev","inflow_diff",
            "inflow_diff_2",
            "inflow_3h_avg","inflow_6h_avg",
            "inflow_12h_avg",
            "hour_sin","hour_cos","doy_sin","doy_cos",
            "month_sin","month_cos"
        ]

        for i in range(len(df) - SEQ_LENGTH - HORIZON):

            past = df[features].iloc[i:i+SEQ_LENGTH].values
            future_rain = df["rain"].iloc[
                i+SEQ_LENGTH:i+SEQ_LENGTH+HORIZON
            ].values.reshape(-1,1)

            target = df["inflow"].iloc[
                i+SEQ_LENGTH:i+SEQ_LENGTH+HORIZON
            ].values

            X_past.append(past)
            X_future.append(future_rain)
            y.append(target)
            rid_all.append(info["idx"])

    X_past = np.array(X_past, np.float32)
    X_future = np.array(X_future, np.float32)
    y = np.array(y, np.float32)
    rid_all = np.array(rid_all)

    scaler = GlobalScaler()
    X_past = scaler.fit_transform(X_past)
    scaler.save("artifacts/global_scaler.pkl")

    np.save("dataset_X_past.npy", X_past)
    np.save("dataset_X_future.npy", X_future)
    np.save("dataset_y.npy", y)
    np.save("dataset_rid.npy", rid_all)

    print("Dataset built successfully.")