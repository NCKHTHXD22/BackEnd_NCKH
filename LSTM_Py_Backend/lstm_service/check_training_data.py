# check_training_data.py
import pandas as pd
from datetime import datetime, timedelta

from config.reservoirs import RESERVOIRS
from data.data_fetcher import fetch_hydro_data, fetch_rain_data
from config.settings import SEQ_LENGTH, HORIZON


def normalize_time(df, is_rain=False):
    if is_rain:
        return (
            pd.to_datetime(df["time"], errors="coerce", utc=True)
            .dt.tz_localize(None)
            .dt.floor("h")
        )
    else:
        return (
            pd.to_datetime(df["time"], errors="coerce")
            .dt.tz_localize(None)
            .dt.floor("h")
        )


def check_training_data(days=365):
    print("=" * 80)
    print(f"CHECK TRAINING DATA (last {days} days)")
    print(f"SEQ_LENGTH={SEQ_LENGTH}, HORIZON={HORIZON}")
    print("=" * 80)

    end = datetime.utcnow()
    start = end - timedelta(days=days)

    ok = []

    for rid, info in RESERVOIRS.items():
        print(f"\n🏞 {info['name']}")

        hydro = fetch_hydro_data(rid, days)
        rain = fetch_rain_data(info["lat"], info["lon"], days)

        if hydro is None:
            print("  ❌ Missing HYDRO")
            continue
        if rain is None:
            print("  ❌ Missing RAIN")
            continue

        print(f"  ✔ HYDRO rows: {len(hydro)}")
        print(f"  ✔ RAIN rows: {len(rain)}")

        hydro["time"] = normalize_time(hydro, False)
        rain["time"] = normalize_time(rain, True)

        df = pd.merge(rain, hydro, on="time", how="inner")
        print(f"  🔗 Rows after merge: {len(df)}")

        if len(df) < SEQ_LENGTH + HORIZON:
            print("  ⚠ Not enough data")
            continue

        print(
            f"  📊 Outflow range: "
            f"{df['outflow'].min():.2f} → {df['outflow'].max():.2f}"
        )
        ok.append(info["name"])
        print("  ✅ OK FOR TRAINING")

    print("\nSUMMARY")
    print("Reservoirs OK:", len(ok))
    for name in ok:
        print(" -", name)


if __name__ == "__main__":
    check_training_data(days=365)