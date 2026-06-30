import numpy as np
import torch
import pandas as pd
import os
from datetime import timedelta

from config.reservoirs import RESERVOIRS
from config.settings import *
from data.data_fetcher import (
    fetch_hydro_data, fetch_rain_data,
    fetch_meteo_history, fetch_rain_forecast_idw,
)
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features,
    add_reservoir_features,
    add_meteo_features,
)
from models.inflow_model import InflowForecastModel
from models.model_loader import load_model_from_checkpoint
from utils.scaler_utils import GlobalScaler
from operation import get_operation_calculator

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
scaler = GlobalScaler()
scaler.load("artifacts/global_scaler.pkl")

# Will be populated when loading model
INPUT_SIZE = None
FEATURES = []
model_n_future = 3

_model_cache: dict = {}


def load_model(res_idx: int) -> InflowForecastModel:
    global INPUT_SIZE, FEATURES, model_n_future
    if res_idx in _model_cache:
        return _model_cache[res_idx]

    fine_tuned = f"artifacts/inflow_model_rid_{res_idx}.pt"
    global_path = "artifacts/inflow_model.pt"
    
    model_path = fine_tuned if os.path.exists(fine_tuned) else global_path
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Khong tim thay model tai {fine_tuned} hoac {global_path}")
        
    model, features, n_fut = load_model_from_checkpoint(model_path, device)
    print(f"  [Model] Loaded from {model_path} with {len(features)} features and n_future={n_fut}")
    
    # Store global features to verify
    INPUT_SIZE = len(features)
    FEATURES = features
    model_n_future = n_fut
    
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

    # 1. Fetch hydro (11 ngay = 264h > SEQ_LENGTH=240h)
    hydro = fetch_hydro_data(rid, days=11)
    if hydro.empty:
        print("[!] Khong co du lieu thuy van.")
        return

    reference_time = hydro["time"].max()
    print(f"  [Time] Reference time: {reference_time}")

    # 2. Fetch rain past + meteo history + rain forecast IDW
    rain_all    = fetch_rain_data(rid, info["lat"], info["lon"],
                                  reference_time=reference_time, days=11)
    meteo_hist  = fetch_meteo_history(info["lat"], info["lon"], days=11)
    rain_fc_df  = fetch_rain_forecast_idw(res_idx, reference_time, hours=HORIZON)

    # Merge rain
    if rain_all.empty:
        df = hydro.copy()
        df["rain"] = 0.0
    else:
        rain_past = rain_all[rain_all["time"] <= reference_time]
        df = pd.merge(hydro, rain_past, on="time", how="left")
        df["rain"] = df["rain"].fillna(0.0)

    # Merge meteo history (temperature, relative_humidity, et0, wind_speed)
    if not meteo_hist.empty:
        df = pd.merge(df, meteo_hist, on="time", how="left")

    # 3. Feature engineering
    df["inflow"] = np.sqrt(df["inflow"].clip(0))
    for col in ("water_level", "outflow"):
        if col not in df.columns:
            df[col] = np.nan
    df = add_time_features(df)
    df = add_rain_features(df)
    df = add_inflow_features(df)
    df = add_reservoir_features(df)
    df = add_meteo_features(df)

    # 4. Pad neu lich su ngan hon SEQ_LENGTH
    if len(df) < SEQ_LENGTH:
        needed = SEQ_LENGTH - len(df)
        print(f"  [WARN] Du lieu ngan ({len(df)}h). Padding them {needed}h...")
        padding = pd.concat([df.iloc[[0]]] * needed, ignore_index=True)
        df = pd.concat([padding, df], ignore_index=True)

    # Load model to set INPUT_SIZE and FEATURES
    model = load_model(res_idx)

    # Ensure optional features exist
    for f in FEATURES:
        if f not in df.columns:
            df[f] = 0.0

    # 5. Kiem tra features
    available = [f for f in FEATURES if f in df.columns]
    if len(available) != INPUT_SIZE:
        missing = [f for f in FEATURES if f not in df.columns]
        print(f"  [ERROR] Thieu features: {missing} (can {INPUT_SIZE}, co {len(available)})")
        return

    # 6. Chuan hoa X_past
    past_seq = df[available].iloc[-SEQ_LENGTH:].values.astype(np.float32)
    past_seq = np.nan_to_num(past_seq, nan=0.0, posinf=0.0, neginf=0.0)
    past_seq = scaler.transform(past_seq[np.newaxis])[0]

    # 7. Xay dung X_future tu mua du bao IDW [rain_fc, rain_fc_6h, rain_fc_24h]
    x_future_tensor = None
    if model_n_future > 0:
        if not rain_fc_df.empty and len(rain_fc_df) >= HORIZON:
            rain_fc     = rain_fc_df["rain_fc"].values[:HORIZON].astype(np.float32)
            rain_fc_6h  = rain_fc_df["rain_fc_6h"].values[:HORIZON].astype(np.float32)
            rain_fc_24h = rain_fc_df["rain_fc_24h"].values[:HORIZON].astype(np.float32)
            x_fut = np.stack([rain_fc, rain_fc_6h, rain_fc_24h], axis=1)  # (HORIZON, 3)
        else:
            x_fut = np.zeros((HORIZON, model_n_future), dtype=np.float32)
        x_future_tensor = torch.tensor(x_fut[None]).float().to(device)

    # 8. Inference
    with torch.no_grad():
        preds = model(
            torch.tensor(past_seq[None]).float().to(device),
            torch.tensor([res_idx]).long().to(device),
            x_future=x_future_tensor,
        )

    raw_np = np.clip(preds.cpu().numpy()[0], 0.0, 500.0)
    preds_np = raw_np ** 2   # inverse sqrt
    preds_np = np.sort(preds_np, axis=1)

    # 8. Hien thi lich su 6 gio gan nhat
    print(f"\n  [Data] DU LIEU 6 GIO GAN NHAT (reference: {reference_time})")
    print("  " + "-"*70)
    for _, row in df.tail(6).iterrows():
        print(f"  {row['time']} | Rain:{row['rain']:6.2f} mm | Inflow:{float(row['inflow'])**2:8.1f} m3/s")

    # 9. Hien thi du bao Q den
    print(f"\n  [Inflow] KICH BAN Q DEN DU BAO {HORIZON} GIO TOI")
    print("  " + "-"*70)
    print(f"  {'Thoi gian':<22} {'P10':>10} {'P50':>10} {'P90':>10}  (m3/s)")
    print("  " + "-"*70)
    p50_series = []
    for i, (p10, p50, p90) in enumerate(preds_np):
        t = reference_time + timedelta(hours=i+1)
        p10 = max(float(p10), 0.0)
        p50 = max(float(p50), 0.0)
        p90 = max(float(p90), 0.0)
        p50_series.append(p50)
        print(f"  {str(t):<22} {p10:>10.1f} {p50:>10.1f} {p90:>10.1f}")
    print("  " + "-"*70)

    # 10. Tinh toan van hanh ho (QD 1865) — chi cho 5 ho chinh
    OPERATION_RIDS = {1, 2, 3, 4, 9}
    if rid not in OPERATION_RIDS:
        print(f"\n  [INFO] Ho rid={rid} khong co quy trinh van hanh trong QD 1865 -> Bo qua tinh Q xa.")
    else:
        Z_current = None
        for col in ["water_level", "Z", "z", "level"]:
            if col in hydro.columns and not hydro[col].isna().all():
                Z_current = float(hydro[col].dropna().iloc[-1])
                print(f"\n  [Z] Muc nuoc hien tai (tu cot '{col}'): {Z_current:.2f} m")
                break

        if Z_current is None:
            try:
                z_input = input("\n  [?] Nhap Z hien tai cua ho (m) [Enter de bo qua]: ").strip()
                Z_current = float(z_input) if z_input else None
            except (ValueError, EOFError):
                Z_current = None

        if Z_current is None:
            print("  [WARN] Khong co Z hien tai -> Bo qua tinh toan van hanh.")
        else:
            try:
                calc = get_operation_calculator()
                op_results = calc.calculate_forecast_series(
                    rid=rid,
                    Z_initial=Z_current,
                    Q_inflow_series=p50_series,
                    start_time=reference_time,
                    delta_t_hours=1.0,
                    Q_out_initial=0.0
                )

                print(f"\n  {'='*75}")
                print(f"  VAN HANH HO DU BAO - Can cu QD 1865/QD-TTg")
                print(f"  {'='*75}")
                print(f"  Ho           : {info['name']}")
                print(f"  Z hien tai   : {Z_current:.2f} m")
                print(f"  Thoi diem    : {reference_time}")
                print(f"  Mua van hanh : {op_results[0].season.value.upper() if op_results else 'N/A'}")
                if op_results and op_results[0].dry_period:
                    print(f"  Thoi ky can  : {op_results[0].dry_period.value}")
                print(f"  {'='*75}")
                print(f"  {'Gio':<12} {'Ngay':<13} {'Q_den(m3/s)':>13} {'Q_xa KN(m3/s)':>15} {'Z_du_bao(m)':>13} {'Mode':<18} {'OK?'}")
                print(f"  {'-'*95}")

                for d, r in enumerate(op_results):
                    step_dt = reference_time + timedelta(hours=d + 1)
                    print(f"  {str(step_dt.time())[:5]:<12} {str(step_dt.date()):<13} "
                          f"{p50_series[d]:>13.1f} {r.Q_discharge:>15.1f} "
                          f"{r.Z_predicted:>13.2f} {r.operation_mode.value:<18} "
                          f"{'OK' if r.is_compliant else 'VI PHAM!'}")

                print(f"  {'-'*95}")

                all_violations = [v for r in op_results for v in r.violations]
                all_warnings   = [w for r in op_results for w in r.warnings]

                if all_violations:
                    print(f"\n  [!!! VI PHAM !!!]")
                    for v in all_violations:
                        print(f"    {v}")
                if all_warnings:
                    print(f"\n  [CANH BAO]")
                    for w in all_warnings[:5]:
                        print(f"    {w}")
                if not all_violations and not all_warnings:
                    print(f"  [OK] Tat ca {len(op_results)} buoc VAN HANH TUAN THU QD 1865.")

                print(f"\n  [Range Q xa khuyen nghi]")
                for d, r in enumerate(op_results):
                    step_dt = reference_time + timedelta(hours=d + 1)
                    qmin, qmax = r.Q_discharge_range
                    print(f"    {str(step_dt.time())[:5]} {str(step_dt.date())}: [{qmin:.1f}, {qmax:.1f}] m3/s")

            except Exception as e:
                print(f"\n  [ERROR] Loi tinh toan van hanh: {e}")
                import traceback
                traceback.print_exc()

    print(f"\n  [OK] Hoan thanh du bao {HORIZON}h cho {info['name']}")


if __name__ == "__main__":
    show_menu()
    try:
        rid = int(input("\n=> Nhap ID ho muon du bao: "))
        predict(rid)
    except ValueError:
        print("[!] Vui long nhap so hop le.")
    except KeyboardInterrupt:
        print("\n[!] Da huy.")
