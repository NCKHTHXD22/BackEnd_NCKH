# main_api.py
"""
FastAPI serving cho Random Forest -- tu chua toan bo (training + serving)
trong cung 1 thu muc, giong cau truc LSTM_Py_Backend/lstm_service/.

Endpoint:
  GET  /health
  POST /predict-rf   {rid, reference_time}

Xem XGBoost_Py_Backend/main_api.py -- cung logic fetch/feature-engineering,
chi khac buoc inference (Quantile Regression Forest thay vi booster XGBoost).
"""
import os
import sys
import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import timedelta

if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from config.reservoirs import RESERVOIRS, NUM_RESERVOIRS
from config.settings import HORIZON, QUANTILES
from data.tabular_dataset import FEATURES
from data.data_fetcher import fetch_hydro_data, fetch_rain_data, fetch_meteo_history, _vn_now
from features.feature_engineering import (
    add_time_features, add_rain_features, add_inflow_features,
    add_reservoir_features, add_meteo_features,
)

app = FastAPI(title="Random Forest Inflow Prediction API", version="1.0.0")

ARTIFACT_DIR = "artifacts/rf"
_model_cache: dict = {}   # horizon_idx -> RandomForestQuantileRegressor


def load_models() -> dict:
    if _model_cache:
        return _model_cache
    for h in range(HORIZON):
        path = f"{ARTIFACT_DIR}/h{h + 1:02d}.joblib"
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Missing RF artifact: {path}. Chay training/train_rf.py truoc."
            )
        _model_cache[h] = joblib.load(path)
    print(f"[OK] Loaded {len(_model_cache)} Quantile Regression Forest ({HORIZON} horizon).")
    return _model_cache


@app.on_event("startup")
async def startup_event():
    try:
        load_models()
    except FileNotFoundError as e:
        print(f"[WARN] {e} -- /predict-rf se loi 500 cho toi khi co artifacts.")


@app.get("/health")
async def health():
    return {"status": "ok", "models_loaded": len(_model_cache)}


class PredictRequest(BaseModel):
    rid: int
    reference_time: str = None


@app.post("/predict-rf")
async def predict_rf(req: PredictRequest):
    rid = req.rid
    if rid not in RESERVOIRS:
        raise HTTPException(status_code=404, detail=f"Reservoir {rid} not found")

    info = RESERVOIRS[rid]
    res_idx = info["idx"]

    try:
        print(f"\n[>>] Predicting for Reservoir {rid} ({info['name']})...")

        if req.reference_time:
            try:
                ref_dt = pd.to_datetime(req.reference_time).tz_convert("Asia/Ho_Chi_Minh").tz_localize(None).floor("h")
                reference_time = ref_dt.to_pydatetime()
            except Exception as e:
                print(f"  [Ref] Error parsing reference_time '{req.reference_time}': {e}. Using current time.")
                reference_time = _vn_now().replace(minute=0, second=0, microsecond=0)
        else:
            reference_time = _vn_now().replace(minute=0, second=0, microsecond=0)

        hydro = fetch_hydro_data(rid, days=11, end_time=reference_time)
        if hydro.empty:
            raise HTTPException(status_code=400, detail=f"No hydro data for reservoir {rid}")

        reference_time = hydro["time"].max()
        print(f"  Reference time (from hydro): {reference_time}")

        rain_all = fetch_rain_data(rid, info["lat"], info["lon"], reference_time=reference_time, days=11)
        meteo_hist = fetch_meteo_history(info["lat"], info["lon"], days=11)

        if rain_all.empty:
            df = hydro.copy()
            df["rain"] = 0.0
        else:
            rain_past = rain_all[rain_all["time"] <= reference_time]
            df = pd.merge(hydro, rain_past, on="time", how="left")
            df["rain"] = df["rain"].fillna(0.0)

        if not meteo_hist.empty:
            df = pd.merge(df, meteo_hist, on="time", how="left")

        df["inflow"] = np.sqrt(df["inflow"].clip(0))
        for col in ("water_level", "outflow"):
            if col not in df.columns:
                df[col] = np.nan

        df = add_time_features(df)
        df = add_rain_features(df)
        df = add_inflow_features(df)
        df = add_reservoir_features(df)
        df = add_meteo_features(df)
        df = df.fillna(0.0)

        for f in FEATURES:
            if f not in df.columns:
                df[f] = 0.0
        last_row = df[FEATURES].iloc[-1].values.astype(np.float32)
        last_row = np.nan_to_num(last_row, nan=0.0, posinf=0.0, neginf=0.0)

        rid_onehot = np.eye(NUM_RESERVOIRS, dtype=np.float32)[res_idx]
        row_full = np.concatenate([last_row, rid_onehot])[None, :]

        models = load_models()
        preds = np.zeros((HORIZON, len(QUANTILES)), dtype=np.float32)
        for h in range(HORIZON):
            preds[h, :] = models[h].predict(row_full, quantiles=QUANTILES)[0]
        preds = np.sort(preds, axis=1)
        preds = np.clip(preds, 0.0, 500.0) ** 2

        results = []
        for i, (p10, p50, p90) in enumerate(preds):
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
            "warning": None,
            "modelUsed": "rf_global",
            "predictions": results,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[CRASH] Reservoir {rid} Error:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": str(e), "type": type(e).__name__, "reservoirId": rid},
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8002)))
