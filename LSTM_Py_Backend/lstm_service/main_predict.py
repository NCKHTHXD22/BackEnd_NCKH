import numpy as np
import torch
import pandas as pd
import os
from datetime import timedelta

from config.reservoirs import RESERVOIRS
from config.settings import *
from data.data_fetcher import (
    fetch_hydro_data,
    fetch_rain_data,
)
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features
)
from models.inflow_model import InflowForecastModel
from utils.scaler_utils import GlobalScaler

# Must match main_api.py exactly (31 features)
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

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
scaler = GlobalScaler()
scaler.load("artifacts/global_scaler.pkl")
_model_cache: dict = {}


def load_model(res_idx: int) -> InflowForecastModel:
    if res_idx in _model_cache:
        return _model_cache[res_idx]
    model = InflowForecastModel(
        input_size=INPUT_SIZE,
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS
    ).to(device)
    fine_tuned = f"artifacts/inflow_model_rid_{res_idx}.pt"
    global_path = "artifacts/inflow_model.pt"
    if os.path.exists(fine_tuned):
        model.load_state_dict(torch.load(fine_tuned, map_location=device, weights_only=True))
        print(f"  [Model] Fine-tuned: {fine_tuned}")
    elif os.path.exists(global_path):
        model.load_state_dict(torch.load(global_path, map_location=device, weights_only=True))
        print(f"  [Model] Global: {global_path}")
    else:
        raise FileNotFoundError(f"Khong tim thay model tai {fine_tuned} hoac {global_path}")
    model.eval()
    _model_cache[res_idx] = model
    return model


def show_menu():
    print("\n" + "="*55)
    print("   HE THONG DU BAO Q DEN (INFLOW REALTIME)")
    print("="*55)
    for k, v in RESERVOIRS.items():
        print(f"  {k:>3}  -  {v['name']}")
    print("="*55)


def predict(rid):
    if rid not in RESERVOIRS:
        print("[!] ID ho khong ton tai.")
        return

    info = RESERVOIRS[rid]
    res_idx = info["idx"]
    print(f"\n[>>] Du bao cho: {info['name']} (RID={rid}, idx={res_idx})")

    # 1. Fetch hydro
    hydro = fetch_hydro_data(rid, days=5)
    if hydro.empty:
        print("[!] Khong co du lieu thuy van.")
        return

    reference_time = hydro["time"].max()
    print(f"  [Time] Reference time: {reference_time}")

    # 2. Fetch rain (past + future)
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

    # 3. Feature engineering
    df["inflow"] = np.log1p(df["inflow"].clip(0))
    df = add_time_features(df)
    df = add_rain_features(df)
    df = add_inflow_features(df)

    # 4. Pad if insufficient history
    if len(df) < SEQ_LENGTH:
        needed = SEQ_LENGTH - len(df)
        print(f"  [WARN] Du lieu ngan ({len(df)}h). Padding them {needed}h...")
        padding = pd.concat([df.iloc[[0]]] * needed, ignore_index=True)
        df = pd.concat([padding, df], ignore_index=True)

    # 5. Future rain fallback
    if rain_future.empty:
        rain_future = pd.DataFrame({
            "time": [reference_time + timedelta(hours=i+1) for i in range(HORIZON)],
            "rain_forecast": [0.0] * HORIZON
        })
        print("  [WARN] Khong co API du bao mua -> Gia dinh 0 mm")

    # 6. Validate features
    available = [f for f in FEATURES if f in df.columns]
    if len(available) != INPUT_SIZE:
        missing = [f for f in FEATURES if f not in df.columns]
        print(f"  [ERROR] Thieu features: {missing}")
        return

    # 7. Prepare inputs
    past_seq = df[available].iloc[-SEQ_LENGTH:].values.astype(np.float32)
    past_seq = np.nan_to_num(past_seq, nan=0.0, posinf=0.0, neginf=0.0)
    past_seq = scaler.transform(past_seq[np.newaxis])[0]

    rain_vals = rain_future["rain_forecast"].values.astype(np.float32)
    if len(rain_vals) < HORIZON:
        rain_vals = np.pad(rain_vals, (0, HORIZON - len(rain_vals)), constant_values=0.0)
    future_rain = np.log1p(rain_vals[:HORIZON].reshape(-1, 1))

    # 8. Inference
    model = load_model(res_idx)
    with torch.no_grad():
        preds = model(
            torch.tensor(past_seq[None]).float().to(device),
            torch.tensor(future_rain[None]).float().to(device),
            torch.tensor([res_idx]).long().to(device)
        )

    raw_np = np.clip(preds.cpu().numpy()[0], -20.0, 20.0)
    preds_np = np.nan_to_num(np.expm1(raw_np), nan=0.0, posinf=0.0, neginf=0.0)

    # 9. Display results
    print(f"\n  [Data] DU LIEU 6 GIO GAN NHAT (reference: {reference_time})")
    print("  " + "-"*70)
    for _, row in df.tail(6).iterrows():
        print(f"  {row['time']} | Rain:{row['rain']:6.2f} mm | Inflow:{np.expm1(row['inflow']):8.1f} m3/s")

    print(f"\n  [Rain] MUA DU BAO {HORIZON} GIO TOI")
    print("  " + "-"*70)
    for _, row in rain_future.iterrows():
        print(f"  {row['time']} | Rain_forecast: {row['rain_forecast']:6.2f} mm")

    print(f"\n  [Inflow] KICH BAN Q DEN {HORIZON} GIO TOI")
    print("  " + "-"*70)
    print(f"  {'Thoi gian':<22} {'P10':>10} {'P50':>10} {'P90':>10}  (m3/s)")
    print("  " + "-"*70)
    for i, (p10, p50, p90) in enumerate(preds_np):
        t = reference_time + timedelta(hours=i+1)
        p10 = max(float(p10), 0.0)
        p50 = max(float(p50), 0.0)
        p90 = max(float(p90), 0.0)
        print(f"  {str(t):<22} {p10:>10.1f} {p50:>10.1f} {p90:>10.1f}")
    print("  " + "-"*70)
    print(f"  [OK] Hoan thanh du bao {HORIZON}h cho {info['name']}")


if __name__ == "__main__":

    show_menu()

    try:
        rid = int(input("\n=> Nhap ID ho muon du bao: "))
        predict(rid)
    except ValueError:
        print("[!] Vui long nhap so hop le.")
    except KeyboardInterrupt:
        print("\n[!] Da huy.")
