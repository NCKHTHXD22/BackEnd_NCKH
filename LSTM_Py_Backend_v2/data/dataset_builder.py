# data/dataset_builder.py
"""
Xây dataset LSTM cho MỘT hồ (không gộp 16 hồ như lstm_service/data/dataset_builder.py).

Nguồn dữ liệu: Data_Tung_Ho_Ma_Tran_Rong/<HO>/<HO>_YYYY_MM.xlsx (giống lstm_service,
KHÔNG dùng API Đà Nẵng để tránh dữ liệu sparse) + Open-Meteo ERA5 archive (data/
nwp_fetcher.py) để bổ sung temperature/relative_humidity/pressure/et0 — khắc phục
hạn chế đã ghi trong lstm_service/features/feature_engineering.py (2 cột đó từng bị
loại vì thiếu trong Excel → train/inference mismatch; giờ dùng cùng 1 nguồn Open-Meteo
cho cả train và inference nên hết mismatch).

Mưa từng trạm riêng lẻ (cho StationRainAttention, models/station_attention.py) đã
verify trực tiếp trên Excel thật (Col 121+i*24, xem data/rain_matrix_loader.py) và
được build khi config.use_station_attention=True (mặc định TẮT — bật trong
config/settings.py hoặc truyền cfg riêng cho build_reservoir_dataset()).
"""

import os
import pickle
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from config.reservoirs import RESERVOIRS
from config.rain_stations import RESERVOIR_TO_STATIONS
from config.settings import ReservoirLSTMConfig, INFLOW_CAPS_M3S
from data.rain_matrix_loader import load_inflow_rain_matrix, load_station_rain_matrix
from data.nwp_fetcher import fetch_nwp_historical_chunked
from data.idw_calculator import ordered_prior_weights
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features,
    add_reservoir_features,
    add_meteo_features,
)


# ── X_hindcast features (47 = 18 rain + 12 inflow + 6 reservoir + 5 meteo + 6 time) ──
FEATURES = [
    "rain", "rain_3h", "rain_6h", "rain_12h", "rain_24h",
    "rain_48h", "rain_72h", "rain_96h", "rain_120h", "rain_168h",
    "rain_intensity", "rain_12h_std", "rain_24h_max",
    "rain_lag_1", "rain_lag_3", "rain_lag_6", "rain_lag_12", "rain_lag_24",
    "inflow", "inflow_prev", "inflow_diff", "inflow_diff_2",
    "inflow_3h_avg", "inflow_6h_avg", "inflow_12h_avg",
    "inflow_24h_avg", "inflow_48h_avg", "inflow_rising",
    "rain_inflow_interaction", "soil_moisture_x_inflow",
    "water_level", "outflow", "Z_diff", "Z_24h_avg", "outflow_diff", "Q_ratio",
    "temperature", "relative_humidity", "pressure", "et0", "wind_speed",
    "hour_sin", "hour_cos", "doy_sin", "doy_cos", "month_sin", "month_cos",
]
N_HINDCAST_FEATURES = len(FEATURES)  # 47

# ── X_nwp features (oracle rain + meteo cho horizon dự báo) ──────────────────────
NWP_FEATURES = ["rain_fc", "rain_fc_3h", "rain_fc_6h", "rain_fc_24h", "temp_fc", "wind_fc"]
N_NWP_FEATURES = len(NWP_FEATURES)  # 6


def _hampel_despike(x: np.ndarray, window: int = 7, n_sigmas: float = 6.0) -> tuple[np.ndarray, int]:
    """Hampel filter: rolling median + MAD, thay các điểm lệch >= n_sigmas độ lệch
    chuẩn quy đổi bằng median cục bộ. Đỉnh lũ thật (tăng/giảm liên tục nhiều giờ)
    không bị làm mượt vì luôn nằm trong dải "bình thường" so với cửa sổ của chính
    nó — chỉ các điểm đơn lẻ tách biệt hẳn khỏi lân cận (nhiễu cảm biến) mới bị sửa.
    Trả về (mảng đã sửa, số điểm đã thay)."""
    x = x.copy()
    n = len(x)
    half = window // 2
    k = 1.4826  # hệ số quy đổi MAD -> độ lệch chuẩn tương đương (phân phối chuẩn)
    n_replaced = 0
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        seg = x[lo:hi]
        med = np.median(seg)
        mad = np.median(np.abs(seg - med))
        if mad > 0 and abs(x[i] - med) > n_sigmas * k * mad:
            x[i] = med
            n_replaced += 1
    return x, n_replaced


def _build_nwp_window(rain: np.ndarray, temp: np.ndarray, wind: np.ndarray) -> np.ndarray:
    """(T,) mỗi mảng -> (T, N_NWP_FEATURES). rain đã tích lũy rolling theo forward-window."""
    T = len(rain)

    def rolling_sum_forward(arr, w):
        cs = np.concatenate([[0.0], np.cumsum(arr)])
        out = np.zeros(T, dtype=np.float32)
        for t in range(T):
            out[t] = cs[min(t + w, T)] - cs[t]
        return out

    return np.column_stack([
        rain,
        rolling_sum_forward(rain, 3),
        rolling_sum_forward(rain, 6),
        rolling_sum_forward(rain, 24),
        temp,
        wind,
    ]).astype(np.float32)


def build_reservoir_dataset(
    rid: int,
    start_date: str = "2022-01-01",
    end_date: str = "2025-12-31",
    cfg: ReservoirLSTMConfig | None = None,
    out_root: str = "datasets",
    fetch_nwp: bool = True,
    raw_df: pd.DataFrame | None = None,
):
    """
    Xây dataset cho 1 hồ (rid), lưu vào datasets/<reservoir_key>/v2_*.npy
    và artifacts/<reservoir_key>/scaler.pkl.

    fetch_nwp=False: bỏ qua gọi Open-Meteo (dùng khi test nhanh không có mạng —
    temperature/relative_humidity/pressure/et0 sẽ = 0, giống hành vi cũ).

    raw_df: DataFrame time|inflow|rain|water_level|outflow đã có sẵn (bỏ qua
    load_inflow_rain_matrix/Excel) — dùng khi Data_Tung_Ho_Ma_Tran_Rong/ không
    có, ví dụ khôi phục từ data/legacy_v1_recover.py::recover_raw_dataframe().
    """
    if rid not in RESERVOIRS:
        raise ValueError(f"rid={rid} không có trong config/reservoirs.py")
    info = RESERVOIRS[rid]
    name = info["name"]
    reservoir_key = name.replace(" ", "_")

    cfg = cfg or ReservoirLSTMConfig(rid=rid, reservoir_name=name)
    hindcast_len = cfg.hindcast_len
    forecast_len = cfg.forecast_len

    print("=" * 70)
    print(f"BUILD DATASET: [{rid}] {name}  ({start_date} -> {end_date})")
    print(f"hindcast_len={hindcast_len}h  forecast_len={forecast_len}h")
    print("=" * 70)

    start_dt = pd.Timestamp(start_date)
    end_dt   = pd.Timestamp(end_date)

    # ── 1. Load Excel matrix (hoặc raw_df khôi phục sẵn) ────────────────────────
    if raw_df is not None:
        print("  Dùng raw_df được truyền vào (bỏ qua Excel/load_inflow_rain_matrix).")
        df = raw_df.copy()
    else:
        df = load_inflow_rain_matrix(rid, start_date=start_dt, end_date=end_dt)
    if df.empty:
        raise RuntimeError(f"Không có dữ liệu cho {name} (rid={rid}).")

    # ── 2. Backbone hourly liên tục ──────────────────────────────────────────────
    full_idx = pd.date_range(start=start_dt, end=end_dt, freq="h")
    df = df.set_index("time").reindex(full_idx).rename_axis("time").reset_index()

    # ── 3. Nội suy inflow/Z/Q_out, fill rain ────────────────────────────────────
    df["inflow"] = df["inflow"].interpolate(method="linear", limit=6, limit_direction="both")
    df["rain"]   = df["rain"].fillna(0.0)
    for col in ("water_level", "outflow"):
        if col in df.columns:
            df[col] = df[col].interpolate(method="linear", limit=6, limit_direction="both")

    # ── 4. Coverage check ────────────────────────────────────────────────────────
    valid_pct = df["inflow"].notna().mean() * 100
    print(f"  Hourly rows: {len(df):,}  |  Inflow coverage: {valid_pct:.1f}%")
    if valid_pct < 30:
        raise RuntimeError(f"Coverage quá thấp ({valid_pct:.1f}%) cho {name} — không build.")

    # ── 5. Outlier cap + despike (Hampel filter) + sqrt transform ───────────────
    cap = INFLOW_CAPS_M3S.get(rid)
    if cap:
        before_max = df["inflow"].max()
        df["inflow"] = df["inflow"].clip(upper=cap)
        if before_max > cap:
            print(f"  Clip inflow: {before_max:.0f} -> {cap} m3/s")
    if cfg.despike:
        despiked, n_despiked = _hampel_despike(
            df["inflow"].values, window=cfg.despike_window, n_sigmas=cfg.despike_n_sigmas
        )
        df["inflow"] = despiked
        if n_despiked:
            print(f"  Despike (Hampel filter): thay {n_despiked} điểm bất thường "
                  f"({n_despiked / len(df) * 100:.2f}%)")
    df["inflow_sqrt"] = np.sqrt(df["inflow"].clip(lower=0))

    # ── 6. NWP historical (Open-Meteo ERA5 archive) ─────────────────────────────
    if fetch_nwp:
        print("  Fetching Open-Meteo ERA5 historical (temp/rh/pressure/wind/et0)...")
        try:
            nwp = fetch_nwp_historical_chunked(
                lat=info["lat"], lon=info["lon"],
                start_date=start_date, end_date=end_date,
            )
            nwp_df = pd.DataFrame({
                "time":         pd.to_datetime(nwp["timestamps"]),
                "temp_c":       nwp["temp_c"],
                "wind_ms":      nwp["wind_ms"],
                "pressure_hpa": nwp["pressure_hpa"],
                "rh_pct":       nwp["rh_pct"],
                "et0_mm":       nwp["et0_mm"],
            })
            df = pd.merge(df, nwp_df, on="time", how="left")
        except Exception as e:
            print(f"  WARNING: NWP fetch failed ({e}) — temperature/rh/pressure/et0 sẽ = 0.")
    else:
        print("  fetch_nwp=False — bỏ qua Open-Meteo, meteo features = 0.")

    # ── 6b. Mưa từng trạm riêng lẻ (tùy chọn, cho StationRainAttention) ─────────
    station_arr, station_mask_arr, prior_weights = None, None, None
    station_keys = RESERVOIR_TO_STATIONS.get(rid, [])
    if cfg.use_station_attention and station_keys:
        print(f"  Parsing mưa từng trạm ({len(station_keys)} trạm)...")
        st_df = load_station_rain_matrix(rid, station_keys, start_date=start_dt, end_date=end_dt)
        if st_df.empty:
            print("  WARNING: Không đọc được dữ liệu trạm riêng lẻ — station_arr sẽ để trống.")
        else:
            st_df = (
                st_df.set_index("time").reindex(full_idx).rename_axis("time").reset_index()
            )
            n_st = len(station_keys)
            station_arr = np.zeros((len(df), cfg.max_stations), dtype=np.float32)
            station_mask_arr = np.zeros((len(df), cfg.max_stations), dtype=bool)
            for i, sk in enumerate(station_keys[: cfg.max_stations]):
                if sk not in st_df.columns:
                    continue
                col = st_df[sk].values
                valid = ~np.isnan(col)
                station_arr[valid, i] = col[valid].astype(np.float32)
                station_mask_arr[:, i] = valid
            prior_weights = ordered_prior_weights(rid)
            print(f"  Station coverage: " + ", ".join(
                f"{sk}={station_mask_arr[:, i].mean()*100:.0f}%"
                for i, sk in enumerate(station_keys[: cfg.max_stations])
            ))

    # ── 7. Feature engineering ──────────────────────────────────────────────────
    df["inflow_raw"] = df["inflow"]        # giữ inflow gốc (m3/s) cho oracle rain window
    df["inflow"] = df["inflow_sqrt"]       # add_inflow_features() thao tác trên sqrt space
    df = add_time_features(df)
    df = add_rain_features(df)
    df = add_inflow_features(df)
    df = add_reservoir_features(df)
    df = add_meteo_features(df)
    df = df.fillna(0.0)

    missing = [f for f in FEATURES if f not in df.columns]
    if missing:
        raise RuntimeError(f"Thiếu features: {missing}")

    # ── 8. Sliding windows ───────────────────────────────────────────────────────
    feat_arr = df[FEATURES].values.astype(np.float32)
    y_arr    = df["inflow_sqrt"].values.astype(np.float32)
    rain_arr = df["rain"].values.astype(np.float32)
    temp_arr = df.get("temperature", pd.Series(np.zeros(len(df)))).values.astype(np.float32)
    wind_arr = df.get("wind_speed",  pd.Series(np.zeros(len(df)))).values.astype(np.float32)
    time_arr = df["time"].values

    window_len = hindcast_len + forecast_len
    X_hind_list, X_nwp_list, y_list, ts_list = [], [], [], []
    station_rain_list, station_mask_list = [], []
    build_station = station_arr is not None

    for i in range(len(df) - window_len + 1):
        hind_end = i + hindcast_len
        fc_end   = hind_end + forecast_len

        target = y_arr[hind_end:fc_end]
        if np.any(np.isnan(target)):
            continue

        X_hind_list.append(feat_arr[i:hind_end])
        X_nwp_list.append(_build_nwp_window(
            rain_arr[hind_end:fc_end], temp_arr[hind_end:fc_end], wind_arr[hind_end:fc_end],
        ))
        y_list.append(target)
        ts_list.append(time_arr[hind_end])

        if build_station:
            station_rain_list.append(station_arr[i:hind_end])
            station_mask_list.append(station_mask_arr[i:hind_end])

    if not X_hind_list:
        raise RuntimeError(f"Không tạo được sample nào cho {name} — kiểm tra hindcast_len/forecast_len.")

    X_hind = np.stack(X_hind_list, axis=0)
    X_nwp  = np.stack(X_nwp_list,  axis=0)
    y      = np.stack(y_list,      axis=0)
    ts     = np.array(ts_list, dtype="datetime64[s]")

    print(f"  Samples: {len(X_hind):,} | X_hind={X_hind.shape} | X_nwp={X_nwp.shape} | y={y.shape}")

    # ── 9. Scale X_hindcast (StandardScaler trên toàn bộ — giữ nguyên convention
    #      của lstm_service/data/dataset_builder.py, KHÔNG chỉ fit trên train) ───
    N, T, F = X_hind.shape
    scaler = StandardScaler()
    X_hind_scaled = scaler.fit_transform(X_hind.reshape(-1, F)).reshape(N, T, F).astype(np.float32)

    # ── 10. Save ─────────────────────────────────────────────────────────────────
    out_dir = os.path.join(out_root, reservoir_key)
    os.makedirs(out_dir, exist_ok=True)
    np.save(os.path.join(out_dir, "v2_X_hindcast.npy"), X_hind_scaled)
    np.save(os.path.join(out_dir, "v2_X_nwp.npy"),       X_nwp)
    np.save(os.path.join(out_dir, "v2_y.npy"),            y)
    np.save(os.path.join(out_dir, "v2_timestamps.npy"),  ts)

    if build_station and len(station_rain_list) == len(X_hind_list):
        station_rain_out = np.stack(station_rain_list, axis=0)
        station_mask_out = np.stack(station_mask_list, axis=0)
        np.save(os.path.join(out_dir, "v2_station_rain.npy"), station_rain_out)
        np.save(os.path.join(out_dir, "v2_station_mask.npy"), station_mask_out)
        np.save(os.path.join(out_dir, "v2_station_prior_weights.npy"),
                np.array(prior_weights, dtype=np.float32))
        print(f"  Saved v2_station_rain.npy: {station_rain_out.shape}  "
              f"(prior_weights={[round(w, 3) for w in prior_weights]})")

    artifacts_dir = os.path.join(cfg.artifacts_dir, reservoir_key)
    os.makedirs(artifacts_dir, exist_ok=True)
    with open(os.path.join(artifacts_dir, "scaler.pkl"), "wb") as f:
        pickle.dump(scaler, f)

    print(f"  Saved -> {out_dir}/  +  {artifacts_dir}/scaler.pkl")
    return out_dir


def build_all_reservoirs(start_date: str = "2022-01-01", end_date: str = "2025-12-31",
                          fetch_nwp: bool = True, use_legacy_v1: bool = False):
    """Loop build_reservoir_dataset() cho tất cả 16 hồ, bỏ qua hồ lỗi thay vì dừng cả loạt."""
    results = {}
    for rid, info in RESERVOIRS.items():
        try:
            raw_df = None
            if use_legacy_v1:
                from data.legacy_v1_recover import recover_raw_dataframe
                raw_df = recover_raw_dataframe(info["idx"])
            results[rid] = build_reservoir_dataset(
                rid, start_date, end_date, fetch_nwp=fetch_nwp, raw_df=raw_df,
            )
        except Exception as e:
            print(f"  [SKIP] rid={rid} {info['name']}: {e}")
    print(f"\nHoàn tất: {len(results)}/{len(RESERVOIRS)} hồ build thành công.")
    return results
