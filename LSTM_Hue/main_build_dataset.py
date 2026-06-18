"""
Entry point: Xây dựng training dataset cho HueLSTM.

Workflow:
  1. Load raw hydro data (VNDMS hoặc Excel) cho từng hồ
  2. Load rain station data → IDW interpolation → rain bình quân lưu vực
  3. Fetch ERA5 historical NWP từ Open-Meteo Archive
  4. Feature engineering (build_feature_matrix)
  5. Fit + apply StandardScaler
  6. Build sliding windows (720h hindcast + 168h forecast)
  7. Save hue_*.npy files

Trước khi chạy: chuẩn bị dữ liệu thô trong thư mục raw_data/
  raw_data/ta_trach/hydro_hourly.csv   — cột: datetime, inflow_m3s, water_level_m, outflow_m3s
  raw_data/binh_dien/hydro_hourly.csv
  raw_data/huong_dien/hydro_hourly.csv
  raw_data/rain_stations/              — file CSV mỗi trạm: datetime, rain_mm
"""

import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
import pickle

from config.settings import HueLSTMConfig
from config.basins import BASINS
from config.rain_stations import RAIN_STATIONS
from data.idw import build_basin_interpolators
from data.feature_builder import build_feature_matrix, build_nwp_features
from data.nwp_fetcher import fetch_nwp_historical, nwp_to_arrays
from data.dataset import HueDatasetBuilder


RAW_DATA_DIR = "raw_data"
OUT_DIR = "."  # save hue_*.npy ở đây


def load_hydro_csv(basin_key: str) -> pd.DataFrame:
    path = os.path.join(RAW_DATA_DIR, basin_key, "hydro_hourly.csv")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Không tìm thấy: {path}\n"
            f"Format: datetime,inflow_m3s,water_level_m,outflow_m3s"
        )
    df = pd.read_csv(path, parse_dates=["datetime"])
    df = df.set_index("datetime").sort_index()
    df = df.resample("1h").mean()  # ensure hourly, fill gaps with NaN then ffill
    df = df.ffill(limit=6)         # forward fill ≤ 6h
    return df


def load_rain_stations(
    station_ids: list,
    start_date: str,
    end_date: str,
) -> dict:
    """Load rain CSVs → dict {station_id: pd.Series (hourly)}."""
    rain_dir = os.path.join(RAW_DATA_DIR, "rain_stations")
    station_data = {}
    for sid in station_ids:
        path = os.path.join(rain_dir, f"{sid}.csv")
        if not os.path.exists(path):
            print(f"  WARNING: Rain station {sid} not found, skip")
            continue
        df = pd.read_csv(path, parse_dates=["datetime"])
        df = df.set_index("datetime").sort_index()
        series = df["rain_mm"].resample("1h").sum()
        series = series.loc[start_date:end_date]
        station_data[sid] = series.values.astype(np.float32)
        print(f"  Rain {sid}: {len(series):,} hours")
    return station_data


def build():
    cfg = HueLSTMConfig()

    print("=" * 60)
    print("Building HueLSTM Dataset")
    print(f"  Hindcast: {cfg.hindcast_length}h | Forecast: {cfg.forecast_length}h")
    print(f"  Train: {cfg.train_start} → {cfg.train_end}")
    print("=" * 60)

    # IDW interpolators
    idw_interps = build_basin_interpolators(BASINS, RAIN_STATIONS)

    builder = HueDatasetBuilder(
        hindcast_len=cfg.hindcast_length,
        forecast_len=cfg.forecast_length,
        stride=1,
    )

    all_X_raw = []  # collect all feature matrices for scaler fitting

    for basin_key, basin_info in BASINS.items():
        basin_id = basin_info["id"]
        print(f"\nProcessing: {basin_info['name']} (id={basin_id})")

        # 1. Hydro data
        try:
            hydro_df = load_hydro_csv(basin_key)
        except FileNotFoundError as e:
            print(f"  SKIP: {e}")
            continue

        start_date = hydro_df.index[0].strftime("%Y-%m-%d")
        end_date   = hydro_df.index[-1].strftime("%Y-%m-%d")
        print(f"  Hydro: {start_date} → {end_date} ({len(hydro_df):,}h)")

        # 2. Rain data
        rain_station_ids = basin_info["rain_station_ids"]
        station_data = load_rain_stations(rain_station_ids, start_date, end_date)

        # IDW interpolation → rain series per basin
        rain_aligned = {}
        for sid in rain_station_ids:
            if sid in station_data:
                rain_aligned[sid] = station_data[sid]

        # Manual IDW per timestep (simplified: use interp.interpolate_series)
        interp = idw_interps[basin_key]
        station_series_dict = {}
        for sid, arr in rain_aligned.items():
            padded = np.full(len(hydro_df), np.nan, dtype=np.float32)
            n = min(len(arr), len(padded))
            padded[:n] = arr[:n]
            station_series_dict[sid] = padded

        rain_basin = interp.interpolate_series(station_series_dict)

        # 3. NWP historical (ERA5 via Open-Meteo)
        print(f"  Fetching ERA5 historical NWP...")
        try:
            nwp = fetch_nwp_historical(
                lat=basin_info["lat"], lon=basin_info["lon"],
                start_date=start_date, end_date=end_date
            )
            rain_nwp, temp, wind, pressure, rh = nwp_to_arrays(nwp)
            # Align length
            T = len(hydro_df)
            rain_nwp = rain_nwp[:T]; temp = temp[:T]; wind = wind[:T]
            pressure = pressure[:T]; rh = rh[:T]
        except Exception as e:
            print(f"  WARNING: NWP fetch failed ({e}), using zeros")
            T = len(hydro_df)
            rain_nwp = np.zeros(T, np.float32)
            temp = np.full(T, 25.0, np.float32)
            wind = np.zeros(T, np.float32)
            pressure = np.full(T, 1013.0, np.float32)
            rh = np.full(T, 80.0, np.float32)

        # 4. Feature engineering
        timestamps = hydro_df.index.values.astype("datetime64[s]")
        inflow  = hydro_df["inflow_m3s"].fillna(0).values.astype(np.float32)
        z_level = hydro_df["water_level_m"].fillna(basin_info["dead_level_m"]).values.astype(np.float32)
        outflow = hydro_df["outflow_m3s"].fillna(0).values.astype(np.float32)

        X_hist = build_feature_matrix(
            timestamps=timestamps,
            rain_mm=rain_basin,
            inflow=inflow,
            water_level=z_level,
            outflow=outflow,
            flood_limit_m=basin_info["flood_limit_level_m"],
            temp_c=temp,
            wind_ms=wind,
            pressure_hpa=pressure,
            rh_pct=rh,
        )

        # NWP oracle series (training: actual rain as oracle forecast)
        nwp_oracle = build_nwp_features(rain_basin, temp, wind, pressure, rh)

        # Target: √(inflow)
        y_sqrt = np.sqrt(np.maximum(inflow, 0.0))

        all_X_raw.append(X_hist)

        # Save raw (pre-scaler) — builder will apply scaler later
        builder._raw_data[basin_key] = {
            "X_hist": X_hist, "nwp_oracle": nwp_oracle,
            "y_sqrt": y_sqrt, "timestamps": timestamps,
            "basin_id": basin_id,
        }

    # 5. Fit StandardScaler on training period only
    print("\nFitting StandardScaler on training data...")
    scaler = StandardScaler()
    train_end_ts = np.datetime64(cfg.train_end, "s")

    for basin_key, data in builder._raw_data.items():
        ts = data["timestamps"]
        train_mask = ts <= train_end_ts
        scaler.partial_fit(data["X_hist"][train_mask])

    # Save scaler
    os.makedirs("artifacts", exist_ok=True)
    with open("artifacts/hue_scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    print("Saved: artifacts/hue_scaler.pkl")

    # 6. Scale and add to builder
    print("\nBuilding sliding windows...")
    for basin_key, data in builder._raw_data.items():
        X_scaled = scaler.transform(data["X_hist"])
        builder.add_basin(
            basin_id=data["basin_id"],
            X_series=X_scaled,
            y_series=data["y_sqrt"],
            nwp_series=data["nwp_oracle"],
            timestamps=data["timestamps"],
        )

    # 7. Save dataset
    builder.save(OUT_DIR)
    print("\nDataset build complete!")


if __name__ == "__main__":
    # Monkey-patch builder to support raw_data dict
    from data.dataset import HueDatasetBuilder as _Base
    _Base._raw_data = {}
    build()
