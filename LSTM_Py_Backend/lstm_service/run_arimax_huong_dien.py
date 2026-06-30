"""Run ARIMAX (Python port of ArimaService.cs) on Huong Dien dataset.

Validation strategy:
- Find contiguous segments where qvao is observed (no interpolation gaps).
- For each segment >= 7 days, slide a 24h-ahead forecast every 24h.
- Compute hourly RMSE/MAE + horizon-bucketed metrics.
- Save predictions, metrics, and a flood-event detail plot.
"""
from __future__ import annotations

import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from arimax_python_port import forecast_arimax

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_CSV = os.path.join(
    SCRIPT_DIR, "Rain Data", "DATA_HYDROPOWER_2022_2026", "HuongDien_Arimax_Dataset.csv"
)
OUT_DIR = os.path.join(SCRIPT_DIR, "outputs", "HuongDien_Arimax_v2")
os.makedirs(OUT_DIR, exist_ok=True)

HORIZON = 24
WARMUP_HOURS = 24 * 7
STRIDE = 24
MIN_SEGMENT_HOURS = WARMUP_HOURS + HORIZON + 24
RESERVOIR_ID = 20


def find_contiguous_segments(df: pd.DataFrame, col: str = "qvao", min_len: int = MIN_SEGMENT_HOURS):
    valid = df[col].notna().values
    segments = []
    start = None
    for i, v in enumerate(valid):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                segments.append((start, i))
            start = None
    if start is not None and len(valid) - start >= min_len:
        segments.append((start, len(valid)))
    return segments


def main() -> int:
    df = pd.read_csv(INPUT_CSV, parse_dates=["time"]).sort_values("time").reset_index(drop=True)
    print(f"[OK] Loaded {len(df)} rows ({df['time'].min()} -> {df['time'].max()})")
    print(f"     qvao valid: {df['qvao'].notna().sum()} ({df['qvao'].notna().mean()*100:.1f}%)")

    segments = find_contiguous_segments(df)
    print(f"[OK] Found {len(segments)} contiguous segments >= {MIN_SEGMENT_HOURS}h")
    for s, e in segments:
        print(f"    {df.loc[s, 'time']} -> {df.loc[e-1, 'time']}  ({e - s}h)")

    all_records = []
    for s, e in segments:
        seg = df.iloc[s:e].reset_index(drop=True)
        flow = seg["qvao"].to_numpy(dtype=float)
        rain = seg["rain_lake"].to_numpy(dtype=float)

        t = WARMUP_HOURS
        while t + HORIZON <= len(seg):
            flow_hist = flow[:t].tolist()
            rain_hist = rain[:t].tolist()
            rain_future = rain[t:t + HORIZON].tolist()
            preds = forecast_arimax(flow_hist, rain_hist, rain_future, HORIZON, reservoir_id=RESERVOIR_ID)
            for h in range(HORIZON):
                all_records.append(
                    {
                        "issue_time": seg.loc[t - 1, "time"],
                        "target_time": seg.loc[t + h, "time"],
                        "horizon_h": h + 1,
                        "pred": preds[h],
                        "actual": float(flow[t + h]),
                        "rain_lake": float(rain[t + h]),
                    }
                )
            t += STRIDE

    if not all_records:
        print("[ERROR] No forecasts produced (segments too short)")
        return 1

    res = pd.DataFrame(all_records)
    res["err"] = res["pred"] - res["actual"]
    res["abs_err"] = res["err"].abs()
    res["sq_err"] = res["err"] ** 2

    out_csv = os.path.join(OUT_DIR, "predictions.csv")
    res.to_csv(out_csv, index=False)

    overall = {
        "n": len(res),
        "RMSE": float(np.sqrt(res["sq_err"].mean())),
        "MAE": float(res["abs_err"].mean()),
        "Bias": float(res["err"].mean()),
        "actual_mean": float(res["actual"].mean()),
        "actual_max": float(res["actual"].max()),
    }
    by_h = res.groupby("horizon_h").agg(
        RMSE=("sq_err", lambda x: float(np.sqrt(np.mean(x)))),
        MAE=("abs_err", "mean"),
        Bias=("err", "mean"),
        n=("err", "size"),
    ).reset_index()

    print()
    print("=== Overall ARIMAX (24h-ahead, rolling) ===")
    for k, v in overall.items():
        print(f"  {k:>11s}: {v:,.3f}")
    print()
    print("=== Metrics by horizon ===")
    print(by_h.to_string(index=False))

    flood_events = res[res["actual"] > 500.0]
    if not flood_events.empty:
        worst = flood_events.loc[flood_events["abs_err"].idxmax()]
        win_start = pd.Timestamp(worst["issue_time"]) - pd.Timedelta(hours=12)
        win_end = pd.Timestamp(worst["target_time"]) + pd.Timedelta(hours=6)

        full = df[(df["time"] >= win_start) & (df["time"] <= win_end)]
        sample_issue = pd.Timestamp(worst["issue_time"])
        flood_run = res[res["issue_time"] == sample_issue]

        fig, ax = plt.subplots(figsize=(11, 5))
        ax.plot(full["time"], full["qvao"], color="#1f77b4", lw=2, label="Actual qvao")
        if not flood_run.empty:
            ax.plot(flood_run["target_time"], flood_run["pred"], color="#d62728", lw=2,
                    marker="o", markersize=4, label="ARIMAX 1..24h forecast")
            ax.axvline(sample_issue, color="grey", ls="--", lw=1)
        ax2 = ax.twinx()
        ax2.bar(full["time"], full["rain_lake"], width=0.04, color="#9467bd", alpha=0.4, label="rain_lake")
        ax.set_title(f"Huong Dien — flood-event forecast (issued {sample_issue})")
        ax.set_ylabel("Inflow Q (m3/s)")
        ax2.set_ylabel("Rain (mm/h)")
        ax.legend(loc="upper left")
        ax2.legend(loc="upper right")
        fig.tight_layout()
        png = os.path.join(OUT_DIR, "flood_event_sample.png")
        fig.savefig(png, dpi=120)
        plt.close(fig)
        print(f"\n[OK] Sample flood forecast plot: {png}")

    by_h.to_csv(os.path.join(OUT_DIR, "metrics_by_horizon.csv"), index=False)
    with open(os.path.join(OUT_DIR, "overall_metrics.txt"), "w", encoding="utf-8") as fh:
        for k, v in overall.items():
            fh.write(f"{k}: {v:,.3f}\n")
    print(f"\n[OK] Results dir: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
