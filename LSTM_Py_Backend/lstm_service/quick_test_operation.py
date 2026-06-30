"""
quick_test_operation.py
========================
Script test nhanh: chạy predict + operation cho 1 hồ với Z nhập thủ công.
Chạy: .\venv\Scripts\python.exe quick_test_operation.py

Dùng để kiểm tra kết quả Q dự báo đến, Q xả dự báo, Z dự báo.
"""

import sys
import numpy as np
import torch
import pandas as pd
import os
from datetime import timedelta, datetime

from config.reservoirs import RESERVOIRS
from config.settings import *
from data.data_fetcher import fetch_hydro_data, fetch_rain_data
from features.feature_engineering import add_time_features, add_rain_features, add_inflow_features
from models.inflow_model import InflowForecastModel
from utils.scaler_utils import GlobalScaler
from operation import get_operation_calculator

INPUT_SIZE = 31
FEATURES = [
    "rain", "rain_3h", "rain_6h", "rain_12h", "rain_24h",
    "rain_48h", "rain_72h", "rain_96h",
    "rain_intensity", "rain_12h_std", "rain_24h_max",
    "rain_lag_1", "rain_lag_3", "rain_lag_6", "rain_lag_12", "rain_lag_24",
    "inflow", "inflow_prev", "inflow_diff", "inflow_diff_2",
    "inflow_3h_avg", "inflow_6h_avg", "inflow_12h_avg", "inflow_24h_avg",
    "rain_inflow_interaction",
    "hour_sin", "hour_cos", "doy_sin", "doy_cos", "month_sin", "month_cos"
]

OPERATION_RIDS = {1: "A_VUONG", 2: "DAK_MI_4", 3: "SONG_BUNG_4", 4: "SONG_TRANH_2", 9: "SONG_BUNG_2"}

LINE = "=" * 80
SEP  = "-" * 80


def print_header(title):
    print(f"\n{LINE}")
    print(f"  {title}")
    print(LINE)


def run_test(rid: int, Z_current_override: float = None):
    if rid not in RESERVOIRS:
        print(f"[!] Khong tim thay rid={rid}")
        return

    info = RESERVOIRS[rid]
    res_idx = info["idx"]

    print_header(f"HO: {info['name']}  |  RID={rid}  |  idx={res_idx}")

    # ── Load model ──────────────────────────────────────────────────────────
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    scaler = GlobalScaler()
    scaler.load("artifacts/global_scaler.pkl")

    model = InflowForecastModel(
        input_size=INPUT_SIZE, hidden_size=HIDDEN_SIZE,
        horizon=HORIZON, quantiles=QUANTILES, num_reservoirs=NUM_RESERVOIRS
    ).to(device)

    fine_tuned = f"artifacts/inflow_model_rid_{res_idx}.pt"
    global_path = "artifacts/inflow_model.pt"
    if os.path.exists(fine_tuned):
        model.load_state_dict(torch.load(fine_tuned, map_location=device, weights_only=True))
        model_label = f"fine-tuned (rid_{res_idx})"
    elif os.path.exists(global_path):
        model.load_state_dict(torch.load(global_path, map_location=device, weights_only=True))
        model_label = "global"
    else:
        print("[!] Khong tim thay model!")
        return
    model.eval()
    print(f"  Model: {model_label} | Device: {device}")

    # ── Fetch data ───────────────────────────────────────────────────────────
    hydro = fetch_hydro_data(rid, days=5)
    if hydro.empty:
        print("[!] Khong co du lieu thuy van.")
        return

    reference_time = hydro["time"].max()
    print(f"  Reference time: {reference_time}")
    print(f"  Hydro rows: {len(hydro)}")

    # Z current
    Z_current = Z_current_override
    if Z_current is None:
        for col in ["water_level", "Z", "z", "level"]:
            if col in hydro.columns and not hydro[col].isna().all():
                Z_current = float(hydro[col].dropna().iloc[-1])
                print(f"  Z hien tai (tu DB, cot '{col}'): {Z_current:.2f} m")
                break

    if Z_current is None:
        print(f"  [WARN] Khong co Z trong DB -> Dung Z mac dinh (tuong duong MNDBT).")
        Z_current = {1: 376.0, 2: 253.0, 3: 217.0, 4: 170.0, 9: 599.0}.get(rid, 200.0)
        print(f"  Z su dung: {Z_current:.2f} m")

    # ── Rain ─────────────────────────────────────────────────────────────────
    rain_all = fetch_rain_data(rid, info["lat"], info["lon"], reference_time=reference_time, days=5)
    if rain_all.empty:
        df = hydro.copy()
        df["rain"] = 0.0
        rain_future = pd.DataFrame()
    else:
        rain_past = rain_all[rain_all["time"] <= reference_time]
        df = pd.merge(hydro, rain_past, on="time", how="left")
        df["rain"] = df["rain"].fillna(0.0)
        rain_future = rain_all[rain_all["time"] > reference_time].copy()
        rain_future = rain_future.rename(columns={"rain": "rain_forecast"})
    df["inflow"] = np.sqrt(df["inflow"].clip(0))
    df = add_time_features(df)
    df = add_rain_features(df)
    df = add_inflow_features(df)

    if len(df) < SEQ_LENGTH:
        needed = SEQ_LENGTH - len(df)
        padding = pd.concat([df.iloc[[0]]] * needed, ignore_index=True)
        df = pd.concat([padding, df], ignore_index=True)
        print(f"  [WARN] Padding them {needed}h du lieu.")

    if rain_future.empty:
        rain_future = pd.DataFrame({
            "time": [reference_time + timedelta(hours=i+1) for i in range(HORIZON)],
            "rain_forecast": [0.0] * HORIZON
        })
        print("  [WARN] Khong co du bao mua -> Gia dinh 0mm")

    available = [f for f in FEATURES if f in df.columns]
    past_seq = df[available].iloc[-SEQ_LENGTH:].values.astype(np.float32)
    past_seq = np.nan_to_num(past_seq, nan=0.0, posinf=0.0, neginf=0.0)
    past_seq = scaler.transform(past_seq[np.newaxis])[0]

    rain_vals = rain_future["rain_forecast"].values.astype(np.float32)
    if len(rain_vals) < HORIZON:
        rain_vals = np.pad(rain_vals, (0, HORIZON - len(rain_vals)), constant_values=0.0)
    future_rain = rain_vals[:HORIZON].reshape(-1, 1)

    with torch.no_grad():
        preds = model(
            torch.tensor(past_seq[None]).float().to(device),
            torch.tensor(future_rain[None]).float().to(device),
            torch.tensor([res_idx]).long().to(device)
        )

    raw_np   = np.clip(preds.cpu().numpy()[0], -20.0, 20.0)
    preds_np = np.nan_to_num(np.square(raw_np), nan=0.0, posinf=0.0, neginf=0.0)
    preds_np = np.sort(preds_np, axis=1)   # guarantee p10 <= p50 <= p90

    # ─────────────────────────────────────────────────────────────────────────
    # BANG 1: Q DEN DU BAO (LSTM output)
    # ─────────────────────────────────────────────────────────────────────────
    print_header(f"[BANG 1] Q DEN DU BAO {HORIZON}h TOI (LSTM)")
    print(f"  {'Thoi gian':<25} {'P10 (m3/s)':>12} {'P50 (m3/s)':>12} {'P90 (m3/s)':>12}")
    print(f"  {SEP}")

    p50_series = []
    for i, (p10, p50, p90) in enumerate(preds_np):
        t    = reference_time + timedelta(hours=i + 1)
        p10v = max(float(p10), 0.0)
        p50v = max(float(p50), 0.0)
        p90v = max(float(p90), 0.0)
        p50_series.append(p50v)
        print(f"  {str(t):<25} {p10v:>12.1f} {p50v:>12.1f} {p90v:>12.1f}")

    print(f"  {SEP}")
    print(f"  Q_den P50 TB: {np.mean(p50_series):.1f} m3/s | Max: {max(p50_series):.1f} | Min: {min(p50_series):.1f}")

    # ─────────────────────────────────────────────────────────────────────────
    # BANG 2: Q XA + Z DU BAO (Operation Engine)
    # ─────────────────────────────────────────────────────────────────────────
    if rid not in OPERATION_RIDS:
        print(f"\n  Ho rid={rid} khong nam trong QD 1865. Khong co bang van hanh.")
        return

    print_header(f"[BANG 2] VAN HANH DU BAO - QD 1865/QD-TTg")
    print(f"  Ho           : {info['name']}")
    print(f"  Z hien tai   : {Z_current:.2f} m")
    print(f"  Thoi diem    : {reference_time}")

    # Nhom P50 thanh buoc 1h (Hourly Operation)
    step_size     = 1.0
    n_steps       = len(p50_series)
    Q_hourly_series = p50_series

    # Giả lập Q_out_initial từ hồ (chúng ta có thể lấy Q_out cuối từ DB, ở đây tạm gán 0.0 để thấy hiệu ứng smoothing từ đầu)
    Q_out_initial = 0.0 

    calc       = get_operation_calculator()
    op_results = calc.calculate_forecast_series(
        rid=rid,
        Z_initial=Z_current,
        Q_inflow_series=Q_hourly_series,
        start_time=reference_time,
        delta_t_hours=step_size,
        Q_out_initial=Q_out_initial
    )

    first = op_results[0] if op_results else None
    if first:
        print(f"  Mua van hanh : {first.season.value.upper()}")
        if first.dry_period:
            print(f"  Thoi ky      : {first.dry_period.value}")
        print(f"  Trang thai MN: {first.water_level_status.value}")

    print(f"\n  {SEP}")
    print(f"  {'Giờ':<12} {'Ngay':<13} {'Q_den':>10} {'Q_xa KN':>10} {'Q_min':>8} {'Q_max':>8} {'Z_dbao':>10} {'Mode':<18} Status")
    print(f"  {SEP}")

    for d, r in enumerate(op_results):
        step_dt  = reference_time + timedelta(hours=(d + 1) * step_size)
        q_in     = Q_hourly_series[d]
        q_out    = r.Q_discharge
        q_min, q_max = r.Q_discharge_range
        z_pred   = r.Z_predicted
        mode     = r.operation_mode.value
        ok_str   = "✓ OK" if r.is_compliant else "✗ VI PHAM"

        print(f"  {str(step_dt.time())[:5]:<12} {str(step_dt.date()):<13} {q_in:>10.1f} {q_out:>10.1f} {q_min:>8.1f} {q_max:>8.1f} {z_pred:>10.2f} {mode:<18} {ok_str}")

    print(f"  {SEP}")

    # Tong ket
    z_final = op_results[-1].Z_predicted if op_results else Z_current
    all_v   = [v for r in op_results for v in r.violations]
    all_w   = [w for r in op_results for w in r.warnings]
    all_n   = [n for r in op_results for n in r.notes]

    print(f"\n  TOM TAT:")
    print(f"    Z ban dau       : {Z_current:.2f} m")
    print(f"    Z cuoi du bao   : {z_final:.2f} m  (delta: {z_final - Z_current:+.2f} m)")
    print(f"    Q_den TB (P50)  : {np.mean(Q_hourly_series):.1f} m3/s")
    print(f"    Q_xa TB KN      : {np.mean([r.Q_discharge for r in op_results]):.1f} m3/s")
    print(f"    So vi pham      : {len(all_v)}")
    print(f"    So canh bao     : {len(all_w)}")

    if all_v:
        print(f"\n  !!! VI PHAM !!!")
        for v in all_v:
            print(f"    {v}")

    if all_w:
        print(f"\n  CANH BAO:")
        for w in all_w[:5]:
            print(f"    {w}")

    if all_n:
        print(f"\n  GHI CHU VAN HANH:")
        seen = set()
        for n in all_n:
            if n not in seen:
                print(f"    - {n}")
                seen.add(n)


if __name__ == "__main__":
    # ── Chon ho ─────────────────────────────────────────────────────────────
    print("\n" + LINE)
    print("  TEST NHANH: Q DEN + Q XA + Z DU BAO")
    print("  Can cu: QD 1865/QD-TTg")
    print(LINE)
    print("\n  Danh sach ho co quy trinh van hanh:")
    for rid_k, key in OPERATION_RIDS.items():
        name = RESERVOIRS.get(rid_k, {}).get("name", "?")
        print(f"    {rid_k:>3}  -  {name}")

    try:
        rid_in = int(input("\n=> Nhap RID ho (hoac Enter cho ho A Vuong=1): ") or "1")
    except (ValueError, EOFError):
        rid_in = 1

    Z_override = None
    try:
        z_in = input("=> Nhap Z hien tai (m) [Enter de tu dong lay tu DB]: ").strip()
        if z_in:
            Z_override = float(z_in)
    except (ValueError, EOFError):
        Z_override = None

    run_test(rid_in, Z_override)
