"""
VNDMS PCTT scraper utilities.

The protected page https://vndms.dmc.gov.vn/home/datapctt#two requires an
authenticated session. This module keeps credentials in environment variables
or accepts an exported browser cookie, then downloads raw protected responses
and normalizes hourly rain data to the Excel shape already consumed by
data.vndms_rain_loader.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from typing import Any, Iterable
from urllib.parse import urljoin

import pandas as pd
import requests
from dotenv import load_dotenv


BASE_URL = "https://vndms.dmc.gov.vn"
LOGIN_PAGE = "/home/index"
LOGIN_URL = "/Account/Login"
USER_URL = "/User/GetUser"
PCTT_URL = "/home/datapctt"

HOUR_COLUMNS = [f"{hour:02d}h" for hour in range(24)]


class VndmsScraperError(RuntimeError):
    """Raised when VNDMS login or data fetch fails."""


@dataclass
class VndmsConfig:
    username: str | None = None
    password: str | None = None
    cookie: str | None = None
    base_url: str = BASE_URL
    timeout: int = 60

    @classmethod
    def from_env(cls) -> "VndmsConfig":
        load_dotenv()
        return cls(
            username=os.getenv("VNDMS_USERNAME"),
            password=os.getenv("VNDMS_PASSWORD"),
            cookie=os.getenv("VNDMS_COOKIE"),
            base_url=os.getenv("VNDMS_BASE_URL", BASE_URL).rstrip("/"),
            timeout=int(os.getenv("VNDMS_TIMEOUT", "180")),
        )


def _cookie_dict(cookie_header: str) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for part in cookie_header.split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        if key:
            cookies[key] = value.strip()
    return cookies


def _extract_verification_token(html: str) -> str | None:
    match = re.search(
        r'name=["\']__RequestVerificationToken["\']\s+type=["\']hidden["\']\s+value=["\']([^"\']+)["\']',
        html,
        flags=re.I,
    )
    if match:
        return unescape(match.group(1))

    match = re.search(
        r'value=["\']([^"\']+)["\']\s+name=["\']__RequestVerificationToken["\']',
        html,
        flags=re.I,
    )
    return unescape(match.group(1)) if match else None


def _is_html_error_page(text: str) -> bool:
    lowered = text.lower()
    return "error 500" in lowered or "chua duoc cap quyen" in lowered or "chưa được cấp quyền" in lowered


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", "."))
    except ValueError:
        return None


def _find_key(row: dict[str, Any], candidates: Iterable[str]) -> str | None:
    lowered = {str(k).strip().lower(): k for k in row.keys()}
    for candidate in candidates:
        key = lowered.get(candidate.lower())
        if key is not None:
            return key
    return None


class VndmsSession:
    def __init__(self, config: VndmsConfig | None = None):
        self.config = config or VndmsConfig.from_env()
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
                ),
                "Referer": urljoin(self.config.base_url + "/", LOGIN_PAGE.lstrip("/")),
            }
        )
        if self.config.cookie:
            self.session.cookies.update(_cookie_dict(self.config.cookie))

    def _url(self, path_or_url: str) -> str:
        return path_or_url if path_or_url.startswith("http") else urljoin(self.config.base_url + "/", path_or_url.lstrip("/"))

    def login(self) -> None:
        if self.config.cookie:
            return
        if not self.config.username or not self.config.password:
            raise VndmsScraperError(
                "Missing VNDMS credentials. Set VNDMS_USERNAME/VNDMS_PASSWORD or VNDMS_COOKIE in .env."
            )

        token = None
        try:
            login_page = self.session.get(self._url(LOGIN_PAGE), timeout=self.config.timeout)
            login_page.raise_for_status()
            token = _extract_verification_token(login_page.text)
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else None
            if not status_code or status_code < 500:
                raise
        except requests.RequestException as exc:
            raise VndmsScraperError(f"Cannot open VNDMS login page: {exc}") from exc

        payload = {
            "UserName": self.config.username,
            "Password": self.config.password,
        }
        if token:
            payload["__RequestVerificationToken"] = token

        headers = {"X-Requested-With": "XMLHttpRequest"}
        response = self.session.post(self._url(LOGIN_URL), data=payload, headers=headers, timeout=self.config.timeout)
        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else "unknown"
            raise VndmsScraperError(
                f"VNDMS login HTTP {status_code}. If /home/index is failing, set VNDMS_COOKIE in .env "
                "from your logged-in browser session."
            ) from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise VndmsScraperError("VNDMS login did not return JSON. Check credentials or site changes.") from exc

        if str(data.get("status", "")).upper() != "OK":
            raise VndmsScraperError(f"VNDMS login failed: {data.get('msg') or data}")

    def check_user(self) -> dict[str, Any]:
        response = self.session.get(self._url(USER_URL), timeout=self.config.timeout)
        response.raise_for_status()
        try:
            return response.json()
        except ValueError as exc:
            raise VndmsScraperError("Cannot read VNDMS user profile. Session may not be authenticated.") from exc

    def fetch_pctt_page(self) -> str:
        response = self.session.get(self._url(PCTT_URL), timeout=self.config.timeout)
        response.raise_for_status()
        if _is_html_error_page(response.text):
            raise VndmsScraperError(
                "VNDMS returned the no-permission page for /home/datapctt. "
                "Ask the site admin to grant this account access to the function."
            )
        return response.text

    def post_detail_rain(
        self,
        station_id: str,
        source: str | None = None,
        time_select: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "id": station_id,
            "timeSelect": time_select,
            "source": source,
            "fromDate": from_date,
            "toDate": to_date,
        }
        response = self.session.post(self._url("/home/detailRain"), data=payload, timeout=self.config.timeout)
        response.raise_for_status()
        return response.json()

    def get_json(self, path_or_url: str, params: dict[str, Any] | None = None) -> Any:
        response = self.session.get(self._url(path_or_url), params=params, timeout=self.config.timeout)
        response.raise_for_status()
        return response.json()

    def post_json(self, path_or_url: str, payload: dict[str, Any] | None = None) -> Any:
        response = self.session.post(
            self._url(path_or_url),
            json=payload or {},
            headers={"Content-Type": "application/json; charset=utf-8"},
            timeout=self.config.timeout,
        )
        response.raise_for_status()
        return response.json()

    def get_response(self, path_or_url: str, params: dict[str, Any] | None = None) -> requests.Response:
        response = self.session.get(self._url(path_or_url), params=params, timeout=self.config.timeout)
        response.raise_for_status()
        return response


def discover_endpoints(html: str) -> list[str]:
    patterns = [
        r'url\s*:\s*["\']([^"\']+)["\']',
        r'\burl\s*=\s*["\']([^"\']+)["\']',
        r'\$\.get\(\s*["\']([^"\']+)["\']',
        r'\$\.post\(\s*["\']([^"\']+)["\']',
        r'fetch\(\s*["\']([^"\']+)["\']',
    ]
    endpoints: set[str] = set()
    for pattern in patterns:
        endpoints.update(match.group(1) for match in re.finditer(pattern, html))
    return sorted(endpoints)


def normalize_hourly_rain(records: list[dict[str, Any]]) -> pd.DataFrame:
    """
    Normalize JSON-like rows to VNDMS hourly wide format:
    Station | Provinces | Date | 00h ... 23h
    """
    long_rows: list[dict[str, Any]] = []
    for row in records:
        station_key = _find_key(row, ["station", "station_name", "name", "name_vn", "ten_tram", "tentram"])
        province_key = _find_key(row, ["province", "province_name", "provinces", "tinh"])
        time_key = _find_key(row, ["time", "timestamp", "date", "datetime", "daterain", "datestr", "ngay", "thoi_gian"])
        rain_key = _find_key(row, ["rain", "rainfall", "value", "gia_tri", "luong_mua", "total_rain"])

        if not station_key or not time_key:
            continue

        has_hour_cols = any(col in row for col in HOUR_COLUMNS)
        has_vndms_hour_cols = any(f"h{hour}" in row for hour in range(24))
        if has_hour_cols or has_vndms_hour_cols:
            date_value = pd.to_datetime(row.get(time_key), errors="coerce")
            if pd.isna(date_value) or date_value.year < 1900:
                continue
            long_rows.extend(
                {
                    "Station": row.get(station_key),
                    "Provinces": row.get(province_key, ""),
                    "Date": date_value.date(),
                    "hour": hour,
                    "rain": _as_float(row.get(f"{hour:02d}h", row.get(f"h{hour}"))) or 0.0,
                }
                for hour in range(24)
            )
            continue

        if not rain_key:
            continue
        timestamp = pd.to_datetime(row.get(time_key), errors="coerce")
        if pd.isna(timestamp):
            continue
        long_rows.append(
            {
                "Station": row.get(station_key),
                "Provinces": row.get(province_key, ""),
                "Date": timestamp.date(),
                "hour": int(timestamp.hour),
                "rain": _as_float(row.get(rain_key)) or 0.0,
            }
        )

    if not long_rows:
        return pd.DataFrame(columns=["Station", "Provinces", "Date", *HOUR_COLUMNS])

    long_df = pd.DataFrame(long_rows)
    wide = (
        long_df.pivot_table(
            index=["Station", "Provinces", "Date"],
            columns="hour",
            values="rain",
            aggfunc="mean",
            fill_value=0.0,
        )
        .reset_index()
        .rename(columns={hour: f"{hour:02d}h" for hour in range(24)})
    )
    for col in HOUR_COLUMNS:
        if col not in wide.columns:
            wide[col] = 0.0
    return wide[["Station", "Provinces", "Date", *HOUR_COLUMNS]].sort_values(["Station", "Date"])


def normalize_water_level(records: list[dict[str, Any]]) -> pd.DataFrame:
    """Normalize VNDMS water-level grid rows to a tabular Excel-friendly shape."""
    rows: list[dict[str, Any]] = []
    for row in records:
        time_value = pd.to_datetime(row.get("time_format"), dayfirst=True, errors="coerce")
        if pd.isna(time_value):
            date_value = pd.to_datetime(row.get("date_water"), errors="coerce")
            hour_value = _as_float(row.get("hour_water"))
            if not pd.isna(date_value) and hour_value is not None:
                time_value = date_value.replace(hour=int(hour_value), minute=0, second=0, microsecond=0)

        rows.append(
            {
                "time": time_value if not pd.isna(time_value) else None,
                "date": row.get("timeStr"),
                "hour": row.get("hour_water"),
                "province": row.get("province_name"),
                "station": row.get("name_vn"),
                "station_id": row.get("station_id"),
                "river": row.get("river_name"),
                "basin": row.get("luuvuc"),
                "source": row.get("source"),
                "water_level_m": _as_float(row.get("value_water")),
                "difference": _as_float(row.get("value_difference")),
                "alarm_1_m": _as_float(row.get("bao_dong_1")),
                "alarm_2_m": _as_float(row.get("bao_dong_2")),
                "alarm_3_m": _as_float(row.get("bao_dong_3")),
                "historic_flood_m": _as_float(row.get("giatri_lu_lichsu")),
                "historic_flood_year": row.get("nam_lu_lichsu"),
                "trend": row.get("xuthe"),
                "alarm_level": row.get("cap_baodong"),
                "lat": _as_float(row.get("lat")),
                "lon": _as_float(row.get("lon")),
            }
        )

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    return df.sort_values(["station", "time"], na_position="last").reset_index(drop=True)


def normalize_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = text.replace("Đ", "D").replace("đ", "d")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().casefold()


def normalize_hydropower(records: list[dict[str, Any]]) -> pd.DataFrame:
    """Normalize VNDMS hydropower lake rows to an Excel-friendly shape."""
    rows: list[dict[str, Any]] = []
    for row in records:
        time_value = pd.to_datetime(
            f"{row.get('date_convert', '')} {row.get('hour_date', '')}",
            dayfirst=True,
            errors="coerce",
        )
        rows.append(
            {
                "time": time_value if not pd.isna(time_value) else None,
                "category": "hydropower",
                "date": row.get("date_convert"),
                "hour": row.get("hour_date"),
                "province": row.get("tentinh_new"),
                "basin": row.get("tenluuvuc_new"),
                "reservoir": row.get("tendap"),
                "reservoir_id": row.get("maho"),
                "source": row.get("source"),
                "upstream_level_m": _as_float(row.get("mucnuocthuongluu")),
                "downstream_level_m": _as_float(row.get("mucnuochaluu")),
                "normal_level_m": _as_float(row.get("mucnuocdangbinhthuong")),
                "inflow_m3s": _as_float(row.get("luuluongnuocvao")),
                "total_outflow_m3s": _as_float(row.get("tongluuluong")),
                "turbine_flow_m3s": _as_float(row.get("dungluongnhamay")),
                "spillway_flow_m3s": _as_float(row.get("luuluongnuocxa")),
                "open_bottom_gates": _as_float(row.get("socuaxaday")),
                "open_surface_gates": _as_float(row.get("socuaxamat")),
                "total_bottom_gates": _as_float(row.get("tongsocuaxaday")),
                "total_surface_gates": _as_float(row.get("tongsocuaxamat")),
                "design_flood_level_m": _as_float(row.get("mucnuocgiacuong")),
                "storage_million_m3": _as_float(row.get("dungtichtong")),
                "power_mw": _as_float(row.get("congsuat")),
                "upstream_level_diff": _as_float(row.get("difference_thuongluu")),
                "inflow_diff": _as_float(row.get("difference_den")),
                "outflow_diff": _as_float(row.get("difference_xa")),
                "lat": _as_float(row.get("lat")),
                "lon": _as_float(row.get("lon")),
            }
        )

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    return df.sort_values(["reservoir", "time"], na_position="last").reset_index(drop=True)


def normalize_irrigation_lake(records: list[dict[str, Any]]) -> pd.DataFrame:
    """Normalize VNDMS irrigation lake rows; useful for reservoirs such as Ta Trach."""
    rows: list[dict[str, Any]] = []
    for row in records:
        time_value = pd.to_datetime(row.get("time_convert") or row.get("thoigian"), dayfirst=True, errors="coerce")
        rows.append(
            {
                "time": time_value if not pd.isna(time_value) else None,
                "category": "irrigation_lake",
                "date": time_value.date() if not pd.isna(time_value) else None,
                "hour": time_value.strftime("%H:%M") if not pd.isna(time_value) else None,
                "province": row.get("tentinh"),
                "basin": row.get("tenluuvuc") or row.get("lvs"),
                "reservoir": row.get("tenho"),
                "reservoir_id": row.get("maho"),
                "source": row.get("source_map"),
                "upstream_level_m": _as_float(row.get("tdmucnuoc")),
                "downstream_level_m": None,
                "normal_level_m": _as_float(row.get("mucnuocdangbinhthuong")),
                "inflow_m3s": _as_float(row.get("luuluong_den")),
                "total_outflow_m3s": _as_float(row.get("luuluong_xa")),
                "turbine_flow_m3s": None,
                "spillway_flow_m3s": None,
                "open_bottom_gates": None,
                "open_surface_gates": None,
                "total_bottom_gates": None,
                "total_surface_gates": None,
                "design_flood_level_m": _as_float(row.get("mucnuocdanggiacuong")),
                "dead_level_m": _as_float(row.get("mucnuocchet")),
                "storage_million_m3": _as_float(row.get("tddungtich")),
                "total_storage_million_m3": _as_float(row.get("dungtichtoanbo")),
                "basin_area_km2": _as_float(row.get("dientichluuvuc")),
                "power_mw": None,
                "upstream_level_diff": _as_float(row.get("difference_mucnuoc")),
                "inflow_diff": None,
                "outflow_diff": None,
                "is_releasing": row.get("dang_xa"),
                "lat": _as_float(row.get("lat")),
                "lon": _as_float(row.get("lon")),
            }
        )

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    return df.sort_values(["reservoir", "time"], na_position="last").reset_index(drop=True)


def save_vndms_month_excel(df: pd.DataFrame, output_dir: str, year: int, month: int) -> str:
    if df.empty:
        raise VndmsScraperError("No rain rows to save.")

    year_dir = os.path.join(output_dir, f"DATA_RAIN_{year}")
    os.makedirs(year_dir, exist_ok=True)
    path = os.path.join(year_dir, f"VNDMS_Mua_Theo_Gio_{year}_{month:02d}.xlsx")
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="DaNang_QuangNam", index=False)
    return path


def load_json_records(path: str) -> list[dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict):
        for key in ("data", "items", "rows", "result"):
            value = data.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    return []
