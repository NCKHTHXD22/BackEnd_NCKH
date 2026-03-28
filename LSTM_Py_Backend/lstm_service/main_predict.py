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
    fetch_rain_forecast
)
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features
)
from models.inflow_model import InflowForecastModel
from utils.scaler_utils import GlobalScaler


def show_menu():
    print("\n===== HỆ THỐNG DỰ BÁO Q ĐẾN (INFLOW REALTIME) =====\n")
    for k, v in RESERVOIRS.items():
        print(f"{k:>3}  -  {v['name']}")


def predict(rid):

    if rid not in RESERVOIRS:
        print("[!] ID ho khong ton tai.")
        return

    info = RESERVOIRS[rid]
    print(f"\n[*] Dang tai du lieu cho {info['name']}...\n")

    hydro = fetch_hydro_data(rid, days=60)
    rain = fetch_rain_data(info["lat"], info["lon"], days=60)

    if hydro.empty:
        print("[!] Khong co du lieu thuy van.")
        return

    if rain.empty:
        rain = pd.DataFrame(columns=["time", "rain"])

    df = pd.merge(hydro, rain, on="time", how="left")
    df["rain"] = df["rain"].fillna(0)

    df["inflow"] = np.log1p(df["inflow"].clip(0))

    df = add_time_features(df)
    df = add_rain_features(df)
    df = add_inflow_features(df)

    df = df.dropna()

    if len(df) < SEQ_LENGTH:
        print(f"[!] Khong du du lieu. Co {len(df)} dong, can {SEQ_LENGTH}.")
        return

    reference_time = df["time"].max()

    # 🔥 FETCH FORECAST ALIGN TIME
    rain_future = fetch_rain_forecast(
        info["lat"],
        info["lon"],
        reference_time,
        hours=HORIZON
    )

    if rain_future.empty:
        # Instead of 0, apply an exponential decay to the last known rainfall
        # to simulate a realistic scenario if forecasting fails.
        print("[!] Khong co API du bao mua -> Gia dinh mua giam dan tu hien tai.")
        last_rain = df["rain"].iloc[-1] if not df["rain"].empty else 0.0
        
        simulated_rain = []
        decay_factor = 0.7  # Giảm 30% mỗi giờ
        for i in range(HORIZON):
            last_rain = last_rain * decay_factor
            simulated_rain.append(last_rain if last_rain > 0.1 else 0.0)
            
        rain_future = pd.DataFrame({
            "time": [reference_time + timedelta(hours=i+1) for i in range(HORIZON)],
            "rain_forecast": simulated_rain
        })

    # --- FEATURES DEFINITION (MUST MATCH training/dataset_builder.py: 31 features) ---
    features = [
        "rain", "rain_3h", "rain_6h", "rain_12h", "rain_24h",
        "rain_48h", "rain_72h", "rain_96h",
        "rain_intensity", "rain_12h_std", "rain_24h_max",
        "rain_lag_1", "rain_lag_3", "rain_lag_6", "rain_lag_12", "rain_lag_24",
        "inflow", "inflow_prev", "inflow_diff", "inflow_diff_2",
        "inflow_3h_avg", "inflow_6h_avg", "inflow_12h_avg", "inflow_24h_avg",
        "rain_inflow_interaction",
        "hour_sin", "hour_cos", "doy_sin", "doy_cos", "month_sin", "month_cos"
    ]

    past_seq = df[features].iloc[-SEQ_LENGTH:].values

    scaler = GlobalScaler()
    scaler.load("artifacts/global_scaler.pkl")
    past_seq = scaler.transform(past_seq[np.newaxis])[0]

    # Future Rain log-transform (Important: must match training logic)
    future_rain = np.log1p(rain_future["rain_forecast"].values.reshape(-1,1))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = InflowForecastModel(
        input_size=len(features),
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS
    ).to(device)

    # 🔥 DYNAMIC MODEL LOADING: Fine-tuned Version Preferred
    res_idx = info["idx"]
    fine_tuned_path = f"artifacts/inflow_model_rid_{res_idx}.pt"
    global_model_path = "artifacts/inflow_model.pt"

    if os.path.exists(fine_tuned_path):
        print(f"[Model] Load Fine-tuned Model: {fine_tuned_path}")
        model.load_state_dict(torch.load(fine_tuned_path, map_location=device))
    else:
        print(f"[Model] Load Global Model: {global_model_path}")
        model.load_state_dict(torch.load(global_model_path, map_location=device))

    model.eval()

    with torch.no_grad():
        preds = model(
            torch.tensor(past_seq[None]).float().to(device),
            torch.tensor(future_rain[None]).float().to(device),
            torch.tensor([res_idx]).long().to(device)
        )

    preds = np.expm1(preds.cpu().numpy()[0])

    print(f"[Time] Thoi diem du lieu moi nhat: {reference_time}")
    print("-"*80)

    print("\n[Data] DU LIEU 6 GIO GAN NHAT")
    print("-"*80)

    for _, row in df.tail(6).iterrows():
        print(
            f"{row['time']} | "
            f"Rain:{row['rain']:6.1f} | "
            f"Inflow:{np.expm1(row['inflow']):8.1f}"
        )

    print("\n[Rain] MUA DU BAO 12 GIO TOI")
    print("-"*80)

    for _, row in rain_future.iterrows():
        print(f"{row['time']} | Rain_forecast:{row['rain_forecast']:6.1f}")

    print("\n[Inflow] KICH BAN Q DEN 12 GIO TOI")
    print("-"*80)

    for i, (p10, p50, p90) in enumerate(preds):
        t = reference_time + timedelta(hours=i+1)
        print(
            f"{t} | "
            f"P10:{p10:8.1f} | "
            f"P50:{p50:8.1f} | "
            f"P90:{p90:8.1f}"
        )

    print("-"*80)


if __name__ == "__main__":

    show_menu()

    try:
        rid = int(input("\n=> Nhap ID ho muon du bao: "))
        predict(rid)
    except ValueError:
        print("[!] Vui long nhap so hop le.")