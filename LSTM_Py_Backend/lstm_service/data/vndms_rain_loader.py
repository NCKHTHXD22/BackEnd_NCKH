# data/vndms_rain_loader.py
# Load dữ liệu mưa theo giờ từ các file Excel VNDMS đã export
import os
import pandas as pd
import numpy as np
from config.rain_stations import RAIN_STATIONS


def _find_station_rows(df: pd.DataFrame, station_key: str) -> pd.DataFrame:
    """Tìm hàng dữ liệu thuộc về một trạm đo bằng keyword matching."""
    keywords = RAIN_STATIONS[station_key]["vndms_name_keywords"]
    # Long-format df uses lowercase 'station' column
    col = "station" if "station" in df.columns else "Station"
    mask = pd.Series(False, index=df.index)
    for kw in keywords:
        mask |= df[col].fillna("").str.contains(kw, case=False, regex=False)
    return df[mask]



import glob

def _parse_vndms_excel(filepath: str) -> pd.DataFrame:
    try:
        df = pd.read_excel(filepath, sheet_name="DaNang_QuangNam")
    except Exception as e:
        print(f"  ⚠ Không đọc được {filepath}: {e}")
        return pd.DataFrame()

    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date"])

    hour_cols = [f"{i:02d}h" for i in range(24)]
    available = [c for c in hour_cols if c in df.columns]

    # Fast melt implementation
    melted = df.melt(id_vars=["Station", "Date"], value_vars=available, var_name="hour", value_name="rain")
    melted["rain"] = pd.to_numeric(melted["rain"], errors="coerce").fillna(0.0)
    
    melted["hour_int"] = melted["hour"].str.replace("h", "").astype(int)
    melted["time"] = melted["Date"] + pd.to_timedelta(melted["hour_int"], unit="h")
    
    result = pd.DataFrame({
        "station": melted["Station"],
        "time": melted["time"],
        "rain": melted["rain"]
    })
    return result


def load_all_vndms(data_dir: str = ".") -> pd.DataFrame:
    all_dfs = []
    
    # CHỈ TÌM CÁC FILE VNDMS MỚI
    search_pattern = os.path.join(data_dir, "VNDMS_Mua_Theo_Gio_*.xlsx")
    files = glob.glob(search_pattern)
    
    # Debug
    print(f"  🔎 Found {len(files)} VNDMS raw files in {data_dir}")
        
    for path in files:
        if "~$" in path: continue
        print(f"  📂 Đang load {path}...")
        df = _parse_vndms_excel(path)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        print("  ❌ Không tìm thấy file VNDMS nào!")
        return pd.DataFrame()

    combined = pd.concat(all_dfs, ignore_index=True)
    combined = combined.sort_values(["station", "time"]).drop_duplicates(
        subset=["station", "time"]
    )
    return combined


def get_station_timeseries(
    all_vndms: pd.DataFrame, station_key: str
) -> pd.DataFrame:
    """
    Trả về chuỗi thời gian (time, rain) cho một trạm đo cụ thể.
    Tổng hợp theo giờ nếu có nhiều rows cùng thời điểm (từ nhiều sheet).
    """
    rows = _find_station_rows(all_vndms, station_key)
    if rows.empty:
        return pd.DataFrame(columns=["time", "rain"])

    ts = rows.groupby("time")["rain"].mean().reset_index()
    ts = ts.rename(columns={"time": "time"})
    ts = ts.sort_values("time").reset_index(drop=True)
    return ts


def get_station_display_name(all_vndms: pd.DataFrame, station_key: str) -> str:
    """Trả về tên hiển thị thực tế nhất (có độ dài lớn nhất) tìm thấy trong dữ liệu."""
    rows = _find_station_rows(all_vndms, station_key)
    if rows.empty:
        return station_key
    # Lấy tên dài nhất (thường là tên chi tiết nhất)
    all_names = rows["station"].unique()
    best_name = max(all_names, key=len)
    return best_name
