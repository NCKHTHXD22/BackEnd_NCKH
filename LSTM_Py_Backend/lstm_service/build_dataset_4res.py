import os
import numpy as np
import pandas as pd

from config.reservoirs import RESERVOIRS
from config.settings import SEQ_LENGTH, HORIZON
from data.vndms_rain_loader import load_all_vndms, get_station_timeseries
import sys
sys.stdout.reconfigure(encoding='utf-8')
from data.idw_calculator import apply_idw
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features,
    add_reservoir_features,
    add_meteo_features,
)
from utils.scaler_utils import GlobalScaler
from data.dataset_builder import FEATURES, REQUIRED_FEATURES, OPTIONAL_FEATURES

RID_FILE_MAPPING = {
    1: 'HỒ A VƯƠNG_Dataset_fixed.xlsx',
    2: 'HỒ ĐAK MI 4_Dataset_fixed.xlsx',
    3: 'HỒ SÔNG BUNG 4_Dataset_fixed.xlsx',
    4: 'HỒ SÔNG TRANH 2_Dataset_fixed.xlsx'
}

def build_4res_dataset():
    print("=" * 70)
    print("BUILD LOCAL DATASET CHO 4 HỒ CHỨA")
    print("=" * 70)

    # 1. Load toàn bộ dữ liệu mưa
    print("\n[1] Đang load dữ liệu mưa từ D:/NCKH/VuGiaThuBonDSS...")
    all_vndms = load_all_vndms("D:/NCKH/VuGiaThuBonDSS")
    print(f"Loaded {len(all_vndms):,} dòng dữ liệu mưa.")

    X_past_list, X_future_list, y_list, rid_list, ts_list = [], [], [], [], []

    # 2. Xử lý từng hồ
    for rid, filename in RID_FILE_MAPPING.items():
        hydro_path = os.path.join("D:/NCKH_archive/data/DATA_4RESERVOIR", filename)
        if not os.path.exists(hydro_path):
            print(f"  [WARN] Bỏ qua {filename} (Không tìm thấy)")
            continue

        print(f"\n[{rid}] Đang xử lý {filename}...")
        res_idx = RESERVOIRS[rid]["idx"]

        # Load Hydro
        df_hydro = pd.read_excel(hydro_path)
        df_hydro["time"] = pd.to_datetime(df_hydro["time"])
        print(f"  -> Hydro rows: {len(df_hydro):,}")

        # Tính IDW Rain
        df_rain = apply_idw(all_vndms, rid, get_station_timeseries)
        print(f"  -> Rain rows: {len(df_rain):,}")

        # Ghép nối (Merge) theo giờ
        if df_rain.empty:
            df = df_hydro.copy()
            df["rain"] = 0.0
        else:
            # Backbone liên tục
            start_dt = df_hydro["time"].min()
            end_dt = df_hydro["time"].max()
            full_idx = pd.date_range(start=start_dt, end=end_dt, freq="h")
            
            df_hydro = df_hydro.set_index("time").reindex(full_idx).rename_axis("time").reset_index()
            df = pd.merge(df_hydro, df_rain, on="time", how="left")

        # Nội suy (Linear interpolation cho tối đa 6h mất dữ liệu)
        df["inflow"] = df["inflow"].interpolate(method="linear", limit=6, limit_direction="both")
        df["rain"] = df["rain"].fillna(0.0)
        for col in ("water_level", "outflow"):
            if col in df.columns:
                df[col] = df[col].interpolate(method="linear", limit=6, limit_direction="both")

        # Drop nếu inflow vẫn còn NaN
        valid_pct = df["inflow"].notna().mean() * 100
        if valid_pct < 30:
            print(f"  [SKIP] Dữ liệu quá thiếu ({valid_pct:.1f}%)")
            continue

        # Sqrt transform cho Inflow
        df["inflow"] = np.sqrt(df["inflow"].clip(lower=0))

        # Feature Engineering
        df = add_time_features(df)
        df = add_rain_features(df)
        df = add_inflow_features(df)
        df = add_reservoir_features(df)
        df = add_meteo_features(df)
        df = df.fillna(0.0)

        # Trích xuất cửa sổ trượt (Sliding Windows)
        available = [f for f in FEATURES if f in df.columns]
        feat_arr = df[available].values.astype(np.float32)
        inflow_arr = df["inflow"].values.astype(np.float32)
        rain_arr = df["rain"].values.astype(np.float32)
        time_arr = df["time"].values

        n_samples_before = len(X_past_list)
        for i in range(len(df) - SEQ_LENGTH - HORIZON):
            past = feat_arr[i : i + SEQ_LENGTH]
            target = inflow_arr[i + SEQ_LENGTH : i + SEQ_LENGTH + HORIZON]

            if np.any(np.isnan(target)): continue

            # X_future: Mưa thực tế tương lai (Oracle rain)
            future_rain = rain_arr[i + SEQ_LENGTH : i + SEQ_LENGTH + HORIZON]
            x_fut = np.zeros((HORIZON, 3), dtype=np.float32)
            x_fut[:, 0] = future_rain
            x_fut[:, 1] = np.convolve(future_rain, np.ones(6),  mode='full')[:HORIZON]
            x_fut[:, 2] = np.convolve(future_rain, np.ones(24), mode='full')[:HORIZON]

            X_past_list.append(past)
            X_future_list.append(x_fut)
            y_list.append(target)
            rid_list.append(res_idx)
            ts_list.append(time_arr[i + SEQ_LENGTH])

        n_added = len(X_past_list) - n_samples_before
        print(f"  -> Đã trích xuất {n_added:,} mẫu trượt (features: {len(available)}).")

    if not X_past_list:
        print("LỖI: Không tạo được mẫu nào!")
        return

    # Lưu kết quả
    X_past = np.array(X_past_list, dtype=np.float32)
    X_future = np.array(X_future_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.float32)
    rid_arr = np.array(rid_list, dtype=np.int64)
    ts_arr = np.array(ts_list, dtype="datetime64[s]")

    print("\n[3] Scale dữ liệu...")
    scaler = GlobalScaler()
    X_past = scaler.fit_transform(X_past)
    os.makedirs("artifacts", exist_ok=True)
    scaler.save("artifacts/global_scaler.pkl")

    np.save("dataset_X_past.npy", X_past)
    np.save("dataset_X_future.npy", X_future)
    np.save("dataset_y.npy", y)
    np.save("dataset_rid.npy", rid_arr)
    np.save("dataset_timestamps.npy", ts_arr)

    print("\nHÒAN TẤT. Sẵn sàng cho train_local.py!")

if __name__ == "__main__":
    build_4res_dataset()
