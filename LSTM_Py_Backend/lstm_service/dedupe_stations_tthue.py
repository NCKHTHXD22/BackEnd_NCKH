"""Merge VNDMS station-name variants for Thua Thien Hue rainfall Excel.

Cùng 1 trạm bị VNDMS gắn 2 huyện khác nhau sau sáp nhập hành chính
(VD: "An Tây (TP Huế)" vs "An Tây (Thuận Hóa)"). Script này gộp các
variant về 1 station_id chuẩn, giữ giá trị max trên mỗi giờ (các
variant thường disjoint về thời gian nên max == giá trị thực tế).
"""
from __future__ import annotations

import os
import re
import sys
import unicodedata

import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(SCRIPT_DIR, "Rain Data", "DATA_RAIN_2022_2026", "VNDMS_Mua_Theo_Gio_TTHue_2022_2026.xlsx")
DST = os.path.join(SCRIPT_DIR, "Rain Data", "DATA_RAIN_2022_2026", "VNDMS_Mua_Theo_Gio_TTHue_2022_2026_dedup.xlsx")

HOUR_COLUMNS = [f"{i:02d}h" for i in range(24)]


def strip_district(name: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", str(name)).strip()


def fold_key(name: str) -> str:
    s = unicodedata.normalize("NFD", str(name)).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return s


def main() -> int:
    if not os.path.exists(SRC):
        print(f"[ERROR] Khong tim thay {SRC}")
        return 1

    df = pd.read_excel(SRC, sheet_name="DaNang_QuangNam")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Station"]).copy()

    df["station_base"] = df["Station"].map(strip_district)
    df["station_id"] = df["station_base"].map(fold_key)

    pick_name = (
        df.groupby("station_id")["station_base"].agg(lambda s: max(set(s), key=len)).to_dict()
    )
    pick_province = (
        df.dropna(subset=["Provinces"])
        .groupby("station_id")["Provinces"]
        .agg(lambda s: s.iloc[0] if len(s) else "")
        .to_dict()
    )

    for col in HOUR_COLUMNS:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    agg = (
        df.groupby(["station_id", "Date"], as_index=False)[HOUR_COLUMNS].max()
    )
    agg["Station"] = agg["station_id"].map(pick_name)
    agg["Provinces"] = agg["station_id"].map(pick_province).fillna("Thừa Thiên Huế")
    out = agg[["station_id", "Station", "Provinces", "Date", *HOUR_COLUMNS]].sort_values(
        ["Station", "Date"]
    ).reset_index(drop=True)

    variants = (
        df.groupby("station_id")["Station"]
        .agg(lambda s: sorted(set(s)))
        .reset_index()
        .rename(columns={"Station": "raw_variants"})
    )
    variants["canonical"] = variants["station_id"].map(pick_name)
    variants["n_variants"] = variants["raw_variants"].map(len)
    variants["raw_variants"] = variants["raw_variants"].map(lambda xs: " | ".join(xs))

    merged_count = int((variants["n_variants"] > 1).sum())

    with pd.ExcelWriter(DST, engine="openpyxl") as writer:
        out.to_excel(writer, sheet_name="DaNang_QuangNam", index=False)
        variants.sort_values("canonical").to_excel(
            writer, sheet_name="station_mapping", index=False
        )

    print(f"[OK] Raw station strings: {df['Station'].nunique()}")
    print(f"[OK] Canonical stations:  {out['station_id'].nunique()}")
    print(f"[OK] Da gop {merged_count} tram bi tach do sap nhap hanh chinh/dau chinh ta")
    print(f"[OK] Output: {DST}")
    print(f"[OK] Rows: {len(out)} (truoc khi gop: {len(df)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
