# data/dataset_builder.py
# Xây dựng dataset LSTM từ file Excel chuẩn hóa (Data_Tung_Ho_Ma_Tran_Rong)
# KHÔNG dùng API Đà Nẵng để tránh dữ liệu sparse/thiếu.
# Nguồn duy nhất: Data_Tung_Ho_Ma_Tran_Rong/<HO>/<HO>_YYYY_MM.xlsx
#
# Cấu trúc file MỚI (sau update_excel_z_qout.py):
#   - Mực nước Z (m)       : cột 1-24
#   - Lưu lượng đến (m3/s) : cột 25-48
#   - Lưu lượng xả (m3/s)  : cột 49-72
#   - Mưa lưu vực IDW (mm) : cột 73-96
# Cấu trúc file CŨ (tự động phát hiện — tương thích ngược):
#   - Lưu lượng đến (m3/s) : cột 1-24
#   - Mưa lưu vực IDW (mm) : cột 25-48

import numpy as np
import pandas as pd

from config.reservoirs import RESERVOIRS
from config.settings import SEQ_LENGTH, HORIZON
from data.rain_matrix_loader import load_inflow_rain_matrix
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features,
    add_reservoir_features,
    add_meteo_features,
)
from utils.scaler_utils import GlobalScaler


# Giới hạn inflow hợp lý (m3/s) — dựa trên p99.9 + kiểm tra thực địa
# rid key khớp với config/reservoirs.py
INFLOW_CAPS_M3S = {
    1:  2500,   # HO A VUONG        (rid=1,  idx=0)
    2:  4500,   # HO DAK MI 4       (rid=2,  idx=1)
    3:  4500,   # HO SONG BUNG 4    (rid=3,  idx=2)
    4:  8000,   # HO SONG TRANH 2   (rid=4,  idx=3)
    7:  7000,   # HO SONG BUNG 4A   (rid=7,  idx=4)
    8:  7000,   # HO SONG BUNG 5    (rid=8,  idx=5)
    9:  800,    # HO SONG BUNG 2    (rid=9,  idx=6)
    11: 8000,   # HO SONG BUNG 6    (rid=11, idx=7)
    12: 12000,  # HO SONG TRANH 3   (rid=12, idx=8)
    13: 2500,   # HO ZA HUNG        (rid=13, idx=9)
    14: 2000,   # HO DAK MI 3       (rid=14, idx=10)
    15: 1000,   # HO KHE DIEN       (rid=15, idx=11)
    16: 900,    # HO SONG CON 2     (rid=16, idx=12)
    17: 13000,  # HO SONG TRANH 4   (rid=17, idx=13)
    18: 2500,   # HO DAK MI 2       (rid=18, idx=14)
    19: 700,    # HO DAK MI 4C      (rid=19, idx=15)
}

# ── X_past features ───────────────────────────────────────────────────────────
FEATURES = [
    # Mưa tức thời và tích lũy (18)
    "rain", "rain_3h", "rain_6h", "rain_12h", "rain_24h",
    "rain_48h", "rain_72h", "rain_96h", "rain_120h", "rain_168h",
    "rain_intensity", "rain_12h_std", "rain_24h_max",
    "rain_lag_1", "rain_lag_3", "rain_lag_6", "rain_lag_12", "rain_lag_24",
    # Lưu lượng và trạng thái (12)
    "inflow", "inflow_prev", "inflow_diff", "inflow_diff_2",
    "inflow_3h_avg", "inflow_6h_avg", "inflow_12h_avg",
    "inflow_24h_avg", "inflow_48h_avg", "inflow_rising",
    "rain_inflow_interaction", "soil_moisture_x_inflow",
    # Hồ chứa (6) — từ Z/Q_out sau update_excel_z_qout
    "water_level", "outflow", "Z_diff", "Z_24h_avg", "outflow_diff", "Q_ratio",
    # Khí tượng (2) — et0 và wind_speed từ open-meteo archive (0.0 nếu không có)
    # Lưu ý: temperature và relative_humidity bị loại khỏi training vì không có
    # dữ liệu lịch sử trong Excel → train/inference mismatch
    "et0", "wind_speed",
    # Thời gian (6)
    "hour_sin", "hour_cos", "doy_sin", "doy_cos", "month_sin", "month_cos",
]  # Tổng: 18 + 12 + 6 + 4 + 6 = 46 features

# Features tùy chọn — điền 0 nếu không có trong data (sẽ được model học skip)
OPTIONAL_FEATURES = [
    "water_level", "outflow", "Z_diff", "Z_24h_avg", "outflow_diff", "Q_ratio",
    "et0", "wind_speed",
]
REQUIRED_FEATURES = [f for f in FEATURES if f not in OPTIONAL_FEATURES]

# ── X_future features (oracle rain cho training) ──────────────────────────────
# Mỗi timestep t+1..t+HORIZON cung cấp 3 features: rain thực tế + tích lũy 6h/24h
FUTURE_FEATURES = ["rain_fc", "rain_fc_6h", "rain_fc_24h"]  # 3 features/step


def build_global_dataset(
    start_date: str = "2022-01-01",
    end_date: str   = "2025-12-31",
):
    """
    Xây dựng dataset LSTM từ file Excel chuẩn hóa.
    Lưu 3 file .npy:
      dataset_X_past.npy  — (N, SEQ_LENGTH, n_features)
      dataset_y.npy       — (N, HORIZON)          [sqrt space]
      dataset_rid.npy     — (N,)
    Và artifacts/global_scaler.pkl.
    """
    start_dt = pd.Timestamp(start_date)
    end_dt   = pd.Timestamp(end_date)

    print("=" * 70)
    print(f"BUILD DATASET: {start_date} to {end_date}")
    print(f"SEQ_LENGTH={SEQ_LENGTH}h  HORIZON={HORIZON}h")
    print("=" * 70)

    X_past_list, X_future_list, y_list, rid_list, ts_list = [], [], [], [], []

    for rid, info in RESERVOIRS.items():
        name    = info["name"]
        res_idx = info["idx"]
        print(f"\n  [{rid:>2}] {name}")

        # ── 1. Load từ Excel matrix ──────────────────────────────────────────
        df = load_inflow_rain_matrix(rid, start_date=start_dt, end_date=end_dt)
        if df.empty:
            print(f"       SKIP - khong co du lieu Excel.")
            continue

        # ── 2. Backbone hourly liên tục (tránh lỗ thời gian) ─────────────────
        full_idx = pd.date_range(start=start_dt, end=end_dt, freq="h")
        df = (
            df.set_index("time")
              .reindex(full_idx)
              .rename_axis("time")
              .reset_index()
        )

        # ── 3. Nội suy inflow, Z, Q_out (tuyến tính, tối đa 6h) ─────────────
        df["inflow"] = (
            df["inflow"]
              .interpolate(method="linear", limit=6, limit_direction="both")
        )
        df["rain"] = df["rain"].fillna(0.0)

        for col in ("water_level", "outflow"):
            if col in df.columns:
                df[col] = df[col].interpolate(
                    method="linear", limit=6, limit_direction="both"
                )

        # ── 4. Kiểm tra coverage ─────────────────────────────────────────────
        valid_pct = df["inflow"].notna().mean() * 100
        print(f"       Hourly rows: {len(df):,}  |  Inflow coverage: {valid_pct:.1f}%")
        if valid_pct < 30:
            print(f"       SKIP - coverage qua thap ({valid_pct:.1f}%)")
            continue

        # ── 5. Clip outlier ───────────────────────────────────────────────────
        cap = INFLOW_CAPS_M3S.get(rid)
        if cap:
            before_max = df["inflow"].max()
            df["inflow"] = df["inflow"].clip(upper=cap)
            if before_max > cap:
                print(f"       Clip inflow: {before_max:.0f} -> {cap} m3/s")

        # ── 6. sqrt transform ─────────────────────────────────────────────────
        df["inflow"] = np.sqrt(df["inflow"].clip(lower=0))

        # ── 7. Feature engineering ────────────────────────────────────────────
        df = add_time_features(df)
        df = add_rain_features(df)
        df = add_inflow_features(df)
        df = add_reservoir_features(df)   # Z_diff, Z_24h_avg, outflow_diff, Q_ratio
        df = add_meteo_features(df)       # temperature, relative_humidity, et0, wind_speed (0 nếu không có)

        # Điền NaN còn lại sau FE bằng 0
        df = df.fillna(0.0)

        # ── 8. Kiểm tra features ──────────────────────────────────────────────
        available = [f for f in FEATURES if f in df.columns]
        missing_required = [f for f in REQUIRED_FEATURES if f not in df.columns]
        optional_present = [f for f in OPTIONAL_FEATURES if f in df.columns]

        if missing_required:
            print(f"       [WARN] Missing required features: {missing_required}")
        if optional_present:
            print(f"       [INFO] Optional features present: {optional_present}")

        if len(available) < 20:
            print(f"       SKIP - qua it features ({len(available)}).")
            continue

        # ── 9. Tạo mẫu sliding window ─────────────────────────────────────────
        feat_arr   = df[available].values.astype(np.float32)
        inflow_arr = df["inflow"].values.astype(np.float32)
        rain_arr   = df["rain"].values.astype(np.float32)   # oracle rain cho X_future
        time_arr   = df["time"].values  # numpy datetime64

        n_samples_before = len(X_past_list)
        for i in range(len(df) - SEQ_LENGTH - HORIZON):
            past   = feat_arr[i : i + SEQ_LENGTH]
            target = inflow_arr[i + SEQ_LENGTH : i + SEQ_LENGTH + HORIZON]

            # Bỏ mẫu nếu target có NaN
            if np.any(np.isnan(target)):
                continue

            # ── X_future: oracle rain cho HORIZON bước tương lai ─────────────
            # 3 features/step: rain_fc (giờ), rain_fc_6h (tích lũy 6h), rain_fc_24h (tích lũy 24h)
            future_rain = rain_arr[i + SEQ_LENGTH : i + SEQ_LENGTH + HORIZON]
            x_fut = np.zeros((HORIZON, 3), dtype=np.float32)
            x_fut[:, 0] = future_rain                                   # rain_fc tức thời
            x_fut[:, 1] = np.convolve(future_rain, np.ones(6),  mode='full')[:HORIZON]   # cum 6h
            x_fut[:, 2] = np.convolve(future_rain, np.ones(24), mode='full')[:HORIZON]   # cum 24h

            X_past_list.append(past)
            X_future_list.append(x_fut)
            y_list.append(target)
            rid_list.append(res_idx)
            ts_list.append(time_arr[i + SEQ_LENGTH])

        n_added = len(X_past_list) - n_samples_before
        opt_str = f" +{len(optional_present)} optional" if optional_present else ""
        print(f"       Samples: {n_added:,}  (features={len(available)}{opt_str})")

    if not X_past_list:
        print("\nERROR: No samples created!")
        return

    X_past   = np.array(X_past_list,   dtype=np.float32)
    X_future = np.array(X_future_list, dtype=np.float32)
    y        = np.array(y_list,         dtype=np.float32)
    rid_arr  = np.array(rid_list,       dtype=np.int64)
    ts_arr   = np.array(ts_list,        dtype="datetime64[s]")

    print(f"\nTotal: {len(X_past):,} samples | X_past={X_past.shape} | X_future={X_future.shape} | y={y.shape}")

    # ── 10. Scale X_past ──────────────────────────────────────────────────────
    print("Scaling data...")
    scaler = GlobalScaler()
    X_past = scaler.fit_transform(X_past)
    import os
    os.makedirs("artifacts", exist_ok=True)
    scaler.save("artifacts/global_scaler.pkl")

    # ── 11. Lưu .npy ─────────────────────────────────────────────────────────
    np.save("dataset_X_past.npy",      X_past)
    np.save("dataset_X_future.npy",    X_future)
    np.save("dataset_y.npy",           y)
    np.save("dataset_rid.npy",         rid_arr)
    np.save("dataset_timestamps.npy",  ts_arr)

    print("\nSaved:")
    print(f"  dataset_X_past.npy       {X_past.shape}  {X_past.nbytes/1e9:.2f} GB")
    print(f"  dataset_X_future.npy     {X_future.shape}  {X_future.nbytes/1e6:.0f} MB")
    print(f"  dataset_y.npy            {y.shape}")
    print(f"  dataset_rid.npy          {rid_arr.shape}")
    print(f"  dataset_timestamps.npy   {ts_arr.shape}  [{ts_arr.min()} to {ts_arr.max()}]")
    print(f"  artifacts/global_scaler.pkl")
    print("\nDone! Run: python main_build_dataset.py then upload to Kaggle.")


if __name__ == "__main__":
    build_global_dataset()
