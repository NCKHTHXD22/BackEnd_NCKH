"""
Fetch NWP (Numerical Weather Prediction) data từ Open-Meteo — port từ
LSTM_Hue/data/nwp_fetcher.py, áp dụng cho tọa độ hồ chứa (config/reservoirs.py).

Lý do cần file này: features/feature_engineering.py (lstm_service, bản v1) đã
DROP temperature/relative_humidity khỏi training vì lịch sử Excel
(Data_Tung_Ho_Ma_Tran_Rong) không có 2 cột này → train/inference mismatch (chỉ
còn et0/wind_speed). Open-Meteo ERA5 archive phủ đầy đủ cả 2022–2025 cho CẢ
training (archive endpoint) lẫn inference (forecast endpoint, đã dùng sẵn ở
data_fetcher.py/fetch_meteo_history) — dùng nguồn NÀY cho cả 2 phía để hết
mismatch, thay vì tiếp tục bỏ 2 feature đó.

Hai chế độ:
  1. fetch_nwp_historical()          — 1 khoảng ngày, dùng cho range ngắn
  2. fetch_nwp_historical_chunked()  — chia theo từng năm rồi nối lại, tránh
                                        request quá lớn khi build dataset
                                        nhiều năm (2022–2025) cho archive API
  3. fetch_nwp_forecast()            — 7 ngày tới, dùng cho inference

Open-Meteo API không cần API key, free, có ERA5 back-to 1940.
"""

import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from typing import Optional

import numpy as np


OPENMETEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPENMETEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# Tên biến khớp CHÍNH XÁC với data/data_fetcher.py::fetch_meteo_history (đã chạy
# production) — Open-Meteo có 2 kiểu naming (có/không gạch dưới) tùy version API,
# dùng đúng bộ đã proven-working trong project này để tránh lệch dữ liệu.
HOURLY_VARS = [
    "precipitation",
    "temperature_2m",
    "windspeed_10m",
    "surface_pressure",
    "relativehumidity_2m",
    "et0_fao_evapotranspiration",
]


def _fetch_json(url: str, params: dict, retries: int = 3, timeout: int = 30) -> dict:
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    full_url = f"{url}?{qs}"
    last_err = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(full_url, timeout=timeout) as resp:
                return json.loads(resp.read())
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Open-Meteo request failed sau {retries} lần thử: {last_err}")


def fetch_nwp_forecast(
    lat: float,
    lon: float,
    n_hours: int = 168,
    reference_time: Optional[datetime] = None,
) -> dict:
    """
    Lấy dự báo NWP 7 ngày tới từ Open-Meteo.

    Returns:
        {
          "timestamps": [...],   # list of datetime strings
          "rain_mm":    [...],   # precipitation (mm/h)
          "temp_c":     [...],   # temperature_2m (°C)
          "wind_ms":    [...],   # wind_speed_10m (m/s)
          "pressure_hpa": [...], # surface_pressure (hPa)
          "rh_pct":     [...],   # relative_humidity_2m (%)
        }
    """
    params = {
        "latitude":        lat,
        "longitude":       lon,
        "hourly":          ",".join(HOURLY_VARS),
        "forecast_days":   7,
        "wind_speed_unit": "ms",
        "timezone":        "Asia/Bangkok",
    }
    data = _fetch_json(OPENMETEO_FORECAST_URL, params)
    hourly = data["hourly"]

    times = hourly["time"][:n_hours]
    result = {
        "timestamps":   times,
        "rain_mm":      [float(v or 0) for v in hourly["precipitation"][:n_hours]],
        "temp_c":       [float(v or 25) for v in hourly["temperature_2m"][:n_hours]],
        "wind_ms":      [float(v or 0) for v in hourly["windspeed_10m"][:n_hours]],
        "pressure_hpa": [float(v or 1013) for v in hourly["surface_pressure"][:n_hours]],
        "rh_pct":       [float(v or 80) for v in hourly["relativehumidity_2m"][:n_hours]],
        "et0_mm":       [float(v or 0) for v in hourly["et0_fao_evapotranspiration"][:n_hours]],
    }
    return result


def fetch_nwp_historical(
    lat: float,
    lon: float,
    start_date: str,  # "YYYY-MM-DD"
    end_date: str,
) -> dict:
    """
    Lấy ERA5-Land historical weather từ Open-Meteo Archive cho 1 khoảng ngày.
    Dùng để xây dựng training dataset. Với range dài (nhiều năm), ưu tiên dùng
    fetch_nwp_historical_chunked() bên dưới để tránh request quá lớn.

    Returns: same format as fetch_nwp_forecast
    """
    params = {
        "latitude":  lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date":   end_date,
        "hourly":    ",".join(HOURLY_VARS),
        "wind_speed_unit": "ms",
        "timezone":  "Asia/Bangkok",
    }
    data = _fetch_json(OPENMETEO_ARCHIVE_URL, params)
    hourly = data["hourly"]

    result = {
        "timestamps":   hourly["time"],
        "rain_mm":      [float(v or 0) for v in hourly["precipitation"]],
        "temp_c":       [float(v or 25) for v in hourly["temperature_2m"]],
        "wind_ms":      [float(v or 0) for v in hourly["windspeed_10m"]],
        "pressure_hpa": [float(v or 1013) for v in hourly["surface_pressure"]],
        "rh_pct":       [float(v or 80) for v in hourly["relativehumidity_2m"]],
        "et0_mm":       [float(v or 0) for v in hourly["et0_fao_evapotranspiration"]],
    }
    return result


def fetch_nwp_historical_chunked(
    lat: float,
    lon: float,
    start_date: str,  # "YYYY-MM-DD"
    end_date: str,
    chunk_days: int = 365,
) -> dict:
    """
    Như fetch_nwp_historical() nhưng chia nhỏ theo chunk_days (mặc định 1 năm)
    rồi nối lại — tránh timeout/giới hạn kích thước response khi build dataset
    nhiều năm (vd 2022-01-01 → 2025-12-31 cho 16 hồ).
    """
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt   = datetime.strptime(end_date, "%Y-%m-%d")

    merged = {"timestamps": [], "rain_mm": [], "temp_c": [], "wind_ms": [],
              "pressure_hpa": [], "rh_pct": [], "et0_mm": []}

    cur = start_dt
    while cur <= end_dt:
        chunk_end = min(cur + timedelta(days=chunk_days - 1), end_dt)
        print(f"    NWP archive: {cur.date()} -> {chunk_end.date()}")
        part = fetch_nwp_historical(
            lat, lon, cur.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")
        )
        for k in merged:
            merged[k].extend(part[k])
        cur = chunk_end + timedelta(days=1)

    return merged


def nwp_to_arrays(nwp_data: dict) -> tuple:
    """Chuyển dict → numpy arrays. Returns: (rain, temp, wind, pressure, rh, et0)."""
    return (
        np.array(nwp_data["rain_mm"],      dtype=np.float32),
        np.array(nwp_data["temp_c"],       dtype=np.float32),
        np.array(nwp_data["wind_ms"],      dtype=np.float32),
        np.array(nwp_data["pressure_hpa"], dtype=np.float32),
        np.array(nwp_data["rh_pct"],       dtype=np.float32),
        np.array(nwp_data["et0_mm"],       dtype=np.float32),
    )
