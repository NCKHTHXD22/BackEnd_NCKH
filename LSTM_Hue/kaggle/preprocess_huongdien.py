"""
Preprocessing pipeline cho Hương Điền — chạy LOCAL trước khi upload Kaggle.

Đầu vào (Excel):
  Data_Lake_Rain/HUONGDIEN_DATA/Resoiver_Huong_Dien.xlsx
  Data_Lake_Rain/HUONGDIEN_DATA/Rain_RaoTrang3_RaoTrang4_HoaMy_MyXuyen.xlsx

Đầu ra (trong kaggle_dataset/):
  X_rainy_{train|val|test}.npy  — (N, 48, 45) float32
  y_rainy_{train|val|test}.npy  — (N, 24)     float32  [√inflow]
  ts_rainy_{train|val|test}.npy — (N,)         datetime64
  X_dry_{train|val|test}.npy
  y_dry_{train|val|test}.npy
  ts_dry_{train|val|test}.npy
  scaler_rainy.pkl / scaler_dry.pkl
  feature_names.json
  split_info.json

Cách dùng:
  cd LSTM_Hue
  python kaggle/preprocess_huongdien.py

Sau đó upload folder kaggle_dataset/ lên Kaggle Dataset.

== SPLIT STRATEGY ==
RAINY (tháng 9,10,11,12,1):
  TRAIN : Jan 2022 + Sep-Dec 2023 + Jan 2024  (toàn bộ chu kỳ lũ 2023-24)
  VAL   : Sep 2025                              (ramp-up season, ~650 windows)
  TEST  : Oct-Dec 2025                          (đỉnh lũ lớn nhất! max=7865 m³/s)

  Lý do TEST = Oct-Dec 2025 (không phải toàn bộ 2025):
    - Oct 2025 max=4907, Nov 2025 max=7865 → TEST trên đúng điều kiện lũ cực đoan
    - Sep 2025 làm VAL giúp model thấy "transition vào lũ" trước khi test

DRY (tháng 2–8):
  TRAIN : 2022-May → 2025-May-07   (~2 475 windows)
  VAL   : 2025-May-07 → 2025-Jun-30 (~1 131 windows, 14%)
  TEST  : 2025-Jul → 2025-Aug-31    (~1 361 windows, 17%)  ← Split ~50/23/27
"""

import os, json, pickle, warnings, math
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

# ── Đường dẫn ─────────────────────────────────────────────────────────────────
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "Data_Lake_Rain", "HUONGDIEN_DATA")
OUT_DIR  = os.path.join(os.path.dirname(__file__), "..", "kaggle_dataset")

# ── Hyperparams ────────────────────────────────────────────────────────────────
LOOKBACK = 48   # giờ hindcast (input sequence length)
HORIZON  = 24   # giờ forecast (output sequence length)
STRIDE   = 1    # sliding window stride

# ── Mùa ───────────────────────────────────────────────────────────────────────
RAINY_MONTHS = {9, 10, 11, 12, 1}
DRY_MONTHS   = {2, 3, 4, 5, 6, 7, 8}

# ── Mốc split ─────────────────────────────────────────────────────────────────
RAINY_TRAIN_END  = "2024-02-01"   # Toàn bộ chu kỳ lũ 2023-24 → TRAIN
RAINY_VAL_END    = "2025-10-01"   # Sep 2025 = VAL (ramp-up mùa lũ 2025)
RAINY_TEST_START = "2025-10-01"   # Oct-Dec 2025 = TEST (đỉnh lũ lớn nhất!)
RAINY_TEST_END   = "2025-12-31"

DRY_TRAIN_END    = "2025-05-07"
DRY_VAL_END      = "2025-06-30"
DRY_TEST_START   = "2025-07-01"
DRY_TEST_END     = "2025-08-31"

# Tên rút gọn cho 4 trạm mưa
STATION_MAP = {
    "Hồ Hòa Mỹ (Phong Điền)":                   "hm",
    "Hồ Mỹ Xuyên (Phong Điền)":                  "mx",
    "Đập Thủy điện Rào Trăng 3 (Phong Điền)":    "rt3",
    "Đập Thủy điện Rào Trăng 4 (Phong Điền)":    "rt4",
}

# ── IDW: Toạ độ trạm mưa & tâm lưu vực Hương Điền ────────────────────────────
# Tâm lưu vực (đập Hương Điền trên sông Bồ, Phong Điền, TTH)
RESERVOIR_LAT, RESERVOIR_LON = 16.37, 107.27

STATION_COORDS = {          # (lat, lon)
    "rt3": (16.42, 107.35),  # Đập TĐ Rào Trăng 3
    "rt4": (16.44, 107.33),  # Đập TĐ Rào Trăng 4
    "hm":  (16.50, 107.40),  # Hồ Hòa Mỹ
    "mx":  (16.52, 107.42),  # Hồ Mỹ Xuyên
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Khoảng cách Haversine (km) giữa hai điểm địa lý."""
    R = 6371.0
    r = math.radians
    dlat = r(lat2 - lat1)
    dlon = r(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def compute_idw_weights(power: float = 2.0) -> dict:
    """
    Tính trọng số IDW cho từng trạm mưa dựa trên khoảng cách đến tâm lưu vực.
    w_i = 1 / d_i^power,  sau đó normalize tổng = 1.
    """
    raw = {}
    for sid, (lat, lon) in STATION_COORDS.items():
        d = _haversine_km(RESERVOIR_LAT, RESERVOIR_LON, lat, lon)
        raw[sid] = 1.0 / (d ** power)
    total = sum(raw.values())
    weights = {sid: w / total for sid, w in raw.items()}
    return weights


# Tính sẵn 1 lần khi import
IDW_WEIGHTS = compute_idw_weights(power=2.0)
print("IDW weights (p=2):")
for sid, w in IDW_WEIGHTS.items():
    d = _haversine_km(RESERVOIR_LAT, RESERVOIR_LON, *STATION_COORDS[sid])
    print(f"  {sid}: {w:.4f}  (d={d:.1f} km)")


# ══════════════════════════════════════════════════════════════════════════════
#  1. LOAD DATA
# ══════════════════════════════════════════════════════════════════════════════

def load_reservoir() -> pd.DataFrame:
    """Đọc Excel hồ, chuẩn hóa về hourly index sạch."""
    path = os.path.join(DATA_DIR, "Resoiver_Huong_Dien.xlsx")
    df = pd.read_excel(path, parse_dates=["time"])
    df = df.sort_values("time").set_index("time")

    # Giữ lại cột cần thiết
    keep = [
        "upstream_level_m", "downstream_level_m",
        "inflow_m3s", "total_outflow_m3s",
        "turbine_flow_m3s", "spillway_flow_m3s",
        "open_bottom_gates", "open_surface_gates",
        "upstream_level_diff", "inflow_diff", "outflow_diff",
    ]
    df = df[[c for c in keep if c in df.columns]].copy()

    # Fix sensor anomaly: mực nước = 0 → NaN
    df.loc[df["upstream_level_m"] == 0, "upstream_level_m"] = np.nan

    # Resample strict hourly, interpolate gap ≤ 6h
    df = df.resample("1h").mean()
    df = df.interpolate(method="linear", limit=6)

    return df


def load_rain() -> pd.DataFrame:
    """
    Đọc Excel mưa (dạng ngày × 24 cột giờ) → DataFrame hourly với 4 cột trạm.
    Tên cột: rain_rt3, rain_rt4, rain_hm, rain_mx
    """
    path = os.path.join(DATA_DIR, "Rain_RaoTrang3_RaoTrang4_HoaMy_MyXuyen.xlsx")
    df = pd.read_excel(path)
    df["Date"] = pd.to_datetime(df["Date"])

    hour_cols = [c for c in df.columns if str(c).endswith("h") and str(c)[:-1].isdigit()]
    for c in hour_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    result = {}
    for raw_name, short in STATION_MAP.items():
        sub = df[df["Station"] == raw_name].copy()
        if sub.empty:
            print(f"  WARNING: không tìm thấy trạm '{raw_name}'")
            continue
        sub = sub.set_index("Date")[hour_cols].copy()
        # Stack → Series theo datetime
        stacked = sub.stack(future_stack=True) if hasattr(sub, "stack") else sub.stack()
        dates = stacked.index.get_level_values(0)
        hours = stacked.index.get_level_values(1).str.replace("h", "", regex=False).astype(int)
        dts   = pd.to_datetime(dates) + pd.to_timedelta(hours, unit="h")
        result[f"rain_{short}"] = pd.Series(
            stacked.values.astype(np.float32), index=dts
        )

    # Combine: mỗi station là 1 Series → concat và pivot
    series_list = []
    for col_name, s in result.items():
        s = s[~s.index.duplicated(keep="first")]   # bỏ duplicate timestamps
        s.name = col_name
        series_list.append(s)

    rain_df = pd.concat(series_list, axis=1).sort_index()
    rain_df = rain_df.resample("1h").mean()
    rain_df = rain_df.fillna(0.0)
    return rain_df   # columns: rain_rt3, rain_rt4, rain_hm, rain_mx


# ══════════════════════════════════════════════════════════════════════════════
#  2. FEATURE ENGINEERING  (45 features — khớp với config.settings.n_hist_features)
# ══════════════════════════════════════════════════════════════════════════════

def build_features(df_res: pd.DataFrame, df_rain: pd.DataFrame) -> pd.DataFrame:
    """
    Merge reservoir + rain → engineer full 45-feature matrix.
    Target column 'inflow_m3s' vẫn được giữ trong DataFrame (dùng làm y).
    """
    df = df_res.join(df_rain, how="left")

    # ── Fill rain NaN (ngoài khoảng rain data) ────────────────────────────────
    rain_cols = [c for c in df.columns if c.startswith("rain_")]
    df[rain_cols] = df[rain_cols].fillna(0.0)

    # ── GROUP 1: Rain features per station (rt3 = trạm quan trọng nhất) ───────
    WINDOWS = [3, 6, 12, 24, 48, 72, 120, 168]
    for st in ["rt3", "rt4", "hm", "mx"]:
        col = f"rain_{st}"
        for w in WINDOWS:
            df[f"{col}_{w}h"] = df[col].rolling(w, min_periods=1).sum()
        df[f"{col}_max6h"]  = df[col].rolling(6,  min_periods=1).max()
        df[f"{col}_max24h"] = df[col].rolling(24, min_periods=1).max()
        df[f"{col}_std24h"] = df[col].rolling(24, min_periods=1).std().fillna(0)

    # ── GROUP 2: IDW-weighted average rain (trọng số tính từ khoảng cách Haversine)
    # rt3≈0.404, rt4≈0.413, hm≈0.104, mx≈0.079  (rt3/rt4 gần hồ ~10km, hm/mx xa ~20-23km)
    df["rain_avg"] = (
        df["rain_rt3"] * IDW_WEIGHTS["rt3"] +
        df["rain_rt4"] * IDW_WEIGHTS["rt4"] +
        df["rain_hm"]  * IDW_WEIGHTS["hm"]  +
        df["rain_mx"]  * IDW_WEIGHTS["mx"]
    )
    for w in [6, 12, 24, 48, 72, 168]:
        df[f"rain_avg_{w}h"] = df["rain_avg"].rolling(w, min_periods=1).sum()
    df["rain_avg_std24h"] = df["rain_avg"].rolling(24, min_periods=1).std().fillna(0)
    df["rain_intensity"]  = (df["rain_avg"] > 5.0).astype(np.float32)

    # ── GROUP 3: Inflow features ───────────────────────────────────────────────
    # GIỮ inflow_m3s gốc (có NaN nơi không có data thực) để dùng làm TARGET.
    # Dùng q (fillna=0) CHỈ cho feature computation (lags, rolling) — không ghi đè target.
    q = df["inflow_m3s"].fillna(0)
    df["inflow_sqrt"]   = np.sqrt(q.clip(lower=0))
    for lag in [1, 3, 6, 12, 24, 48]:
        df[f"inflow_lag_{lag}h"] = q.shift(lag).fillna(0)
    for w in [3, 6, 12, 24, 48]:
        df[f"inflow_avg_{w}h"] = q.rolling(w, min_periods=1).mean()
    df["inflow_diff1h"]  = q.diff(1).fillna(0)
    df["inflow_diff6h"]  = q.diff(6).fillna(0)
    df["is_rising"]      = (df["inflow_diff1h"] > 0).astype(np.float32)
    df["rain_flow_ratio"] = df["rain_avg"] / (q + 1.0)  # proxy soil moisture

    # ── GROUP 4: Reservoir state ───────────────────────────────────────────────
    z = df["upstream_level_m"].ffill(limit=6).fillna(df["upstream_level_m"].median())
    df["upstream_level_m"] = z
    df["level_diff_24h"]   = z.diff(24).fillna(0)
    FLOOD_LIMIT = 58.0
    df["level_to_limit"]   = (FLOOD_LIMIT - z).clip(lower=0)
    if "total_outflow_m3s" in df.columns:
        df["outflow_diff1h"] = df["total_outflow_m3s"].diff(1).fillna(0)
    if "spillway_flow_m3s" in df.columns:
        df["spillway_flow_m3s"] = df["spillway_flow_m3s"].fillna(0)
        df["is_spilling"] = (df["spillway_flow_m3s"] > 0).astype(np.float32)

    # ── GROUP 5: Temporal features (sin/cos) ──────────────────────────────────
    df["hour_sin"]  = np.sin(2 * np.pi * df.index.hour / 24)
    df["hour_cos"]  = np.cos(2 * np.pi * df.index.hour / 24)
    df["doy_sin"]   = np.sin(2 * np.pi * df.index.dayofyear / 365)
    df["doy_cos"]   = np.cos(2 * np.pi * df.index.dayofyear / 365)
    df["month_sin"] = np.sin(2 * np.pi * df.index.month / 12)
    df["month_cos"] = np.cos(2 * np.pi * df.index.month / 12)

    # Fill remaining NaN (các cột reservoir bị gap)
    res_fill = [
        "downstream_level_m", "total_outflow_m3s", "turbine_flow_m3s",
        "open_bottom_gates", "open_surface_gates",
        "upstream_level_diff", "inflow_diff", "outflow_diff",
    ]
    for c in res_fill:
        if c in df.columns:
            df[c] = df[c].ffill(limit=6).fillna(0)

    return df


def get_feature_cols(df: pd.DataFrame) -> list:
    """Trả về danh sách feature columns (loại trừ target raw)."""
    exclude = {"inflow_m3s"}   # target gốc chưa transform
    return [c for c in df.columns if c not in exclude]


# ══════════════════════════════════════════════════════════════════════════════
#  3. SLIDING WINDOW
# ══════════════════════════════════════════════════════════════════════════════

def make_windows(
    df: pd.DataFrame,
    feature_cols: list,
    lookback: int,
    horizon: int,
    stride: int = 1,
):
    """
    Tạo sliding window sequences.

    Returns:
        X  : (N, lookback, n_features)  float32
        y  : (N, horizon)               float32  [√inflow]
        ts : (N,)                       datetime64 — timestamp of prediction start
    """
    feat_vals = df[feature_cols].values.astype(np.float32)
    # Target = √inflow (variance stabilization)
    target    = np.sqrt(np.maximum(df["inflow_m3s"].values, 0.0)).astype(np.float32)
    timestamps = df.index.values

    n = len(df)
    X_list, y_list, ts_list = [], [], []

    for i in range(0, n - lookback - horizon + 1, stride):
        x_win = feat_vals[i : i + lookback]
        y_win = target[i + lookback : i + lookback + horizon]

        # Bỏ qua cửa sổ có NaN (gap quá lớn không interpolate được)
        if np.any(np.isnan(x_win)) or np.any(np.isnan(y_win)):
            continue

        X_list.append(x_win)
        y_list.append(y_win)
        ts_list.append(timestamps[i + lookback])

    if not X_list:
        return (
            np.empty((0, lookback, len(feature_cols)), dtype=np.float32),
            np.empty((0, horizon),                     dtype=np.float32),
            np.empty((0,),                             dtype="datetime64[ns]"),
        )

    return (
        np.array(X_list,  dtype=np.float32),
        np.array(y_list,  dtype=np.float32),
        np.array(ts_list),
    )


# ══════════════════════════════════════════════════════════════════════════════
#  4. SPLIT HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def seasonal_split(
    df: pd.DataFrame,
    months: set,
    train_end: str,
    val_end: str,
    test_start: str,
    test_end: str,
) -> tuple:
    """Lọc theo mùa rồi split train/val/test theo mốc ngày."""
    df_s = df[df.index.month.isin(months)].copy()

    te  = pd.Timestamp(train_end)
    ve  = pd.Timestamp(val_end)
    ts_ = pd.Timestamp(test_start)
    tex = pd.Timestamp(test_end)

    df_train = df_s[df_s.index <= te]
    df_val   = df_s[(df_s.index > te) & (df_s.index <= ve)]
    df_test  = df_s[(df_s.index >= ts_) & (df_s.index <= tex)]

    return df_train, df_val, df_test


def print_split_summary(label, df_train, df_val, df_test, total):
    print(f"\n{'─'*55}")
    print(f"  {label}")
    print(f"{'─'*55}")

    def _row(name, d):
        if len(d) == 0:
            print(f"  {name:6s}: 0 rows")
            return
        print(
            f"  {name:6s}: {len(d):5,} rows ({len(d)/total*100:5.1f}%)  "
            f"│ {d.index[0].date()} → {d.index[-1].date()}"
        )

    _row("TRAIN", df_train)
    _row("VAL",   df_val)
    _row("TEST",  df_test)
    print(f"  {'TOTAL':6s}: {total:5,} rows (season)")


# ══════════════════════════════════════════════════════════════════════════════
#  5. MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # ── Load ──────────────────────────────────────────────────────────────────
    print("═" * 55)
    print("  Hương Điền LSTM — Data Preprocessing")
    print("═" * 55)

    print("\n[1/4] Load dữ liệu hồ...")
    df_res = load_reservoir()
    print(f"  Reservoir: {df_res.index[0].date()} → {df_res.index[-1].date()}"
          f"  |  {len(df_res):,} hourly rows")

    print("\n[2/4] Load dữ liệu mưa...")
    df_rain = load_rain()
    print(f"  Rain: {df_rain.index[0].date()} → {df_rain.index[-1].date()}"
          f"  |  {len(df_rain):,} hourly rows  |  {df_rain.shape[1]} stations")

    # ── Feature engineering ───────────────────────────────────────────────────
    print("\n[3/4] Feature engineering...")
    df = build_features(df_res, df_rain)
    feat_cols = get_feature_cols(df)
    n_feat = len(feat_cols)
    print(f"  Tổng features: {n_feat}")
    print(f"  Ví dụ: {feat_cols[:4]} ... {feat_cols[-4:]}")

    # ── RAINY ─────────────────────────────────────────────────────────────────
    print("\n[4/4] Build dataset...")

    df_rt, df_rv, df_rtest = seasonal_split(
        df, RAINY_MONTHS,
        RAINY_TRAIN_END, RAINY_VAL_END,
        RAINY_TEST_START, RAINY_TEST_END,
    )
    rainy_total = len(df[df.index.month.isin(RAINY_MONTHS)])
    print_split_summary("RAINY MODEL (tháng 9,10,11,12,1)", df_rt, df_rv, df_rtest, rainy_total)

    # Fit scaler chỉ trên TRAIN
    scaler_r = StandardScaler()
    train_feat_r = df_rt[feat_cols].fillna(0).values
    scaler_r.fit(train_feat_r)

    rainy_stats = {}
    for split_name, df_split in [("train", df_rt), ("val", df_rv), ("test", df_rtest)]:
        df_sc = df_split.copy()
        df_sc[feat_cols] = scaler_r.transform(df_sc[feat_cols].fillna(0).values)
        X, y, ts = make_windows(df_sc, feat_cols, LOOKBACK, HORIZON, STRIDE)
        np.save(f"{OUT_DIR}/X_rainy_{split_name}.npy", X)
        np.save(f"{OUT_DIR}/y_rainy_{split_name}.npy", y)
        np.save(f"{OUT_DIR}/ts_rainy_{split_name}.npy", ts)
        rainy_stats[split_name] = {"windows": len(X), "shape_X": list(X.shape)}
        print(f"    rainy/{split_name}: X={X.shape}  y={y.shape}")

    with open(f"{OUT_DIR}/scaler_rainy.pkl", "wb") as f:
        pickle.dump(scaler_r, f)

    # ── DRY ───────────────────────────────────────────────────────────────────
    df_dt, df_dv, df_dtest = seasonal_split(
        df, DRY_MONTHS,
        DRY_TRAIN_END, DRY_VAL_END,
        DRY_TEST_START, DRY_TEST_END,
    )
    dry_total = len(df[df.index.month.isin(DRY_MONTHS)])
    print_split_summary("DRY MODEL (tháng 2–8)", df_dt, df_dv, df_dtest, dry_total)

    scaler_d = StandardScaler()
    scaler_d.fit(df_dt[feat_cols].fillna(0).values)

    dry_stats = {}
    for split_name, df_split in [("train", df_dt), ("val", df_dv), ("test", df_dtest)]:
        df_sc = df_split.copy()
        df_sc[feat_cols] = scaler_d.transform(df_sc[feat_cols].fillna(0).values)
        X, y, ts = make_windows(df_sc, feat_cols, LOOKBACK, HORIZON, STRIDE)
        np.save(f"{OUT_DIR}/X_dry_{split_name}.npy", X)
        np.save(f"{OUT_DIR}/y_dry_{split_name}.npy", y)
        np.save(f"{OUT_DIR}/ts_dry_{split_name}.npy", ts)
        dry_stats[split_name] = {"windows": len(X), "shape_X": list(X.shape)}
        print(f"    dry/{split_name}:   X={X.shape}  y={y.shape}")

    with open(f"{OUT_DIR}/scaler_dry.pkl", "wb") as f:
        pickle.dump(scaler_d, f)

    # ── Metadata ──────────────────────────────────────────────────────────────
    meta = {
        "lookback_h": LOOKBACK,
        "horizon_h":  HORIZON,
        "n_features": n_feat,
        "feature_names": feat_cols,
        "rainy": {
            "months": sorted(RAINY_MONTHS),
            "train_end":   RAINY_TRAIN_END,
            "val_end":     RAINY_VAL_END,
            "test_start":  RAINY_TEST_START,
            "test_end":    RAINY_TEST_END,
            "note": "Test = Trận lũ 2025 (Sep-Dec). Train nhỏ do chỉ có 2 chu kỳ lũ.",
            "splits": rainy_stats,
        },
        "dry": {
            "months": sorted(DRY_MONTHS),
            "train_end":   DRY_TRAIN_END,
            "val_end":     DRY_VAL_END,
            "test_start":  DRY_TEST_START,
            "test_end":    DRY_TEST_END,
            "note": "Split gần đạt 60/14/17. Test = Jul-Aug 2025.",
            "splits": dry_stats,
        },
    }
    with open(f"{OUT_DIR}/split_info.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    with open(f"{OUT_DIR}/feature_names.json", "w", encoding="utf-8") as f:
        json.dump(feat_cols, f, ensure_ascii=False, indent=2)

    print(f"\n{'═'*55}")
    print(f"  Hoàn tất! Files trong: {OUT_DIR}")
    print(f"  n_features = {n_feat}  |  lookback = {LOOKBACK}h  |  horizon = {HORIZON}h")
    print(f"{'═'*55}")
    print("\nBước tiếp theo:")
    print("  1. Upload thư mục kaggle_dataset/ lên Kaggle Dataset")
    print("  2. Tạo Kaggle Notebook → attach dataset vừa upload")
    print("  3. Upload kaggle/train_kaggle.py → chạy trên T4 GPU")


if __name__ == "__main__":
    main()
