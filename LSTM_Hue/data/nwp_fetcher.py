"""
Fetch NWP (Numerical Weather Prediction) data từ Open-Meteo.

Hai chế độ:
  1. Historical archive (ERA5-Land) — cho training
  2. 7-day forecast — cho inference

Open-Meteo API không cần API key, free, có ERA5 back-to 1940.
Tọa độ: lat/lon của từng hồ (interpolation tự động phía server).

Tham khảo: Google FloodHub dùng ECMWF/GFS; ta dùng Open-Meteo (accessible hơn).
"""

import json
import urllib.request
from datetime import datetime, timedelta
from typing import Optional

import numpy as np


OPENMETEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPENMETEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

HOURLY_VARS = [
    "precipitation",
    "temperature_2m",
    "wind_speed_10m",
    "surface_pressure",
    "relative_humidity_2m",
]


def _fetch_json(url: str, params: dict) -> dict:
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    full_url = f"{url}?{qs}"
    with urllib.request.urlopen(full_url, timeout=30) as resp:
        return json.loads(resp.read())


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
        "wind_ms":      [float(v or 0) for v in hourly["wind_speed_10m"][:n_hours]],
        "pressure_hpa": [float(v or 1013) for v in hourly["surface_pressure"][:n_hours]],
        "rh_pct":       [float(v or 80) for v in hourly["relative_humidity_2m"][:n_hours]],
    }
    return result


def fetch_nwp_historical(
    lat: float,
    lon: float,
    start_date: str,  # "YYYY-MM-DD"
    end_date: str,
) -> dict:
    """
    Lấy ERA5-Land historical weather từ Open-Meteo Archive.
    Dùng để xây dựng training dataset.

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
    T = len(hourly["time"])

    result = {
        "timestamps":   hourly["time"],
        "rain_mm":      [float(v or 0) for v in hourly["precipitation"]],
        "temp_c":       [float(v or 25) for v in hourly["temperature_2m"]],
        "wind_ms":      [float(v or 0) for v in hourly["wind_speed_10m"]],
        "pressure_hpa": [float(v or 1013) for v in hourly["surface_pressure"]],
        "rh_pct":       [float(v or 80) for v in hourly["relative_humidity_2m"]],
    }
    return result


def nwp_to_arrays(nwp_data: dict) -> tuple:
    """Chuyển dict → numpy arrays. Returns: (rain, temp, wind, pressure, rh)."""
    return (
        np.array(nwp_data["rain_mm"],      dtype=np.float32),
        np.array(nwp_data["temp_c"],       dtype=np.float32),
        np.array(nwp_data["wind_ms"],      dtype=np.float32),
        np.array(nwp_data["pressure_hpa"], dtype=np.float32),
        np.array(nwp_data["rh_pct"],       dtype=np.float32),
    )
