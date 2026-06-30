"""Build ARIMAX-ready dataset for Ho Huong Dien.

Output: 1 CSV with columns [time, qvao, rain_lake] @ hourly resolution.
- qvao  : inflow_m3s from VNDMS hydropower Excel (already hourly)
- rain_lake : IDW-weighted rainfall at lake centroid from N nearest stations,
              using TT-Hue + neighbouring rain catalog (lat/lon).
"""
from __future__ import annotations

import math
import os
import re
import unicodedata

import numpy as np
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

HYDRO_XLSX = os.path.join(
    SCRIPT_DIR, "Rain Data", "DATA_HYDROPOWER_2022_2026", "VNDMS_Thuy_Dien_TTHue_2022_2026.xlsx"
)
RAIN_XLSX = os.path.join(
    SCRIPT_DIR, "Rain Data", "DATA_RAIN_2022_2026", "VNDMS_Mua_Theo_Gio_TTHue_2022_2026_dedup.xlsx"
)
CATALOG_CSV = os.path.join(
    SCRIPT_DIR, "Rain Data", "_raw_vndms_pctt", "tthue_station_catalog.csv"
)
OUT_CSV = os.path.join(
    SCRIPT_DIR, "Rain Data", "DATA_HYDROPOWER_2022_2026", "HuongDien_Arimax_Dataset.csv"
)

LAKE_LAT = 16.46
LAKE_LON = 107.423456
MAX_STATIONS = 8
IDW_POWER = 2.0
MAX_DIST_KM = 80.0
HOUR_COLUMNS = [f"{i:02d}h" for i in range(24)]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fold_key(name: str) -> str:
    s = unicodedata.normalize("NFD", str(name)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def strip_district(name: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", str(name)).strip()


def load_hourly_rain_long() -> pd.DataFrame:
    df = pd.read_excel(RAIN_XLSX, sheet_name="DaNang_QuangNam")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Station"]).copy()
    for c in HOUR_COLUMNS:
        if c not in df.columns:
            df[c] = 0.0
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    if "station_id" not in df.columns:
        df["station_id"] = df["Station"].map(strip_district).map(fold_key)

    melted = df.melt(
        id_vars=["station_id", "Station", "Date"],
        value_vars=HOUR_COLUMNS,
        var_name="hour",
        value_name="rain",
    )
    melted["hour"] = melted["hour"].str[:2].astype(int)
    melted["time"] = melted["Date"] + pd.to_timedelta(melted["hour"], unit="h")
    return melted[["station_id", "time", "rain"]]


def load_catalog() -> pd.DataFrame:
    cat = pd.read_csv(CATALOG_CSV)
    cat = cat[(cat["lat"].notna()) & (cat["lon"].notna())].copy()
    cat["dist_km"] = cat.apply(
        lambda r: haversine_km(LAKE_LAT, LAKE_LON, r["lat"], r["lon"]), axis=1
    )
    cat = cat.sort_values("dist_km").reset_index(drop=True)
    return cat


def pick_idw_stations(cat: pd.DataFrame) -> pd.DataFrame:
    near = cat[cat["dist_km"] <= MAX_DIST_KM].head(MAX_STATIONS).copy()
    near["weight"] = 1.0 / np.power(near["dist_km"].clip(lower=0.5), IDW_POWER)
    near["weight"] /= near["weight"].sum()
    return near


def main() -> int:
    hydro = pd.read_excel(HYDRO_XLSX, sheet_name="reservoir_observations")
    hydro = hydro[hydro["reservoir"] == "Hương Điền"].copy()
    hydro["time"] = pd.to_datetime(hydro["time"], errors="coerce")
    hydro = hydro.dropna(subset=["time"]).drop_duplicates(subset=["time"])
    hydro = hydro.set_index("time")[["inflow_m3s"]].rename(columns={"inflow_m3s": "qvao"})

    full_range = pd.date_range(hydro.index.min().floor("h"), hydro.index.max().ceil("h"), freq="h")
    hydro = hydro.reindex(full_range).interpolate(method="time", limit=6).rename_axis("time").reset_index()
    print(f"[OK] Flow:  {len(hydro)} hourly rows, {hydro['qvao'].notna().sum()} valid (after interp)")

    rain_long = load_hourly_rain_long()
    catalog = load_catalog()
    idw_stations = pick_idw_stations(catalog)
    print(f"[OK] IDW stations selected ({len(idw_stations)}):")
    for _, r in idw_stations.iterrows():
        print(f"  - {r['station_name']:<30s}  {r['dist_km']:6.1f} km  w={r['weight']:.3f}")

    idw_stations["station_id_key"] = idw_stations["station_id_key"].astype(str)
    rain_long["station_id"] = rain_long["station_id"].astype(str)

    sel = rain_long[rain_long["station_id"].isin(idw_stations["station_id_key"])].copy()
    weight_map = dict(zip(idw_stations["station_id_key"], idw_stations["weight"]))
    sel["w"] = sel["station_id"].map(weight_map)
    sel["wr"] = sel["w"] * sel["rain"]

    rain_lake = (
        sel.groupby("time", as_index=False)
        .agg(rain_lake=("wr", "sum"), n_stations=("station_id", "nunique"))
    )
    print(f"[OK] Rain-lake series: {len(rain_lake)} rows (multi-station coverage)")

    df = hydro.merge(rain_lake, on="time", how="left")
    df["rain_lake"] = df["rain_lake"].fillna(0.0)
    df["n_stations"] = df["n_stations"].fillna(0).astype(int)

    df = df[["time", "qvao", "rain_lake", "n_stations"]]
    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    df.to_csv(OUT_CSV, index=False)
    print(f"[OK] Output: {OUT_CSV}")
    print(f"[OK] Time range: {df['time'].min()} -> {df['time'].max()}")
    print(df.describe(percentiles=[0.5, 0.95, 0.99]).to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
