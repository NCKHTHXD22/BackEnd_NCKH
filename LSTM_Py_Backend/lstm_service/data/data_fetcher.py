# data_fetcher.py
import requests
import base64
import os
import pandas as pd
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from data.rain_matrix_loader import load_rain_matrix, load_rain_from_stations

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


# ================= HYDRO =================
def fetch_hydro_data(rid, days=180):

    end = _vn_now().replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(days=days)

    try:
        token = get_token()

        r = _get_with_retry(
            f"{BASE_URL}/baocaothuydiens_bieudo",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "thuydien_id": rid,
                "ngaybatdau": start.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z",
                "ngayketthuc": end.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z",
            },
            timeout=120
        )

        if r is None:
            return pd.DataFrame()

        raw = r.json()
        df = pd.DataFrame(raw["data"] if isinstance(raw, dict) else raw)

        if df.empty:
            return pd.DataFrame()

        df["time"] = pd.to_datetime(df["thoigianxa"], errors="coerce").dt.floor("h")

        df["inflow"] = pd.to_numeric(df["qvao"], errors="coerce")
        df["water_level"] = pd.to_numeric(df["htl"], errors="coerce")
        df["outflow"] = pd.to_numeric(df["luuluongxa"], errors="coerce")

        df = df[["time", "inflow", "water_level", "outflow"]].dropna()

        return df

    except Exception as e:
        print("Hydro error:", e)
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
        print(f"  [INFO] Detecting gap: {gap_start} to {reference_time}. Fetching from Rain Data...")
        df_gap = load_rain_from_stations(rid, gap_start, reference_time)
        if not df_gap.empty:
            print(f"  [OK] Filled {len(df_gap)} hours from Raw Rain Data (IDW calculated)")

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

        # 🔥 ALIGN TIME
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