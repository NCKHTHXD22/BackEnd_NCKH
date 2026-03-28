import os
import torch
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
import pandas as pd

from config.reservoirs import RESERVOIRS
from config.settings import *
from models.inflow_model import InflowForecastModel
from utils.scaler_utils import GlobalScaler
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

app = FastAPI(title="LSTM Inflow Prediction API", version="2.0.0")

# ─── CONSTANTS ────────────────────────────────────────────────────────────────
# Must match dataset_builder.py exactly (31 features)
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


@app.on_event("startup")
async def startup_event():
    """Load only the scaler on startup. Models are loaded on-demand to save RAM."""
    try:
        scaler.load("artifacts/global_scaler.pkl")
        print(f"✅ Scaler loaded. Device: {device}. Models will be loaded on-demand.")
    except Exception as e:
        print(f"❌ Error loading scaler: {e}")


def load_model_for_reservoir(res_idx: int) -> InflowForecastModel:
    """Load the best available model for a given reservoir index."""
    model = InflowForecastModel(
        input_size=INPUT_SIZE,
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS
    ).to(device)

    fine_tuned_path = f"artifacts/inflow_model_rid_{res_idx}.pt"
    global_path = "artifacts/inflow_model.pt"

    if os.path.exists(fine_tuned_path):
        model.load_state_dict(torch.load(fine_tuned_path, map_location=device))
        print(f"  [Model] Loaded fine-tuned: {fine_tuned_path}")
    elif os.path.exists(global_path):
        model.load_state_dict(torch.load(global_path, map_location=device))
        print(f"  [Model] Loaded global: {global_path}")
    else:
        raise FileNotFoundError(f"No model found at {fine_tuned_path} or {global_path}")

    model.eval()
    return model


class PredictRequest(BaseModel):
    rid: int


@app.get("/health")
async def health_check():
    return {"status": "ok", "device": str(device), "features": INPUT_SIZE}


@app.post("/predict")
async def get_prediction(req: PredictRequest):
    rid = req.rid
    if rid not in RESERVOIRS:
        raise HTTPException(status_code=404, detail=f"Reservoir {rid} not found")

    info = RESERVOIRS[rid]
    res_idx = info["idx"]

    try:
        print(f"\n🔄 Predicting for Reservoir {rid} ({info['name']})...")

        # ── 1. Fetch hydro data (72h lookback for features) ──────────────────
        hydro = fetch_hydro_data(rid, days=5)
        if hydro.empty:
            raise HTTPException(status_code=400, detail=f"No hydro data for reservoir {rid}")

        # ── 2. Fetch archive rain (IDW or lat/lon based) ──────────────────────
        rain = fetch_rain_data(info["lat"], info["lon"], days=5)

        # ── 3. Merge and build feature dataframe ─────────────────────────────
        if rain.empty:
            df = hydro.copy()
            df["rain"] = 0.0
        else:
            df = pd.merge(hydro, rain, on="time", how="left")
            df["rain"] = df["rain"].fillna(0.0)

        df["inflow"] = np.log1p(df["inflow"].clip(0))

        df = add_time_features(df)
        df = add_rain_features(df)
        df = add_inflow_features(df)
        df = df.dropna()

        if len(df) < SEQ_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient data: got {len(df)} rows, need {SEQ_LENGTH}"
            )

        reference_time = df["time"].max()
        print(f"  Reference time: {reference_time}")

        # ── 4. Fetch future rain forecast ─────────────────────────────────────
        rain_future = fetch_rain_forecast(info["lat"], info["lon"], reference_time, hours=HORIZON)
        if rain_future.empty:
            # Fallback: exponential rain decay from last observed
            last_rain = float(df["rain"].iloc[-1]) if not df["rain"].empty else 0.0
            simulated = []
            for i in range(HORIZON):
                last_rain *= 0.7
                simulated.append(last_rain if last_rain > 0.1 else 0.0)
            rain_future = pd.DataFrame({
                "time": [reference_time + timedelta(hours=i + 1) for i in range(HORIZON)],
                "rain_forecast": simulated
            })
            print("  ⚠ Used simulated future rain (fallback)")

        # ── 5. Prepare model inputs ───────────────────────────────────────────
        # Filter to only features present in df
        available = [f for f in FEATURES if f in df.columns]
        if len(available) != INPUT_SIZE:
            print(f"  ⚠ Feature mismatch: expected {INPUT_SIZE}, got {len(available)}")

        past_seq = df[available].iloc[-SEQ_LENGTH:].values.astype(np.float32)
        past_seq = scaler.transform(past_seq[np.newaxis])[0]  # shape (SEQ_LENGTH, F)

        # Log-transform future rain to match training preprocessing
        future_rain = np.log1p(
            rain_future["rain_forecast"].values.astype(np.float32).reshape(-1, 1)
        )

        # ── 6. Load model & run inference ─────────────────────────────────────
        model = load_model_for_reservoir(res_idx)

        with torch.no_grad():
            preds = model(
                torch.tensor(past_seq[None]).float().to(device),
                torch.tensor(future_rain[None]).float().to(device),
                torch.tensor([res_idx]).long().to(device)
            )

        # Inverse log1p transform
        preds_np = np.expm1(preds.cpu().numpy()[0])  # shape (HORIZON, 3)

        # ── 7. Format response ────────────────────────────────────────────────
        results = []
        for i, (p10, p50, p90) in enumerate(preds_np):
            target_time = reference_time + timedelta(hours=i + 1)
            results.append({
                "targetTime": target_time.isoformat(),
                "p10": round(float(max(p10, 0)), 2),
                "p50": round(float(max(p50, 0)), 2),
                "p90": round(float(max(p90, 0)), 2),
            })

        print(f"  ✅ Generated {len(results)} forecast steps")

        return {
            "reservoirId": rid,
            "reservoirName": info["name"],
            "referenceTime": reference_time.isoformat(),
            "modelUsed": (
                f"fine_tuned_rid_{res_idx}"
                if os.path.exists(f"artifacts/inflow_model_rid_{res_idx}.pt")
                else "global"
            ),
            "predictions": results
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
