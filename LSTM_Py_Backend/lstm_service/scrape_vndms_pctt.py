"""
CLI for authenticated VNDMS PCTT data download and normalization.

Examples:
  python -X utf8 scrape_vndms_pctt.py --check
  python -X utf8 scrape_vndms_pctt.py --download-page
  python -X utf8 scrape_vndms_pctt.py --download-tabs
  python -X utf8 scrape_vndms_pctt.py --endpoint /home/dataquantracmucnuoc
  python -X utf8 scrape_vndms_pctt.py --normalize-json raw.json --year 2026 --month 5
"""
from __future__ import annotations

import argparse
import calendar
import json
import os
import sys
from datetime import datetime

import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from data.vndms_pctt_scraper import (  # noqa: E402
    VndmsScraperError,
    VndmsSession,
    discover_endpoints,
    load_json_records,
    normalize_hourly_rain,
    normalize_hydropower,
    normalize_irrigation_lake,
    normalize_text,
    normalize_water_level,
    save_vndms_month_excel,
)


DEFAULT_RAW_DIR = os.path.join(SCRIPT_DIR, "Rain Data", "_raw_vndms_pctt")
DEFAULT_RAIN_DIR = os.path.join(SCRIPT_DIR, "Rain Data")
TAB_ENDPOINTS = {
    "rain": "/home/dataquantracmua",
    "water_level": "/home/dataquantracmucnuoc",
    "flow": "/home/DataQuanTracLuuLuong",
    "irrigation_lake": "/home/datahothuyloi",
    "hydropower_lake": "/home/datahothuydien",
}
GRID_ENDPOINTS = {
    "rain-hourly": "/DataQuanTracMua/DataMuaTheoGio",
    "rain-days": "/DataQuanTracMua/DataMuaNhieuNgay",
    "water-level": "/DataQuanTracMucNuoc/listDataMucNuoc",
    "flow": "/DataQuanTracLuuLuong/DataLuuLuong",
    "hydropower": "/DataHoThuyDien/listHoThuyDien",
    "irrigation": "/DataHoThuyLoi/listHoThuyLoi",
}


def _write_text(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


def _write_json(path: str, content) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(content, fh, ensure_ascii=False, indent=2)


def _safe_endpoint_name(endpoint: str) -> str:
    return endpoint.strip("/").replace("/", "_").replace("?", "_") or "endpoint"


def _save_endpoint_response(client: VndmsSession, endpoint: str, raw_dir: str, params=None, prefix: str | None = None) -> str:
    response = client.get_response(endpoint, params=params)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = prefix or _safe_endpoint_name(endpoint)
    content_type = response.headers.get("content-type", "").lower()

    if "json" in content_type:
        out_path = os.path.join(raw_dir, f"{safe_name}_{stamp}.json")
        _write_json(out_path, response.json())
        return out_path

    text = response.text
    stripped = text.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            out_path = os.path.join(raw_dir, f"{safe_name}_{stamp}.json")
            _write_json(out_path, response.json())
            return out_path
        except ValueError:
            pass

    out_path = os.path.join(raw_dir, f"{safe_name}_{stamp}.html")
    _write_text(out_path, text)
    return out_path


def _default_grid_payload(
    grid: str,
    from_date: str | None,
    to_date: str | None,
    length: int,
    province_id: str = "0",
    basin_id: str = "",
) -> dict:
    if grid in {"rain-hourly", "rain-days"}:
        return {
            "start": 1,
            "length": length,
            "search_key": "",
            "province_id": province_id,
            "luuvuc_id": basin_id,
            "fromDate": from_date or datetime.now().strftime("%d/%m/%Y"),
            "toDate": to_date or datetime.now().strftime("%d/%m/%Y"),
            "from_number": None,
            "to_number": None,
            "orderby": "0",
            "fromObs": 1,
            "toObs": 19,
            "source": 0,
        }

    return {
        "start": 1,
        "length": length,
        "search_key": "",
        "province_id": province_id,
        "luuvuc_id": basin_id,
        "fromDateStr": from_date or datetime.now().strftime("%d/%m/%Y 00:00"),
        "toDateStr": to_date or datetime.now().strftime("%d/%m/%Y %H:%M"),
        "from_number": None,
        "to_number": None,
        "orderby": "0",
        "source": 0,
    }


def _default_hydropower_payload(
    from_date: str,
    to_date: str,
    length: int,
    province_id: str = "0",
    basin_id: str = "",
) -> dict:
    return {
        "start": 1,
        "length": length,
        "search_key": "",
        "province_id": province_id,
        "luuvuc_id": basin_id,
        "fromDateStr": from_date,
        "toDateStr": to_date,
        "orderby": "0",
        "source": 0,
    }


def _default_irrigation_payload(
    from_date: str,
    to_date: str,
    length: int,
    province_id: str = "0",
    basin_id: str = "",
) -> dict:
    return {
        "start": 1,
        "length": length,
        "search_key": "",
        "province_id": province_id,
        "luuvuc_id": basin_id,
        "fromDateStr": from_date,
        "toDateStr": to_date,
        "orderby": 0,
        "source": 0,
    }


def _matches_target_name(value, target_name: str) -> bool:
    value_norm = normalize_text(value)
    target_norm = normalize_text(target_name)
    return target_norm in value_norm or target_norm.replace(" ", "") in value_norm.replace(" ", "")


def _safe_name(value: str) -> str:
    normalized = normalize_text(value).replace(" ", "_")
    safe = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in normalized)
    return safe.strip("_") or "reservoir"


def _save_grid_json(client: VndmsSession, grid: str, raw_dir: str, from_date: str | None, to_date: str | None, length: int) -> str:
    if grid not in GRID_ENDPOINTS:
        raise VndmsScraperError(f"Unknown grid '{grid}'. Choose one of: {', '.join(GRID_ENDPOINTS)}")
    payload = _default_grid_payload(grid, from_date, to_date, length)
    data = client.post_json(GRID_ENDPOINTS[grid], payload)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(raw_dir, f"{grid}_{stamp}.json")
    _write_json(out_path, data)
    return out_path


def _fetch_grid_pages(client: VndmsSession, grid: str, payload: dict, page_size: int) -> dict:
    endpoint = GRID_ENDPOINTS[grid]
    all_records = []
    page = 1
    total = None

    while True:
        page_payload = dict(payload)
        page_payload["start"] = page
        page_payload["length"] = page_size
        data = client.post_json(endpoint, page_payload)
        records = data.get("data", []) if isinstance(data, dict) else []
        all_records.extend(row for row in records if isinstance(row, dict))

        total = data.get("recordsFiltered") or data.get("recordsTotal") or total if isinstance(data, dict) else total
        if not records:
            break
        if total is not None and len(all_records) >= int(total):
            break
        if len(records) < page_size:
            break
        page += 1

    return {
        "status": "OK",
        "mode": "paged-concat",
        "grid": grid,
        "recordsTotal": total if total is not None else len(all_records),
        "data": all_records,
    }


def _fetch_water_level_year(
    client: VndmsSession,
    year: int,
    basin_id: str,
    raw_dir: str,
    rain_dir: str,
    page_size: int,
) -> tuple[str, str, int]:
    from_date = f"01/01/{year} 00:00"
    to_date = f"31/12/{year} 23:59"
    payload = _default_grid_payload("water-level", from_date, to_date, page_size)
    payload["luuvuc_id"] = basin_id
    payload["orderby"] = "0"

    data = _fetch_grid_pages(client, "water-level", payload, page_size)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_basin = str(basin_id).replace(" ", "_")

    raw_path = os.path.join(raw_dir, f"water-level_{year}_basin_{safe_basin}_{stamp}.json")
    _write_json(raw_path, data)

    df = normalize_water_level(data["data"])
    out_dir = os.path.join(rain_dir, f"DATA_WATER_LEVEL_{year}")
    os.makedirs(out_dir, exist_ok=True)
    excel_path = os.path.join(out_dir, f"VNDMS_Muc_Nuoc_{year}_luuvuc_{safe_basin}.xlsx")
    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="water_level", index=False)

    return raw_path, excel_path, len(df)


def _fetch_hydropower_range(
    client: VndmsSession,
    start_year: int,
    end_year: int,
    province_id: str,
    basin_id: str,
    reservoir_names: list[str],
    raw_dir: str,
    rain_dir: str,
    page_size: int,
    to_date_override: str | None = None,
) -> tuple[str, str, int, dict[str, dict[str, object]]]:
    hydropower_records = []
    irrigation_records = []
    yearly_meta = []
    now = datetime.now()

    for year in range(start_year, end_year + 1):
        from_date = f"01/01/{year} 00:00"
        if year == now.year:
            to_date = now.strftime("%d/%m/%Y %H:%M")
        else:
            to_date = f"31/12/{year} 23:59"
        if to_date_override and year == end_year:
            to_date = to_date_override

        hydropower_payload = _default_hydropower_payload(
            from_date,
            to_date,
            page_size,
            province_id=province_id,
            basin_id=basin_id,
        )
        hydropower_data = _fetch_grid_pages(client, "hydropower", hydropower_payload, page_size)
        hydropower_year_records = hydropower_data.get("data", [])
        hydropower_filtered = [
            row
            for row in hydropower_year_records
            if any(_matches_target_name(row.get("tendap"), target) for target in reservoir_names)
        ]
        hydropower_records.extend(hydropower_filtered)

        irrigation_payload = _default_irrigation_payload(
            from_date,
            to_date,
            page_size,
            province_id=province_id,
            basin_id=basin_id,
        )
        irrigation_data = _fetch_grid_pages(client, "irrigation", irrigation_payload, page_size)
        irrigation_year_records = irrigation_data.get("data", [])
        irrigation_filtered = [
            row
            for row in irrigation_year_records
            if any(_matches_target_name(row.get("tenho"), target) for target in reservoir_names)
        ]
        irrigation_records.extend(irrigation_filtered)

        yearly_meta.append(
            {
                "year": year,
                "from_date": from_date,
                "to_date": to_date,
                "hydropower_recordsTotal": hydropower_data.get("recordsTotal"),
                "hydropower_rows_before_filter": len(hydropower_year_records),
                "hydropower_rows_after_filter": len(hydropower_filtered),
                "irrigation_recordsTotal": irrigation_data.get("recordsTotal"),
                "irrigation_rows_before_filter": len(irrigation_year_records),
                "irrigation_rows_after_filter": len(irrigation_filtered),
            }
        )

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_province = str(province_id).replace(" ", "_")
    raw_payload = {
        "status": "OK",
        "mode": "yearly-paged-concat-filtered",
        "province_id": province_id,
        "basin_id": basin_id,
        "reservoir_names": reservoir_names,
        "yearly": yearly_meta,
        "recordsTotal": len(hydropower_records) + len(irrigation_records),
        "hydropower_data": hydropower_records,
        "irrigation_data": irrigation_records,
    }
    safe_basin = str(basin_id).replace(" ", "_") or "all"
    raw_path = os.path.join(
        raw_dir,
        f"hydropower_{start_year}_{end_year}_province_{safe_province}_basin_{safe_basin}_{stamp}.json",
    )
    _write_json(raw_path, raw_payload)

    df_hydropower = normalize_hydropower(hydropower_records)
    df_irrigation = normalize_irrigation_lake(irrigation_records)
    df = pd.concat([df_hydropower, df_irrigation], ignore_index=True, sort=False)
    if not df.empty:
        df = df.sort_values(["reservoir", "time"], na_position="last").reset_index(drop=True)
    out_dir = os.path.join(rain_dir, f"DATA_HYDROPOWER_{start_year}_{end_year}")
    os.makedirs(out_dir, exist_ok=True)
    scope_label = "TTHue" if str(province_id) == "411" and not basin_id else f"province_{safe_province}_basin_{safe_basin}"
    excel_path = os.path.join(out_dir, f"VNDMS_Thuy_Dien_{scope_label}_{start_year}_{end_year}.xlsx")
    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="reservoir_observations", index=False)
        df_hydropower.to_excel(writer, sheet_name="hydropower_raw", index=False)
        df_irrigation.to_excel(writer, sheet_name="irrigation_raw", index=False)
        pd.DataFrame(yearly_meta).to_excel(writer, sheet_name="fetch_meta", index=False)

    split_info: dict[str, dict[str, object]] = {}
    split_dir = os.path.join(out_dir, "by_reservoir")
    os.makedirs(split_dir, exist_ok=True)
    for reservoir_name in reservoir_names:
        if df.empty or "reservoir" not in df.columns:
            subset = df.copy()
        else:
            mask = df["reservoir"].apply(lambda value: _matches_target_name(value, reservoir_name))
            subset = df[mask].copy()
        split_path = os.path.join(
            split_dir,
            f"VNDMS_Thuy_Dien_{_safe_name(reservoir_name)}_{start_year}_{end_year}.xlsx",
        )
        with pd.ExcelWriter(split_path, engine="openpyxl") as writer:
            subset.to_excel(writer, sheet_name="reservoir_observations", index=False)
            pd.DataFrame(yearly_meta).to_excel(writer, sheet_name="fetch_meta", index=False)
        split_info[reservoir_name] = {"path": split_path, "rows": int(len(subset))}

    return raw_path, excel_path, len(df), split_info


def _fetch_rain_month(
    client: VndmsSession,
    month_text: str,
    raw_dir: str,
    rain_dir: str,
    length: int,
    province_id: str = "0",
) -> tuple[str, str, int, pd.DataFrame]:
    year, month = [int(part) for part in month_text.split("-", 1)]
    today = datetime.now()
    if year > today.year or (year == today.year and month > today.month):
        raise VndmsScraperError(f"Cannot fetch future rain month: {month_text}")

    last_day = calendar.monthrange(year, month)[1]
    if year == today.year and month == today.month:
        last_day = min(last_day, today.day)

    all_records = []
    daily_meta = []
    for day in range(1, last_day + 1):
        day_text = f"{day:02d}/{month:02d}/{year}"
        payload = _default_grid_payload("rain-hourly", day_text, day_text, length, province_id=province_id)
        data = client.post_json(GRID_ENDPOINTS["rain-hourly"], payload)
        records = data.get("data", []) if isinstance(data, dict) else []
        all_records.extend(row for row in records if isinstance(row, dict))
        daily_meta.append(
            {
                "date": day_text,
                "recordsTotal": data.get("recordsTotal") if isinstance(data, dict) else None,
                "recordsFiltered": data.get("recordsFiltered") if isinstance(data, dict) else None,
                "rows": len(records),
            }
        )

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    raw_path = os.path.join(raw_dir, f"rain-hourly_{year}_{month:02d}_{stamp}.json")
    _write_json(
        raw_path,
        {
            "status": "OK",
            "mode": "daily-concat",
            "year": year,
            "month": month,
            "province_id": province_id,
            "daily": daily_meta,
            "recordsTotal": len(all_records),
            "data": all_records,
        },
    )

    df = normalize_hourly_rain(all_records)
    excel_path = save_vndms_month_excel(df, rain_dir, year, month)
    return raw_path, excel_path, len(df), df


def _iter_months(start_year: int, end_year: int) -> list[tuple[int, int]]:
    today = datetime.now()
    months: list[tuple[int, int]] = []
    for year in range(start_year, end_year + 1):
        if year > today.year:
            break
        last_month = 12
        if year == today.year:
            last_month = today.month
        for month in range(1, last_month + 1):
            months.append((year, month))
    return months


def _fetch_rain_range(
    client: VndmsSession,
    start_year: int,
    end_year: int,
    province_id: str,
    raw_dir: str,
    rain_dir: str,
    page_size: int,
) -> tuple[str, str, int]:
    all_month_dfs = []
    monthly_meta = []

    for year, month in _iter_months(start_year, end_year):
        month_text = f"{year}-{month:02d}"
        raw_path, excel_path, n_rows, df = _fetch_rain_month(
            client,
            month_text,
            raw_dir,
            rain_dir,
            page_size,
            province_id=province_id,
        )
        monthly_meta.append(
            {
                "year": year,
                "month": month,
                "station_day_rows": n_rows,
                "raw_path": raw_path,
                "excel_path": excel_path,
            }
        )
        if not df.empty:
            all_month_dfs.append(df)
        print(f"[OK] Rain {month_text}: {n_rows} station-day rows")

    combined = pd.concat(all_month_dfs, ignore_index=True, sort=False) if all_month_dfs else pd.DataFrame()
    if not combined.empty:
        combined = combined.sort_values(["Station", "Date"]).reset_index(drop=True)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_province = str(province_id).replace(" ", "_")
    raw_path = os.path.join(raw_dir, f"rain-hourly_{start_year}_{end_year}_province_{safe_province}_{stamp}.json")
    _write_json(
        raw_path,
        {
            "status": "OK",
            "mode": "monthly-daily-concat",
            "province_id": province_id,
            "start_year": start_year,
            "end_year": end_year,
            "monthly": monthly_meta,
            "recordsTotal": int(len(combined)),
        },
    )

    out_dir = os.path.join(rain_dir, f"DATA_RAIN_{start_year}_{end_year}")
    os.makedirs(out_dir, exist_ok=True)
    excel_path = os.path.join(out_dir, f"VNDMS_Mua_Theo_Gio_TTHue_{start_year}_{end_year}.xlsx")
    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        combined.to_excel(writer, sheet_name="DaNang_QuangNam", index=False)
        pd.DataFrame(monthly_meta).to_excel(writer, sheet_name="fetch_meta", index=False)

    return raw_path, excel_path, len(combined)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Download protected VNDMS PCTT data.")
    parser.add_argument("--check", action="store_true", help="Login and print the current VNDMS user.")
    parser.add_argument("--download-page", action="store_true", help="Download /home/datapctt and list discovered endpoints.")
    parser.add_argument("--download-tabs", action="store_true", help="Download known tab endpoints from /home/datapctt.")
    parser.add_argument("--download-grid-samples", action="store_true", help="Download sample JSON from rain/water/flow grids.")
    parser.add_argument("--raw-dir", default=DEFAULT_RAW_DIR, help="Folder for raw protected HTML/JSON files.")
    parser.add_argument("--endpoint", help="Authenticated endpoint to GET, e.g. /home/dataquantracmucnuoc.")
    parser.add_argument("--params", help="JSON string with query parameters for --endpoint.")
    parser.add_argument("--grid", choices=sorted(GRID_ENDPOINTS), help="Authenticated VNDMS Kendo grid to POST and save as JSON.")
    parser.add_argument("--rain-month", help="Fetch hourly rain for a month and save VNDMS_Mua_Theo_Gio_YYYY_MM.xlsx, e.g. 2026-05.")
    parser.add_argument("--rain-from-year", type=int, help="Fetch hourly rain from this year to --to-year/current year.")
    parser.add_argument("--water-level-year", type=int, help="Fetch water-level observations for one year and save Excel.")
    parser.add_argument("--basin-id", default="13", help="VNDMS luuvuc_id. Default 13 = Song Vu Gia - Thu Bon.")
    parser.add_argument("--hydropower-from-year", type=int, help="Fetch hydropower observations from this year to --to-year/current year.")
    parser.add_argument("--to-year", type=int, default=datetime.now().year, help="End year for --hydropower-from-year.")
    parser.add_argument("--province-id", default="411", help="VNDMS area_id. Default 411 = Thua Thien Hue.")
    parser.add_argument(
        "--reservoirs",
        default="Ta Trach,Binh Dien,Huong Dien",
        help="Comma-separated reservoir names to keep, accent-insensitive.",
    )
    parser.add_argument("--from-date", help="Grid start date. Rain: dd/MM/yyyy. Water/flow: dd/MM/yyyy HH:mm.")
    parser.add_argument("--to-date", help="Grid end date. Rain: dd/MM/yyyy. Water/flow: dd/MM/yyyy HH:mm.")
    parser.add_argument("--length", type=int, default=10000, help="Grid page size to request.")
    parser.add_argument("--normalize-json", help="Normalize a downloaded JSON file to VNDMS monthly Excel.")
    parser.add_argument("--year", type=int, help="Output year for normalized Excel.")
    parser.add_argument("--month", type=int, help="Output month for normalized Excel.")
    parser.add_argument("--rain-dir", default=DEFAULT_RAIN_DIR, help="Root folder for Rain Data/DATA_RAIN_YYYY.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    client = VndmsSession()

    try:
        if args.normalize_json:
            if not args.year or not args.month:
                raise VndmsScraperError("--normalize-json requires --year and --month.")
            rows = load_json_records(args.normalize_json)
            df = normalize_hourly_rain(rows)
            output_path = save_vndms_month_excel(df, args.rain_dir, args.year, args.month)
            print(f"[OK] Saved {len(df)} station-day rows to {output_path}")
            return 0

        client.login()

        if args.check:
            user = client.check_user()
            print(json.dumps(user, ensure_ascii=False, indent=2))

        if args.download_page:
            html = client.fetch_pctt_page()
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            html_path = os.path.join(args.raw_dir, f"datapctt_{stamp}.html")
            endpoints_path = os.path.join(args.raw_dir, f"datapctt_endpoints_{stamp}.json")
            endpoints = discover_endpoints(html)
            _write_text(html_path, html)
            _write_json(endpoints_path, endpoints)
            print(f"[OK] Saved protected page: {html_path}")
            print(f"[OK] Saved discovered endpoints: {endpoints_path}")
            for endpoint in endpoints:
                print(f"  {endpoint}")

        if args.endpoint:
            params = json.loads(args.params) if args.params else None
            out_path = _save_endpoint_response(client, args.endpoint, args.raw_dir, params=params)
            print(f"[OK] Saved endpoint response: {out_path}")

        if args.download_tabs:
            for name, endpoint in TAB_ENDPOINTS.items():
                out_path = _save_endpoint_response(client, endpoint, args.raw_dir, prefix=name)
                print(f"[OK] Saved {name}: {out_path}")

        if args.grid:
            out_path = _save_grid_json(client, args.grid, args.raw_dir, args.from_date, args.to_date, args.length)
            print(f"[OK] Saved grid JSON: {out_path}")

        if args.download_grid_samples:
            for grid in GRID_ENDPOINTS:
                out_path = _save_grid_json(client, grid, args.raw_dir, args.from_date, args.to_date, args.length)
                print(f"[OK] Saved {grid}: {out_path}")

        if args.rain_month:
            raw_path, excel_path, n_rows, _ = _fetch_rain_month(
                client,
                args.rain_month,
                args.raw_dir,
                args.rain_dir,
                args.length,
                province_id=args.province_id,
            )
            print(f"[OK] Saved raw month JSON: {raw_path}")
            print(f"[OK] Saved VNDMS rain Excel ({n_rows} station-day rows): {excel_path}")

        if args.rain_from_year:
            raw_path, excel_path, n_rows = _fetch_rain_range(
                client,
                args.rain_from_year,
                args.to_year,
                args.province_id,
                args.raw_dir,
                args.rain_dir,
                args.length,
            )
            print(f"[OK] Saved raw rain range summary: {raw_path}")
            print(f"[OK] Saved combined VNDMS rain Excel ({n_rows} station-day rows): {excel_path}")

        if args.water_level_year:
            raw_path, excel_path, n_rows = _fetch_water_level_year(
                client,
                args.water_level_year,
                args.basin_id,
                args.raw_dir,
                args.rain_dir,
                args.length,
            )
            print(f"[OK] Saved raw water-level JSON: {raw_path}")
            print(f"[OK] Saved water-level Excel ({n_rows} rows): {excel_path}")

        if args.hydropower_from_year:
            reservoir_names = [name.strip() for name in args.reservoirs.split(",") if name.strip()]
            raw_path, excel_path, n_rows, split_info = _fetch_hydropower_range(
                client,
                args.hydropower_from_year,
                args.to_year,
                args.province_id,
                args.basin_id,
                reservoir_names,
                args.raw_dir,
                args.rain_dir,
                args.length,
                to_date_override=args.to_date,
            )
            print(f"[OK] Saved raw hydropower JSON: {raw_path}")
            print(f"[OK] Saved hydropower Excel ({n_rows} rows): {excel_path}")
            for reservoir_name, info in split_info.items():
                print(f"[OK] Saved {reservoir_name} Excel ({info['rows']} rows): {info['path']}")

        if not (
            args.check
            or args.download_page
            or args.endpoint
            or args.download_tabs
            or args.grid
            or args.download_grid_samples
            or args.rain_month
            or args.rain_from_year
            or args.water_level_year
            or args.hydropower_from_year
        ):
            print("Nothing to do. Use --check, --download-page, --download-tabs, --grid, --rain-month, --rain-from-year, --water-level-year, --hydropower-from-year, --endpoint, or --normalize-json.")
            return 2

        return 0
    except VndmsScraperError as exc:
        print(f"[ERROR] {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
