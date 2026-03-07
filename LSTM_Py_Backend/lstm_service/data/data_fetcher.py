# data_fetcher.py
import requests
import base64
import os
import pandas as pd
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://apiv2.danang.gov.vn/apiPCTT/1.0"
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

    end = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(days=days)

    try:
        token = get_token()

        r = requests.get(
            f"{BASE_URL}/baocaothuydiens_bieudo",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "thuydien_id": rid,
                "ngaybatdau": start.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z",
                "ngayketthuc": end.strftime("%Y-%m-%dT%H:%M:%S") + ".000Z",
            },
            timeout=120
        )

        if r.status_code != 200:
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

# ================= RAIN ARCHIVE =================
def fetch_rain_data(lat, lon, days=180):

    end = datetime.utcnow()
    start = end - timedelta(days=days)

    try:
        r = requests.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude": lat,
                "longitude": lon,
                "start_date": start.strftime("%Y-%m-%d"),
                "end_date": end.strftime("%Y-%m-%d"),
                "hourly": "precipitation",
                "timezone": "UTC"
            },
            timeout=120
        )

        if r.status_code != 200:
            return pd.DataFrame()

        data = r.json()

        df = pd.DataFrame({
            "time": pd.to_datetime(data["hourly"]["time"], utc=True),
            "rain": data["hourly"]["precipitation"]
        })

        # Convert timezone safely
        df["time"] = df["time"].dt.tz_convert("Asia/Ho_Chi_Minh").dt.tz_localize(None).dt.floor("h")

        # Keep only up to current hour
        now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
        df = df[df["time"] <= now]

        return df

    except Exception as e:
        print("Rain error:", e)
        return pd.DataFrame()


# ================= RAIN FORECAST =================
def fetch_rain_forecast(lat, lon, reference_time, hours=12):

    try:
        r = requests.get(
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

        if r.status_code != 200:
            return pd.DataFrame()

        data = r.json()

        df = pd.DataFrame({
            "time": pd.to_datetime(data["hourly"]["time"], utc=True),
            "rain_forecast": data["hourly"]["precipitation"]
        })

        # Convert về naive datetime
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