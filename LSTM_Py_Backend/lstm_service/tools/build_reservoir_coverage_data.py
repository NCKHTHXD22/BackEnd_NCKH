from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Rain Data" / "DATA_HYDROPOWER_2022_2026" / "VNDMS_Thuy_Dien_TTHue_2022_2026.xlsx"
OUT_DIR = ROOT / "outputs" / "reservoir_coverage_report"
OUT_JSON = OUT_DIR / "coverage_report_data.json"

REQUEST_START = pd.Timestamp("2022-01-01 00:00:00")


def _fmt_ts(value: pd.Timestamp | None) -> str:
    if value is None or pd.isna(value):
        return ""
    return pd.Timestamp(value).strftime("%Y-%m-%d %H:%M")


def _coverage(observed: int, expected: int) -> float:
    return round((observed / expected * 100.0), 2) if expected else 0.0


def _missing_runs(expected_hours: pd.DatetimeIndex, observed_hours: set[pd.Timestamp]) -> list[dict]:
    missing = [ts for ts in expected_hours if ts not in observed_hours]
    if not missing:
        return []

    runs = []
    start = prev = missing[0]
    for ts in missing[1:]:
        if ts == prev + pd.Timedelta(hours=1):
            prev = ts
            continue
        runs.append(
            {
                "gap_start": _fmt_ts(start),
                "gap_end": _fmt_ts(prev),
                "missing_hours": int((prev - start) / pd.Timedelta(hours=1)) + 1,
            }
        )
        start = prev = ts
    runs.append(
        {
            "gap_start": _fmt_ts(start),
            "gap_end": _fmt_ts(prev),
            "missing_hours": int((prev - start) / pd.Timedelta(hours=1)) + 1,
        }
    )
    runs.sort(key=lambda row: row["missing_hours"], reverse=True)
    return runs


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_excel(SOURCE, sheet_name="reservoir_observations")
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time", "reservoir"]).copy()
    df["hour_ts"] = df["time"].dt.floor("h")
    df["year"] = df["hour_ts"].dt.year
    df["month"] = df["hour_ts"].dt.to_period("M").astype(str)

    global_end = df["hour_ts"].max()
    requested_hours = pd.date_range(REQUEST_START, global_end, freq="h")
    requested_expected = len(requested_hours)

    summary_rows = []
    yearly_rows = []
    monthly_rows = []
    gap_rows = []

    for reservoir, group in df.groupby("reservoir", sort=True):
        group = group.sort_values("time")
        category = ", ".join(sorted(group["category"].dropna().astype(str).unique()))
        first_time = group["time"].min()
        last_time = group["time"].max()
        first_hour = group["hour_ts"].min()
        last_hour = group["hour_ts"].max()
        observed_hours = set(group["hour_ts"].dropna().unique())

        expected_since_first = pd.date_range(first_hour, last_hour, freq="h")
        missing_runs = _missing_runs(expected_since_first, observed_hours)
        longest_gap = missing_runs[0] if missing_runs else {"missing_hours": 0, "gap_start": "", "gap_end": ""}
        observed_since_first = len(observed_hours)
        expected_since_first_count = len(expected_since_first)
        observed_requested = len(observed_hours.intersection(set(requested_hours)))

        sources = ", ".join(sorted(group["source"].dropna().astype(str).unique()))
        summary_rows.append(
            {
                "reservoir": reservoir,
                "category": category,
                "first_observation": _fmt_ts(first_time),
                "last_observation": _fmt_ts(last_time),
                "raw_rows": int(len(group)),
                "unique_hourly_slots": int(observed_since_first),
                "duplicate_rows_same_hour": int(len(group) - observed_since_first),
                "expected_hours_first_to_last": int(expected_since_first_count),
                "missing_hours_first_to_last": int(expected_since_first_count - observed_since_first),
                "coverage_pct_first_to_last": _coverage(observed_since_first, expected_since_first_count),
                "expected_hours_2022_to_now": int(requested_expected),
                "observed_hours_2022_to_now": int(observed_requested),
                "coverage_pct_2022_to_now": _coverage(observed_requested, requested_expected),
                "longest_missing_gap_hours": int(longest_gap["missing_hours"]),
                "longest_missing_gap_start": longest_gap["gap_start"],
                "longest_missing_gap_end": longest_gap["gap_end"],
                "sources": sources,
            }
        )

        for run in missing_runs[:20]:
            gap_rows.append({"reservoir": reservoir, **run})

        for year in range(2022, global_end.year + 1):
            y_start = max(pd.Timestamp(f"{year}-01-01 00:00"), REQUEST_START)
            y_end = min(pd.Timestamp(f"{year}-12-31 23:00"), global_end)
            if y_start > y_end:
                continue
            expected = pd.date_range(y_start, y_end, freq="h")
            obs = [ts for ts in observed_hours if y_start <= ts <= y_end]
            yearly_rows.append(
                {
                    "reservoir": reservoir,
                    "year": year,
                    "expected_hours": len(expected),
                    "observed_hours": len(obs),
                    "missing_hours": len(expected) - len(obs),
                    "coverage_pct": _coverage(len(obs), len(expected)),
                    "first_observed_in_year": _fmt_ts(min(obs)) if obs else "",
                    "last_observed_in_year": _fmt_ts(max(obs)) if obs else "",
                }
            )

        cur = REQUEST_START.to_period("M")
        end_period = global_end.to_period("M")
        while cur <= end_period:
            m_start = max(cur.to_timestamp(), REQUEST_START)
            m_end = min((cur + 1).to_timestamp() - pd.Timedelta(hours=1), global_end)
            expected = pd.date_range(m_start, m_end, freq="h")
            obs = [ts for ts in observed_hours if m_start <= ts <= m_end]
            monthly_rows.append(
                {
                    "reservoir": reservoir,
                    "month": str(cur),
                    "expected_hours": len(expected),
                    "observed_hours": len(obs),
                    "missing_hours": len(expected) - len(obs),
                    "coverage_pct": _coverage(len(obs), len(expected)),
                }
            )
            cur += 1

    summary_rows.sort(key=lambda row: row["coverage_pct_first_to_last"], reverse=True)

    result = {
        "source_file": str(SOURCE),
        "request_start": _fmt_ts(REQUEST_START),
        "data_end": _fmt_ts(global_end),
        "summary": summary_rows,
        "yearly": yearly_rows,
        "monthly": monthly_rows,
        "top_missing_gaps": gap_rows,
    }
    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(OUT_JSON)
    print(json.dumps(summary_rows, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
