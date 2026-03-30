import os
import torch
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import timedelta
import pandas as pd

from config.reservoirs import RESERVOIRS
from config.settings import *
from models.inflow_model import InflowForecastModel
from utils.scaler_utils import GlobalScaler
from data.data_fetcher import (
    fetch_hydro_data,
    fetch_rain_data,
)
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features
)
import requests

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
_model_cache: dict = {}


@app.on_event("startup")
async def startup_event():
    """Load only the scaler on startup. Models are loaded on-demand to save RAM."""
    try:
        scaler.load("artifacts/global_scaler.pkl")
        print(f"[OK] Scaler loaded. Device: {device}. Models will be loaded on-demand.")
    except Exception as e:
        print(f"[ERROR] Error loading scaler: {e}")


def load_model_for_reservoir(res_idx: int) -> InflowForecastModel:
    """Load the best available model for a given reservoir index (cached after first load)."""
    if res_idx in _model_cache:
        return _model_cache[res_idx]

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
        model.load_state_dict(torch.load(fine_tuned_path, map_location=device, weights_only=True))
        print(f"  [Model] Loaded fine-tuned: {fine_tuned_path}")
    elif os.path.exists(global_path):
        model.load_state_dict(torch.load(global_path, map_location=device, weights_only=True))
        print(f"  [Model] Loaded global: {global_path}")
    else:
        raise FileNotFoundError(f"No model found at {fine_tuned_path} or {global_path}")

    model.eval()
    _model_cache[res_idx] = model
    return model


class PredictRequest(BaseModel):
    rid: int


@app.get("/health")
async def health_check():
    """Enhanced health check to verify Danang API connectivity."""
    danang_status = "unknown"
    try:
        # Tốn ít tài nguyên nhất để check connectivity
        r = requests.get("https://apiv2.danang.gov.vn/oauth2/token", timeout=5)
        danang_status = "reachable" if r.status_code in [200, 401, 405] else f"error_{r.status_code}"
    except Exception as e:
        danang_status = f"unreachable: {str(e)}"

    return {
        "status": "ok",
        "device": str(device),
        "features": INPUT_SIZE,
        "danang_api": danang_status
    }


class ProxyRequest(BaseModel):
    method: str = "GET"
    url: str
    data: dict = None
    params: dict = None
    headers: dict = None


@app.post("/proxy/danang")
async def proxy_danang(req: ProxyRequest):
    """Proxy endpoint to allow Render to call Danang API via VPS IP."""
    try:
        # Chỉ cho phép gọi đến danang.gov.vn để bảo mật
        if "danang.gov.vn" not in req.url:
            raise HTTPException(status_code=400, detail="Only danang.gov.vn URLs are allowed")

        headers = req.headers or {}
        # Xóa host header để tránh lỗi SSL/CORS
        headers.pop("host", None)
        headers.pop("Host", None)

        if req.method.upper() == "POST":
            r = requests.post(req.url, data=req.data, json=req.data, params=req.params, headers=headers, timeout=60)
        else:
            r = requests.get(req.url, params=req.params, headers=headers, timeout=60)

        return r.json() if "application/json" in r.headers.get("Content-Type", "") else r.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


@app.post("/predict")
async def get_prediction(req: PredictRequest):
    rid = req.rid
    if rid not in RESERVOIRS:
        raise HTTPException(status_code=404, detail=f"Reservoir {rid} not found")

    info = RESERVOIRS[rid]
    res_idx = info["idx"]

    try:
        print(f"\n[>>] Predicting for Reservoir {rid} ({info['name']})...")
        has_warning = False
        warning_msg = ""

        # ── 1. Fetch hydro data (72h lookback for features) ──────────────────
        hydro = fetch_hydro_data(rid, days=5)
        if hydro.empty:
            raise HTTPException(status_code=400, detail=f"No hydro data for reservoir {rid}")

        # ── 2. Determine reference time (latest hydro point) ──────────────────
        reference_time = hydro["time"].max()
        print(f"  Reference time (from hydro): {reference_time}")

        # ── 3. Fetch hybrid rain (Archive Excel + Forecast) ───────────────────
        # We fetch rain for features (past) and for model input (future)
        rain_all = fetch_rain_data(rid, info["lat"], info["lon"], reference_time=reference_time, days=5)

        # ── 4. Merge and build feature dataframe ─────────────────────────────
        if rain_all.empty:
            df = hydro.copy()
            df["rain"] = 0.0
            rain_future = pd.DataFrame() # Will trigger fallback below
        else:
            # Past rain for features
            rain_past = rain_all[rain_all["time"] <= reference_time]
            df = pd.merge(hydro, rain_past, on="time", how="left")
            df["rain"] = df["rain"].fillna(0.0)
            
            # Future rain for inference
            rain_future = rain_all[rain_all["time"] > reference_time].copy()
            rain_future = rain_future.rename(columns={"rain": "rain_forecast"})

        df["inflow"] = np.log1p(df["inflow"].clip(0))

        df = add_time_features(df)
        df = add_rain_features(df)
        df = add_inflow_features(df)
        # ── 5. Resilience: Pad data if history is insufficient (< 72h) ───────
        if len(df) < SEQ_LENGTH:
            print(f"  [WARN] Insufficient data: {len(df)} rows. Padding to {SEQ_LENGTH}...")
            # Pad by repeating the first row
            needed = SEQ_LENGTH - len(df)
            padding = pd.concat([df.iloc[[0]]] * needed, ignore_index=True)
            df = pd.concat([padding, df], ignore_index=True)
            has_warning = True
            warning_msg = f"Insufficient history ({len(df)-needed}h). Padded with {needed}h of oldest data."
        else:
            has_warning = False
            warning_msg = ""

        # ── 5. Prepare future rain forecast ───────────────────────────────────
        if rain_future.empty:
            # Fallback: giả định không mưa (0.0) — thực tế hơn exponential decay
            # vì mưa nhiệt đới thường ngắn và ngừng đột ngột
            rain_future = pd.DataFrame({
                "time": [reference_time + timedelta(hours=i + 1) for i in range(HORIZON)],
                "rain_forecast": [0.0] * HORIZON
            })
            print("  [WARN] Open-Meteo unavailable, fallback to zero rainfall forecast")

        # ── 6. Prepare model inputs ───────────────────────────────────────────
        # Filter to only features present in df
        available = [f for f in FEATURES if f in df.columns]
        if len(available) != INPUT_SIZE:
            missing = [f for f in FEATURES if f not in df.columns]
            raise HTTPException(
                status_code=500,
                detail=f"Feature mismatch: expected {INPUT_SIZE}, got {len(available)}. Missing: {missing}"
            )

        past_seq = df[available].iloc[-SEQ_LENGTH:].values.astype(np.float32)
        # Replace NaN/Inf from feature engineering before scaling
        past_seq = np.nan_to_num(past_seq, nan=0.0, posinf=0.0, neginf=0.0)
        past_seq = scaler.transform(past_seq[np.newaxis])[0]  # shape (SEQ_LENGTH, F)

        # Log-transform future rain — pad to exactly HORIZON if forecast is short
        rain_vals = rain_future["rain_forecast"].values.astype(np.float32)
        if len(rain_vals) < HORIZON:
            rain_vals = np.pad(rain_vals, (0, HORIZON - len(rain_vals)), constant_values=0.0)
        future_rain = np.log1p(rain_vals[:HORIZON].reshape(-1, 1))

        # ── 7. Load model & run inference ─────────────────────────────────────
        model = load_model_for_reservoir(res_idx)

        with torch.no_grad():
            preds = model(
                torch.tensor(past_seq[None]).float().to(device),
                torch.tensor(future_rain[None]).float().to(device),
                torch.tensor([res_idx]).long().to(device)
            )

        # Inverse log1p — clip to prevent Inf from very large raw outputs
        raw_np = np.clip(preds.cpu().numpy()[0], -20.0, 20.0)
        preds_np = np.nan_to_num(np.expm1(raw_np), nan=0.0, posinf=0.0, neginf=0.0)

        # ── 8. Format response ────────────────────────────────────────────────
        results = []
        for i, (p10, p50, p90) in enumerate(preds_np):
            target_time = reference_time + timedelta(hours=i + 1)
            results.append({
                "targetTime": target_time.isoformat(),
                "p10": round(max(float(p10), 0.0), 2),
                "p50": round(max(float(p50), 0.0), 2),
                "p90": round(max(float(p90), 0.0), 2),
            })

        print(f"  [OK] Generated {len(results)} forecast steps")

        return {
            "reservoirId": rid,
            "reservoirName": info["name"],
            "referenceTime": reference_time.isoformat(),
            "warning": warning_msg if has_warning else None,
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
        error_msg = traceback.format_exc()
        print(f"❌ [CRASH] Reservoir {rid} Error:\n{error_msg}")
        raise HTTPException(
            status_code=500, 
            detail={
                "error": str(e),
                "type": type(e).__name__,
                "reservoirId": rid
            }
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
