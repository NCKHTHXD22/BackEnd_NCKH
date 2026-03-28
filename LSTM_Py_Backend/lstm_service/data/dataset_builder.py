# data/dataset_builder.py
# UPDATED: Dùng IDW Basin Rainfall từ VNDMS thay vì Open-Meteo
import numpy as np
import pandas as pd
from datetime import datetime

from config.reservoirs import RESERVOIRS
from config.settings import SEQ_LENGTH, HORIZON
from data.data_fetcher import fetch_hydro_data
from data.vndms_rain_loader import load_all_vndms, get_station_timeseries
from data.idw_calculator import apply_idw, print_weights_table
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features
)
from utils.scaler_utils import GlobalScaler


def build_global_dataset(
    vndms_dir: str = ".",
    start_date: str = "2022-01-01",
    end_date: str = "2025-12-31"
):
    """
    Xây dựng dataset LSTM sử dụng:
     - Hydro (inflow/outflow) từ API Đà Nẵng
     - Mưa từ VNDMS Excel files, tính IDW per hồ
    """
    
    print("\n" + "="*70)
    print("BƯỚC 1: In bảng trọng số IDW để kiểm tra")
    print_weights_table()
    
    print("\nBƯỚC 2: Load toàn bộ dữ liệu mưa VNDMS...")
    all_vndms = load_all_vndms(data_dir=vndms_dir)
    if all_vndms.empty:
        raise ValueError("Không load được dữ liệu VNDMS! Kiểm tra thư mục chứa Excel.")
    print(f"  ✅ Loaded {len(all_vndms):,} rows mưa từ VNDMS")
    
    # Lọc theo date range
    start_dt = pd.to_datetime(start_date)
    end_dt   = pd.to_datetime(end_date)
    
    # Tính số ngày để fetch hydro
    days_total = (end_dt - start_dt).days + 1
    
    X_past, X_future, y, rid_all = [], [], [], []
    
    print("\nBƯỚC 3: Xây dựng dataset cho từng hồ...")
    for rid, info in RESERVOIRS.items():
        print(f"\n  🏔 {info['name']} (ID={rid})")
        
        # --- Load Hydro Data ---
        hydro = fetch_hydro_data(rid, days=days_total)
        if hydro.empty:
            print(f"     ⚠ Không có dữ liệu hydro, bỏ qua.")
            continue
        
        print(f"     ✅ Hydro: {len(hydro):,} giờ")
        
        # --- IDW Rain ---
        rain = apply_idw(all_vndms, rid, get_station_timeseries)
        if rain.empty:
            print(f"     ⚠ Không có mưa IDW cho hồ này. Dùng 0.")
            rain = pd.DataFrame({"time": hydro["time"], "rain": 0.0})
        else:
            print(f"     ✅ Mưa IDW: {len(rain):,} giờ")
        
        # --- Backbone Thời Gian (100% liên tục từng giờ) ---
        full_time_idx = pd.date_range(start=start_dt, end=end_dt, freq="h", name="time")
        base_df = pd.DataFrame(index=full_time_idx)
        
        hydro_idx = hydro.set_index("time")
        rain_idx = rain.set_index("time")
        
        df = base_df.join(hydro_idx, how="left").join(rain_idx, how="left")
        
        # Nội suy Flow bị rỗng do khoảng cách API thô
        for col in ["inflow", "outflow", "level"]:
            if col in df.columns:
                df[col] = df[col].interpolate(method="linear", limit_direction="both")
                
        df["rain"] = df["rain"].fillna(0.0)
        df = df.reset_index()
        
        # --- Feature Engineering ---
        df["inflow"] = np.log1p(df["inflow"].clip(0))
        df = add_time_features(df)
        df = add_rain_features(df)
        df = add_inflow_features(df)
        df = df.dropna()
        
        if len(df) < SEQ_LENGTH + HORIZON:
            print(f"     ⚠ Dữ liệu không đủ ({len(df)} < {SEQ_LENGTH + HORIZON}), bỏ qua.")
            continue
        
        features = [
            "rain", "rain_3h", "rain_6h", "rain_12h", "rain_24h",
            "rain_48h", "rain_72h", "rain_96h",
            "rain_intensity", "rain_12h_std", "rain_24h_max",
            "rain_lag_1", "rain_lag_3", "rain_lag_6", "rain_lag_12", "rain_lag_24",
            "inflow", "inflow_prev", "inflow_diff", "inflow_diff_2",
            "inflow_3h_avg", "inflow_6h_avg", "inflow_12h_avg", "inflow_24h_avg",
            "rain_inflow_interaction",
            "hour_sin", "hour_cos", "doy_sin", "doy_cos", "month_sin", "month_cos"
        ]
        # Chỉ lấy features có trong df
        features = [f for f in features if f in df.columns]
        
        # Store timestamps for time-based splitting later
        timestamps = df["time"].values
        
        for i in range(len(df) - SEQ_LENGTH - HORIZON):
            past = df[features].iloc[i:i+SEQ_LENGTH].values
            future_rain = df["rain"].iloc[
                i+SEQ_LENGTH:i+SEQ_LENGTH+HORIZON
            ].values.reshape(-1, 1)
            target = df["inflow"].iloc[
                i+SEQ_LENGTH:i+SEQ_LENGTH+HORIZON
            ].values

            X_past.append(past)
            X_future.append(future_rain)
            y.append(target)
            rid_all.append(info["idx"])
        
        print(f"     ✅ Tạo {len(df) - SEQ_LENGTH - HORIZON:,} mẫu")
    
    X_past   = np.array(X_past,   dtype=np.float32)
    X_future = np.array(X_future, dtype=np.float32)
    y        = np.array(y,        dtype=np.float32)
    rid_all  = np.array(rid_all,  dtype=np.int64)
    
    print(f"\nBƯỚC 4: Scale dữ liệu...")
    scaler = GlobalScaler()
    X_past = scaler.fit_transform(X_past)
    X_future = np.log1p(X_future)
    
    scaler.save("artifacts/global_scaler.pkl")
    
    np.save("dataset_X_past.npy",   X_past)
    np.save("dataset_X_future.npy", X_future)
    np.save("dataset_y.npy",        y)
    np.save("dataset_rid.npy",      rid_all)
    
    print(f"\n✅ Dataset đã sẵn sàng: {len(X_past):,} mẫu tổng cộng")
    print(f"   X_past shape:   {X_past.shape}")
    print(f"   X_future shape: {X_future.shape}")
    print(f"   y shape:        {y.shape}")
    print(f"   Số features:    {X_past.shape[2]}")