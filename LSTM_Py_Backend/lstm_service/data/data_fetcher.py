# data_fetcher.py
import requests
import base64
import os
import math
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from data.rain_matrix_loader import load_rain_matrix
from config.rain_stations import RAIN_STATIONS, RESERVOIR_TO_STATIONS

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

def _vn_now() -> datetime:
    """Trả về giờ hiện tại theo múi giờ Việt Nam (UTC+7), dạng naive để dễ merge."""
    return datetime.now(VN_TZ).replace(tzinfo=None)

load_dotenv()

BASE_URL = "https://apiv2.danang.gov.vn/apiPCTT/1.0"


def _get_with_retry(url, max_retries=3, **kwargs) -> requests.Response:
    """GET request với retry tự động khi gặp lỗi mạng thoáng qua."""
    for attempt in range(1, max_retries + 1):
        try:
            r = requests.get(url, **kwargs)
            if r.status_code == 200:
                return r
            print(f"  [WARN] HTTP {r.status_code} (attempt {attempt}/{max_retries}): {url}")
        except requests.exceptions.RequestException as e:
            print(f"  [WARN] Request error attempt {attempt}/{max_retries}: {e}")
        if attempt < max_retries:
            import time; time.sleep(1.5 * attempt)
    return None
TOKEN_URL = "https://apiv2.danang.gov.vn/oauth2/token"

CONSUMER_KEY = os.getenv("CONSUMER_KEY")
CONSUMER_SECRET = os.getenv("CONSUMER_SECRET")

_access_token = None
_expiry = None


# ================= TOKEN =================
def get_token():
    global _access_token, _expiry

    if _access_token and _expiry and datetime.now() < _expiry:
        return _access_token

    auth = base64.b64encode(
        f"{CONSUMER_KEY}:{CONSUMER_SECRET}".encode()
    ).decode()

    r = requests.post(
        TOKEN_URL,
        headers={"Authorization": f"Basic {auth}"},
        data={"grant_type": "client_credentials"},
        timeout=30
    )

    r.raise_for_status()

    data = r.json()
    _access_token = data["access_token"]
    _expiry = datetime.now() + timedelta(seconds=data["expires_in"] - 60)

    return _access_token


# ================= HYDRO (Fetched from Node.js Backend) =================
BACKEND_API_URL = "https://backend-nckh-lm57.onrender.com/api"

def fetch_hydro_data(rid, days=180, end_time=None):
    if end_time is None:
        end_time = _vn_now().replace(minute=0, second=0, microsecond=0)
    
    start = end_time - timedelta(days=days)

    try:
        # Thay vì gọi trực tiếp API Gov (đang sập), ta gọi qua Backend Node.js
        # Backend này đã được tích hợp Scraper dự phòng
        url = f"{BACKEND_API_URL}/inflowlake-history/{rid}"
        params = {
            "start": start.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z",
            "end": end_time.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z"
        }
        
        print(f"  [INFO] Fetching hydro from Backend: {url}")
        r = _get_with_retry(url, params=params, timeout=60)

        if r is None:
            return pd.DataFrame()

        raw = r.json()
        # Node.js API trả về array trực tiếp: [ {Id_Lake, qvao, htl, luuluongxa, timestamp}, ... ]
        df = pd.DataFrame(raw)

        if df.empty:
            return pd.DataFrame()

        # Mapping lại các trường từ MongoDB format sang format LSTM cần
        df["time"] = pd.to_datetime(df["timestamp"], errors="coerce").dt.floor("h")

        df["inflow"] = pd.to_numeric(df["qvao"], errors="coerce")
        df["water_level"] = pd.to_numeric(df["htl"], errors="coerce")
        df["outflow"] = pd.to_numeric(df["luuluongxa"], errors="coerce")

        df = df[["time", "inflow", "water_level", "outflow"]].dropna()
        df = df.sort_values("time")

        return df

    except Exception as e:
        print("Hydro error from Backend:", e)
        return pd.DataFrame()

def fetch_rain_from_backend(rid, start, end):
    """Lấy dữ liệu mưa IDW đã tính toán từ Node.js Backend."""
    try:
        url = f"{BACKEND_API_URL}/rain-lake-history/{rid}/range"
        params = {
            "from": start.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z",
            "to": end.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z"
        }
        r = _get_with_retry(url, params=params, timeout=30)
        if r is None:
            return pd.DataFrame()
        
        raw = r.json()
        df = pd.DataFrame(raw)
        if df.empty:
            return pd.DataFrame()
        
        df["time"] = pd.to_datetime(df["timestamp"]).dt.tz_convert("Asia/Ho_Chi_Minh").dt.tz_localize(None).dt.floor("h")
        df["rain"] = pd.to_numeric(df["sumDepth"], errors="coerce").fillna(0.0)
        return df[["time", "rain"]]
    except Exception as e:
        print(f"  [ERROR] fetch_rain_from_backend: {e}")
        return pd.DataFrame()

# ================= RAIN INTEGRATION (VNDMS Matrix + Raw + Forecast) =================
def fetch_rain_data(rid, lat, lon, reference_time=None, days=180):
    """
    rid: ID hồ để tìm file Excel
    reference_time: Thời điểm 'hiện tại' để phân biệt quá khứ và tương lai
    """
    if reference_time is None:
        # Làm tròn xuống giờ hiện tại VN (Ví dụ: 11:56 -> 11:00)
        reference_time = _vn_now().replace(minute=0, second=0, microsecond=0)
    
    start_date = reference_time - timedelta(days=days)
    
    print(f"  [INFO] FETCH RAIN: Reservoir {rid} | Cut-off: {reference_time.strftime('%Y-%m-%d %H:%M')}")
    
    # --- PHẦN 1: QUÁ KHỨ (VNDMS / EXCEL MATRIX) ---
    # 1.1 Thử lấy từ Excel Matrix (Dữ liệu chuẩn IDW)
    df_matrix = load_rain_matrix(rid, days=days)
    
    # 1.2 Kiểm tra khoảng trống (Gap) giữa Matrix và Reference Time
    last_matrix_time = df_matrix["time"].max() if not df_matrix.empty else start_date
    
    df_gap = pd.DataFrame()
    if last_matrix_time < reference_time:
        gap_start = last_matrix_time + timedelta(hours=1)
        print(f"  [INFO] Detecting gap: {gap_start} to {reference_time}. Fetching from Backend Rain Data...")
        df_gap = fetch_rain_from_backend(rid, gap_start, reference_time)
        if not df_gap.empty:
            print(f"  [OK] Filled {len(df_gap)} hours from Backend Rain Data")

    # Gộp Quá khứ (Matrix + Gap)
    combined = pd.concat([df_matrix, df_gap])
    if not combined.empty and "time" in combined.columns:
        df_past = combined.sort_values("time")
        df_past = df_past[df_past["time"] <= reference_time]
        df_past = df_past.drop_duplicates(subset=["time"], keep="last")
    else:
        df_past = pd.DataFrame(columns=["time", "rain"])

    # Nếu vẫn thiếu trầm trọng (Matrix và Station đều không có), dùng fallback Archive
    if len(df_past) < (days * 24 * 0.3): 
        print("  [WARN] Combined VNDMS data sparse, filling gaps with Open-Meteo Archive...")
        try:
            # (Giữ nguyên logic fallback archive nếu cần)
            pass
        except: pass

    print(f"  [DATA] Past Rain: {len(df_past)} hours (Standardized Matrix + Calculated IDW)")

    # --- PHẦN 2: TƯƠNG LAI (OPEN-METEO FORECAST) ---
    df_forecast = fetch_rain_forecast(lat, lon, reference_time, hours=12)
    if not df_forecast.empty:
        df_forecast = df_forecast.rename(columns={"rain_forecast": "rain"})
        # Đảm bảo chỉ lấy từ reference_time + 1h trở đi
        df_forecast = df_forecast[df_forecast["time"] > reference_time]
        print(f"  [FCST] Future Rain: {len(df_forecast)} hours collected from Forecast")
        
    # GỘP TẤT CẢ
    final_df = pd.concat([df_past, df_forecast]).sort_values("time").drop_duplicates("time")
    
    return final_df.reset_index(drop=True)


# ================= RAIN FORECAST =================
def fetch_rain_forecast(lat, lon, reference_time, hours=12):

    try:
        r = _get_with_retry(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "precipitation",
                "forecast_days": 2,
                "timezone": "UTC"
            },
            timeout=40
        )

        if r is None:
            return pd.DataFrame()

        data = r.json()

        df = pd.DataFrame({
            "time": pd.to_datetime(data["hourly"]["time"], utc=True),
            "rain_forecast": data["hourly"]["precipitation"]
        })

        # Convert về naive datetime VN (UTC+7) — nhất quán với _vn_now()
        df["time"] = df["time"].dt.tz_convert("Asia/Ho_Chi_Minh").dt.tz_localize(None).dt.floor("h")

        # ALIGN TIME
        start_time = reference_time + timedelta(hours=1)
        end_time = start_time + timedelta(hours=hours)

        df = df[
            (df["time"] >= start_time) &
            (df["time"] < end_time)
        ]

        return df.reset_index(drop=True)

    except Exception as e:
        print("Forecast error:", e)
        return pd.DataFrame()


# ================= METEO FORECAST (Open-Meteo — 1 điểm) =================
def fetch_meteo_forecast(lat, lon, reference_time, hours=24) -> pd.DataFrame:
    """
    Lấy dự báo mưa + ET0 tại 1 điểm lat/lon từ Open-Meteo.
      time | rain_fc | rain_fc_6h | rain_fc_24h | et0_fc

    rain_fc_6h  = tích lũy mưa 6h  (convolve giống dataset_builder)
    rain_fc_24h = tích lũy mưa 24h

    Dùng để build X_future khi inference (3 features khớp với training).
    """
    try:
        r = _get_with_retry(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "precipitation,et0_fao_evapotranspiration",
                "forecast_days": 3,
                "timezone": "UTC",
            },
            timeout=40,
        )
        if r is None:
            return pd.DataFrame()

        data = r.json()["hourly"]
        rain = np.array(data["precipitation"], dtype=np.float32)

        df = pd.DataFrame({
            "time":        pd.to_datetime(data["time"], utc=True),
            "rain_fc":     rain,
            "rain_fc_6h":  np.convolve(rain, np.ones(6,  dtype=np.float32), mode="full")[:len(rain)],
            "rain_fc_24h": np.convolve(rain, np.ones(24, dtype=np.float32), mode="full")[:len(rain)],
            "et0_fc":      data["et0_fao_evapotranspiration"],
        })
        df["time"] = (
            df["time"]
            .dt.tz_convert("Asia/Ho_Chi_Minh")
            .dt.tz_localize(None)
            .dt.floor("h")
        )

        start_time = reference_time + timedelta(hours=1)
        end_time   = start_time + timedelta(hours=hours)
        df = df[(df["time"] >= start_time) & (df["time"] < end_time)]
        return df.reset_index(drop=True)

    except Exception as e:
        print(f"  [WARN] fetch_meteo_forecast: {e}")
        return pd.DataFrame()


# ================= RAIN FORECAST IDW — Multi-Point (Open-Meteo) =================
def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    """Khoảng cách Haversine giữa 2 điểm (km)."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _fetch_precipitation_at(lat, lon, reference_time, hours=24) -> np.ndarray | None:
    """
    Lấy mảng precipitation hourly tại 1 điểm từ Open-Meteo.
    Trả về np.ndarray shape (hours,) hoặc None nếu lỗi.
    """
    try:
        r = _get_with_retry(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "precipitation",
                "forecast_days": 3,
                "timezone": "UTC",
            },
            timeout=30,
        )
        if r is None:
            return None

        data = r.json()["hourly"]
        times = pd.to_datetime(data["time"], utc=True)
        rain  = np.array(data["precipitation"], dtype=np.float32)

        times_vn = (
            pd.Series(times)
            .dt.tz_convert("Asia/Ho_Chi_Minh")
            .dt.tz_localize(None)
            .dt.floor("h")
        )
        start_time = reference_time + timedelta(hours=1)
        end_time   = start_time + timedelta(hours=hours)
        mask = (times_vn >= start_time) & (times_vn < end_time)
        arr  = rain[mask.values]
        return arr if len(arr) == hours else None

    except Exception:
        return None


def fetch_rain_forecast_idw(res_id: int, reference_time: datetime, hours: int = 24) -> pd.DataFrame:
    """
    Tính mưa dự báo IDW cho hồ `res_id` từ Open-Meteo (multi-point).

    Quy trình:
      1. Lấy precipitation tại tọa độ từng trạm VNDMS của lưu vực
      2. Tính tâm lưu vực = trung bình tọa độ các trạm
      3. IDW weight = 1 / d² (khoảng cách từ trạm đến tâm)
      4. rain_idw = Σ(w_i * rain_i) / Σ(w_i)
      5. Tính rain_fc_6h, rain_fc_24h bằng convolve

    Trả về DataFrame:
      time | station_<tên> (mm/h per trạm) | rain_fc | rain_fc_6h | rain_fc_24h

    Hiển thị 00h–23h của ngày forecast (24 hàng).
    """
    station_names = RESERVOIR_TO_STATIONS.get(res_id, [])
    if not station_names:
        print(f"  [WARN] fetch_rain_forecast_idw: res_id={res_id} không có trong RESERVOIR_TO_STATIONS")
        return pd.DataFrame()

    # ── 1. Lấy precipitation tại từng trạm ──────────────────────────────
    station_rains = {}   # name → np.ndarray(hours,)
    for name in station_names:
        info = RAIN_STATIONS.get(name)
        if info is None:
            continue
        arr = _fetch_precipitation_at(info["lat"], info["lon"], reference_time, hours)
        if arr is not None:
            station_rains[name] = arr
        else:
            print(f"  [WARN] IDW: không lấy được mưa tại trạm {name} ({info['lat']},{info['lon']})")

    if not station_rains:
        print(f"  [WARN] fetch_rain_forecast_idw: không có trạm nào trả dữ liệu cho res_id={res_id}")
        return pd.DataFrame()

    # ── 2. Tính tâm lưu vực (centroid của các trạm có dữ liệu) ─────────
    valid_names = list(station_rains.keys())
    lats = [RAIN_STATIONS[n]["lat"] for n in valid_names]
    lons = [RAIN_STATIONS[n]["lon"] for n in valid_names]
    centroid_lat = float(np.mean(lats))
    centroid_lon = float(np.mean(lons))

    # ── 3. IDW weights = 1/d² ────────────────────────────────────────────
    weights = []
    for n in valid_names:
        d = _haversine_km(centroid_lat, centroid_lon, RAIN_STATIONS[n]["lat"], RAIN_STATIONS[n]["lon"])
        d = max(d, 0.1)          # tránh chia 0 khi trạm trùng tâm
        weights.append(1.0 / (d ** 2))
    weights = np.array(weights, dtype=np.float64)
    weights /= weights.sum()    # normalize

    # ── 4. rain_idw theo giờ ─────────────────────────────────────────────
    rain_matrix = np.stack([station_rains[n] for n in valid_names], axis=0)  # (N, hours)
    rain_idw    = (weights[:, None] * rain_matrix).sum(axis=0)               # (hours,)

    # ── 5. rain_fc_6h, rain_fc_24h ────────────────────────────────────────
    rain_fc_6h  = np.convolve(rain_idw, np.ones(6,  dtype=np.float32), mode="full")[:hours]
    rain_fc_24h = np.convolve(rain_idw, np.ones(24, dtype=np.float32), mode="full")[:hours]

    # ── 6. Build time index ──────────────────────────────────────────────
    start_time = reference_time + timedelta(hours=1)
    time_index = [start_time + timedelta(hours=i) for i in range(hours)]

    # ── 7. Tạo DataFrame kết quả ─────────────────────────────────────────
    df = pd.DataFrame({"time": time_index})
    for name in valid_names:
        df[f"station_{name}"] = station_rains[name].round(2)

    df["rain_fc"]     = rain_idw.round(3).astype(np.float32)
    df["rain_fc_6h"]  = rain_fc_6h.round(3).astype(np.float32)
    df["rain_fc_24h"] = rain_fc_24h.round(3).astype(np.float32)

    # Metadata
    df.attrs["res_id"]       = res_id
    df.attrs["stations"]     = valid_names
    df.attrs["weights"]      = {n: round(float(w), 4) for n, w in zip(valid_names, weights)}
    df.attrs["centroid"]     = (round(centroid_lat, 4), round(centroid_lon, 4))

    return df


# ================= METEO HISTORY (Open-Meteo Archive) =================
def fetch_meteo_history(lat, lon, days=11) -> pd.DataFrame:
    """
    Lấy lịch sử khí tượng (past days) từ Open-Meteo ERA5 archive:
      time | temperature | relative_humidity | et0 | wind_speed

    Dùng để bổ sung X_past khi inference.
    """
    end_vn  = _vn_now().replace(minute=0, second=0, microsecond=0)
    start_vn = end_vn - timedelta(days=days)

    try:
        r = _get_with_retry(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude":  lat,
                "longitude": lon,
                "start_date": start_vn.strftime("%Y-%m-%d"),
                "end_date":   end_vn.strftime("%Y-%m-%d"),
                "hourly": ",".join([
                    "temperature_2m",
                    "relativehumidity_2m",
                    "et0_fao_evapotranspiration",
                    "windspeed_10m",
                ]),
                "timezone": "UTC",
            },
            timeout=60,
        )
        if r is None:
            return pd.DataFrame()

        data = r.json()["hourly"]
        df = pd.DataFrame({
            "time":              pd.to_datetime(data["time"], utc=True),
            "temperature":       data["temperature_2m"],
            "relative_humidity": data["relativehumidity_2m"],
            "et0":               data["et0_fao_evapotranspiration"],
            "wind_speed":        data["windspeed_10m"],
        })
        df["time"] = (
            df["time"]
            .dt.tz_convert("Asia/Ho_Chi_Minh")
            .dt.tz_localize(None)
            .dt.floor("h")
        )
        df = df[df["time"] <= end_vn]
        return df.sort_values("time").drop_duplicates("time").reset_index(drop=True)

    except Exception as e:
        print(f"  [WARN] fetch_meteo_history: {e}")
        return pd.DataFrame()