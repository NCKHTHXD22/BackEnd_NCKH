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

app = FastAPI(title="LSTM Inflow Prediction API")

# Load model and scaler on startup
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = None
scaler = GlobalScaler()

@app.on_event("startup")
async def startup_event():
    global model
    try:
        scaler.load("artifacts/global_scaler.pkl")
        
        input_size = 22 # From main_predict.py features list length
        model = InflowForecastModel(
            input_size=input_size,
            hidden_size=HIDDEN_SIZE,
            horizon=HORIZON,
            quantiles=QUANTILES,
            num_reservoirs=NUM_RESERVOIRS
        ).to(device)
        
        model_path = "artifacts/inflow_model.pt"
        if os.path.exists(model_path):
            model.load_state_dict(torch.load(model_path, map_location=device))
            model.eval()
            print(f"✅ Model loaded successfully from {model_path}")
        else:
            print(f"⚠️ Model file not found at {model_path}. Please download it from Colab.")
    except Exception as e:
        print(f"❌ Error during startup: {str(e)}")

class PredictRequest(BaseModel):
    rid: int

@app.post("/predict")
async def get_prediction(req: PredictRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    rid = req.rid
    if rid not in RESERVOIRS:
        raise HTTPException(status_code=404, detail="Reservoir not found")
    
    info = RESERVOIRS[rid]
    
    try:
        # 1. Fetch data
        hydro = fetch_hydro_data(rid, days=60)
        rain = fetch_rain_data(info["lat"], info["lon"], days=60)
        
        if hydro.empty:
            raise HTTPException(status_code=400, detail="No hydrologic data available")
        
        df = pd.merge(hydro, rain, on="time", how="left")
        df["rain"] = df["rain"].fillna(0)
        df["inflow"] = np.log1p(df["inflow"].clip(0))
        
        df = add_time_features(df)
        df = add_rain_features(df)
        df = add_inflow_features(df)
        df = df.dropna()
        
        if len(df) < SEQ_LENGTH:
            raise HTTPException(status_code=400, detail=f"Insufficient data. Got {len(df)}, need {SEQ_LENGTH}")
            
        reference_time = df["time"].max()
        
        # 2. Fetch forecast
        rain_future = fetch_rain_forecast(info["lat"], info["lon"], reference_time, hours=HORIZON)
        if rain_future.empty:
            # Simulated decay as in main_predict.py
            last_rain = df["rain"].iloc[-1] if not df["rain"].empty else 0.0
            simulated_rain = []
            decay_factor = 0.7
            for i in range(HORIZON):
                last_rain = last_rain * decay_factor
                simulated_rain.append(last_rain if last_rain > 0.1 else 0.0)
            
            rain_future = pd.DataFrame({
                "time": [reference_time + timedelta(hours=i+1) for i in range(HORIZON)],
                "rain_forecast": simulated_rain
            })
            
        # 3. Predict
        features = [
            "rain","rain_3h","rain_6h","rain_12h", "rain_24h", "rain_intensity",
            "rain_lag_1","rain_lag_3","rain_lag_6",
            "inflow","inflow_prev","inflow_diff", "inflow_diff_2",
            "inflow_3h_avg","inflow_6h_avg", "inflow_12h_avg",
            "hour_sin","hour_cos","doy_sin","doy_cos", "month_sin","month_cos"
        ]
        
        past_seq = df[features].iloc[-SEQ_LENGTH:].values
        past_seq = scaler.transform(past_seq[np.newaxis])[0]
        future_rain = rain_future["rain_forecast"].values.reshape(-1, 1)
        
        with torch.no_grad():
            preds = model(
                torch.tensor(past_seq[None]).float().to(device),
                torch.tensor(future_rain[None]).float().to(device),
                torch.tensor([info["idx"]]).long().to(device)
            )
            
        preds = np.expm1(preds.cpu().numpy()[0])
        
        # 4. Format results
        results = []
        for i, (p10, p50, p90) in enumerate(preds):
            target_time = reference_time + timedelta(hours=i+1)
            results.append({
                "targetTime": target_time.isoformat(),
                "p10": float(p10),
                "p50": float(p50),
                "p90": float(p90)
            })
            
        return {
            "reservoirId": rid,
            "reservoirName": info["name"],
            "referenceTime": reference_time.isoformat(),
            "predictions": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
