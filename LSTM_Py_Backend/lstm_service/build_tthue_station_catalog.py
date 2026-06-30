"""Build station catalog (name, station_id, lat, lon, province, ward) for TT-Hue
from the raw VNDMS rain JSON files.
"""
from __future__ import annotations

import glob
import json
import os
import re
import unicodedata

import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_GLOB = os.path.join(SCRIPT_DIR, "Rain Data", "_raw_vndms_pctt", "rain-hourly_*.json")
OUT_CSV = os.path.join(SCRIPT_DIR, "Rain Data", "_raw_vndms_pctt", "tthue_station_catalog.csv")
OUT_JSON = os.path.join(SCRIPT_DIR, "Rain Data", "_raw_vndms_pctt", "tthue_station_catalog.json")


def strip_district(name: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", str(name)).strip()


def fold_key(name: str) -> str:
    s = unicodedata.normalize("NFD", str(name)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def main() -> int:
    files = sorted(glob.glob(RAW_GLOB))
    files = [f for f in files if "2022_2026" not in os.path.basename(f)]
    print(f"Reading {len(files)} raw rain JSONs ...")

    rows = []
    for fpath in files:
        try:
            with open(fpath, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            print(f"  WARN {fpath}: {exc}")
            continue
        records = data.get("data", []) if isinstance(data, dict) else []
        for r in records:
            if not isinstance(r, dict):
                continue
            name = r.get("station_name") or r.get("name") or r.get("name_vn")
            lat = r.get("lat")
            lon = r.get("lon")
            if name is None or lat in (None, "") or lon in (None, ""):
                continue
            try:
                latf = float(lat)
                lonf = float(lon)
            except ValueError:
                continue
            rows.append(
                {
                    "station_name": name,
                    "station_id": r.get("station_id"),
                    "lat": latf,
                    "lon": lonf,
                    "province": r.get("tinh") or "",
                    "ward": r.get("phuongxa") or "",
                    "district": r.get("quanhuyen") or "",
                    "source": r.get("source_name") or "",
                }
            )

    if not rows:
        print("[ERROR] No station rows found in raw JSONs")
        return 1

    df = pd.DataFrame(rows)
    df["station_base"] = df["station_name"].map(strip_district)
    df["station_id_key"] = df["station_base"].map(fold_key)

    agg = (
        df.groupby("station_id_key", as_index=False)
        .agg(
            station_name=("station_base", lambda s: max(set(s), key=len)),
            station_id=("station_id", lambda s: next((x for x in s if pd.notna(x)), None)),
            lat=("lat", "median"),
            lon=("lon", "median"),
            province=("province", lambda s: next((x for x in s if x), "")),
            ward=("ward", lambda s: next((x for x in s if x), "")),
            district=("district", lambda s: next((x for x in s if x), "")),
            source=("source", lambda s: next((x for x in s if x), "")),
        )
        .sort_values("station_name")
        .reset_index(drop=True)
    )

    agg = agg[(agg["lat"] > 15.8) & (agg["lat"] < 17.2) & (agg["lon"] > 106.8) & (agg["lon"] < 108.5)]

    agg.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")
    agg.to_json(OUT_JSON, orient="records", force_ascii=False, indent=2)

    print(f"[OK] {len(agg)} canonical stations in TT-Hue")
    print(f"[OK] CSV  : {OUT_CSV}")
    print(f"[OK] JSON : {OUT_JSON}")
    print()
    print("Sample:")
    print(agg.head(10).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
