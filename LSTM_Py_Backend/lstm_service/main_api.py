import os
import torch
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List
import pandas as pd

from config.reservoirs import RESERVOIRS
from config.settings import *
from models.inflow_model import InflowForecastModel
from models.model_loader import load_model_from_checkpoint, get_features_for_input_size
from utils.scaler_utils import GlobalScaler
from data.data_fetcher import (
    fetch_hydro_data,
    fetch_rain_data,
    fetch_rain_forecast,
    fetch_rain_forecast_idw,
)
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features
)
from optimization.schemas import (
    OptimizeRequest, OptimizeResponse, OptimizationSummary,
    DischargeRecommendation, ConstraintViolationResponse,
    SimulateRequest, SimulateResponse,
)
from optimization.okamoto_workflow import run_okamoto_workflow
from optimization.reservoir_model import simulate_reservoir, constant_discharge_policy
from optimization.volume_calculator import get_volume
from optimization.reservoir_params import get_params, RESERVOIR_PARAMS

app = FastAPI(title="LSTM Inflow Prediction API")

# Load model and scaler on startup
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = None
scaler = GlobalScaler()

@app.on_event("startup")
async def startup_event():
    global model, input_features, model_n_future
    try:
        scaler.load("artifacts/global_scaler.pkl")
        
        model_path = "artifacts/inflow_model.pt"
        if os.path.exists(model_path):
            model, input_features, model_n_future = load_model_from_checkpoint(model_path, device)
            print(f"Model loaded successfully from {model_path} with {len(input_features)} features and n_future={model_n_future}")

            if scaler.scaler.n_features_in_ != len(input_features):
                scaler_features = get_features_for_input_size(scaler.scaler.n_features_in_)
                idx = np.array([scaler_features.index(f) for f in input_features])
                scaler.scaler.mean_  = scaler.scaler.mean_[idx]
                scaler.scaler.scale_ = scaler.scaler.scale_[idx]
                scaler.scaler.var_   = scaler.scaler.var_[idx]
                scaler.scaler.n_features_in_ = len(input_features)
        else:
            print(f"Model file not found at {model_path}. Please download it from Colab.")
            model = None
            input_features = []
            model_n_future = 3
    except Exception as e:
        print(f"Error during startup: {str(e)}")

class PredictRequest(BaseModel):
    rid: int
    as_of: Optional[str] = None
    use_perfect_forecast: Optional[bool] = False

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
        iso_value = req.as_of
        if iso_value:
            if iso_value.endswith("Z"):
                iso_value = iso_value[:-1] + "+00:00"
            reference_time = datetime.fromisoformat(iso_value).replace(tzinfo=None)
        else:
            reference_time = None
            
        hydro = fetch_hydro_data(rid, days=60, end_time=reference_time)
        rain = fetch_rain_data(rid, info["lat"], info["lon"], reference_time=reference_time, days=60)
        
        if hydro.empty:
            raise HTTPException(status_code=400, detail="No hydrologic data available")
        
        df = pd.merge(hydro, rain, on="time", how="left")
        df["rain"] = df["rain"].fillna(0)
        df["inflow"] = df["inflow"].ffill().fillna(0.0)
        df["inflow"] = np.sqrt(df["inflow"].clip(0))
        
        df = add_time_features(df)
        df = add_rain_features(df)
        df = add_inflow_features(df)
        df = df.dropna()
        
        if len(df) < SEQ_LENGTH:
            raise HTTPException(status_code=400, detail=f"Insufficient data. Got {len(df)}, need {SEQ_LENGTH}")
            
        if reference_time is None:
            reference_time = df["time"].max()
        
        # 2. Fetch forecast
        if req.use_perfect_forecast:
            future_ref = reference_time + timedelta(hours=HORIZON)
            perfect_rain_df = fetch_rain_data(rid, info["lat"], info["lon"], reference_time=future_ref, days=2)
        # 2. X_future
        rain_fc_df = fetch_rain_forecast_idw(rid, reference_time, hours=HORIZON)
        
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
            
        # 3. Predict
        features = input_features
        
        # Ensure all features exist in df
        for f in features:
            if f not in df.columns:
                df[f] = 0.0
                
        past_seq = df[features].iloc[-SEQ_LENGTH:].values.astype(np.float32)
        past_seq = np.nan_to_num(past_seq, nan=0.0, posinf=0.0, neginf=0.0)
        past_seq = scaler.transform(past_seq[np.newaxis])[0]
        
        with torch.no_grad():
            preds = model(
                torch.tensor(past_seq[None]).float().to(device),
                torch.tensor([info["idx"]]).long().to(device),
                x_future=x_future_tensor
            )
            
        preds = np.square(preds.cpu().numpy()[0])
        
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

# ============================================================
# OPTIMIZATION ENDPOINTS
# ============================================================

async def _get_ensemble_inflows(rid: int, info: dict, reference_time: datetime, use_perfect_forecast: bool = False) -> list:
    """Lấy ensemble inflow forecasts (P10/P50/P90) từ LSTM model."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Time anchoring to prevent look-ahead bias
    hydro = fetch_hydro_data(rid, days=60, end_time=reference_time)
    rain = fetch_rain_data(rid, info["lat"], info["lon"], reference_time=reference_time, days=60)

    if hydro.empty:
        raise HTTPException(status_code=400, detail="No hydrologic data available")

    df = pd.merge(hydro, rain, on="time", how="left")
    df["inflow"] = df["inflow"].ffill().fillna(0.0)
    df["inflow"] = np.sqrt(df["inflow"].clip(0))
    
    df = add_time_features(df)
    df = add_rain_features(df)
    df = add_inflow_features(df)
    df = df.dropna()

    if len(df) < SEQ_LENGTH:
        raise HTTPException(status_code=400, detail=f"Insufficient data. Got {len(df)}, need {SEQ_LENGTH}")

    if use_perfect_forecast:
        future_ref = reference_time + timedelta(hours=HORIZON)
        perfect_rain_df = fetch_rain_data(info["lat"], info["lon"], reference_time=future_ref, days=2)
        start_fut = reference_time + timedelta(hours=1)
        end_fut = reference_time + timedelta(hours=HORIZON)
        rain_future = perfect_rain_df[(perfect_rain_df["time"] >= start_fut) & (perfect_rain_df["time"] <= end_fut)].copy()
        if "rain" in rain_future.columns:
            rain_future["rain_forecast"] = rain_future["rain"]
        else:
            rain_future = pd.DataFrame({"rain_forecast": [0]*HORIZON})
    else:
        rain_future = fetch_rain_forecast(info["lat"], info["lon"], reference_time, hours=HORIZON)
        
    if rain_future.empty or len(rain_future) < HORIZON:
        last_rain = df["rain"].iloc[-1] if not df["rain"].empty else 0.0
        simulated_rain = []
        decay_factor = 0.7
        for i in range(HORIZON):
            last_rain = last_rain * decay_factor
            simulated_rain.append(last_rain if last_rain > 0.1 else 0.0)
        rain_arr = simulated_rain
    else:
        rain_arr = rain_future["rain_forecast"].values[:HORIZON]

    features = [
        "rain","rain_3h","rain_6h","rain_12h", "rain_24h", "rain_intensity",
        "rain_lag_1","rain_lag_3","rain_lag_6",
        "inflow","inflow_prev","inflow_diff", "inflow_diff_2",
        "inflow_3h_avg","inflow_6h_avg", "inflow_12h_avg",
        "hour_sin","hour_cos","doy_sin","doy_cos", "month_sin","month_cos"
    ]

    past_seq = df[features].iloc[-SEQ_LENGTH:].values
    past_seq = scaler.transform(past_seq[np.newaxis])[0]
    future_rain = np.array(rain_arr).reshape(-1, 1)

    with torch.no_grad():
        preds = model(
            torch.tensor(past_seq[None]).float().to(device),
            torch.tensor(future_rain[None]).float().to(device),
            torch.tensor([info["idx"]]).long().to(device)
        )
    preds = np.square(preds.cpu().numpy()[0])  # shape (HORIZON, 3) = (T, [P10, P50, P90])

    # Tách thành 3 ensemble members
    p10_inflow = preds[:, 0].clip(0)
    p50_inflow = preds[:, 1].clip(0)
    p90_inflow = preds[:, 2].clip(0)

    return [p10_inflow, p50_inflow, p90_inflow]


@app.post("/optimize", response_model=OptimizeResponse)
async def optimize_dam_operation(req: OptimizeRequest):
    """
    Tối ưu hóa vận hành hồ chứa bằng SCE-UA + Okamoto workflow.
    Sử dụng dự báo LSTM P10/P50/P90 làm ensemble input.
    """
    rid = req.reservoir_id
    if rid not in RESERVOIRS:
        raise HTTPException(status_code=404, detail="Reservoir not found")

    info = RESERVOIRS[rid]
    rp = get_params(rid)
    now = datetime.utcnow()

    try:
        ensemble_inflows = await _get_ensemble_inflows(rid, info, now, use_perfect_forecast=False)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get forecasts: {str(e)}")

    try:
        result = run_okamoto_workflow(
            reservoir_id=rid,
            current_water_level=req.current_water_level,
            current_inflow=req.current_inflow,
            current_time=now,
            ensemble_inflows=ensemble_inflows,
            downstream_limit=req.downstream_limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

    # Build response
    opt = result.optimization_result
    sim = result.simulation

    violations = []
    if sim:
        for v in sim.constraint_violations:
            violations.append(ConstraintViolationResponse(
                time=v.time.isoformat(),
                violation_type=v.violation_type,
                actual_value=v.actual_value,
                limit_value=v.limit_value,
                severity=v.severity,
            ))

    return OptimizeResponse(
        reservoir_id=rid,
        reservoir_name=rp.name,
        current_step=result.current_step.value,
        optimal_q_start=result.optimal_q_start or 0,
        optimal_q_max_power=result.optimal_q_max_power or 0,
        baseline_max_outflow=result.baseline_max_outflow or 0,
        optimized_max_outflow=result.optimized_max_outflow or 0,
        reduction_percent=result.reduction_percent or 0,
        optimized_end_volume=result.optimized_end_volume or 0,
        optimized_end_water_level=result.optimized_end_water_level or 0,
        target_volume=result.target_volume or 0,
        fill_percent=result.fill_percent or 0,
        optimization_summary=OptimizationSummary(
            converged=opt.converged if opt else False,
            convergence_reason=opt.convergence_reason if opt else "not_run",
            n_iterations=opt.n_iterations if opt else 0,
            n_func_evals=opt.n_func_evals if opt else 0,
            best_value=opt.best_value if opt else 0,
        ),
        recommendations=result.recommended_discharge or [],
        violations=violations,
        steps=[{"step": s.step.value, "description": s.description, "params": s.params}
               for s in result.steps_completed],
    )


@app.post("/simulate", response_model=SimulateResponse)
async def simulate_dam(req: SimulateRequest):
    """
    Mô phỏng vận hành hồ chứa với lưu lượng xả cố định.
    Sử dụng dự báo LSTM P50 làm inflow.
    """
    rid = req.reservoir_id
    if rid not in RESERVOIRS:
        raise HTTPException(status_code=404, detail="Reservoir not found")

    info = RESERVOIRS[rid]
    rp = get_params(rid)
    now = datetime.utcnow()

    try:
        ensemble = await _get_ensemble_inflows(rid, info, now)
        p50_inflow = ensemble[1]  # P50
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get forecasts: {str(e)}")

    initial_volume = get_volume(rid, req.current_water_level)
    policy = constant_discharge_policy(req.discharge_rate)

    sim = simulate_reservoir(
        reservoir_id=rid,
        initial_volume=initial_volume,
        inflow_series=p50_inflow,
        discharge_policy=policy,
        start_time=now,
    )

    timeline = []
    for i, t in enumerate(sim.times):
        timeline.append({
            "time": t.isoformat(),
            "inflow": float(sim.inflows[i]),
            "outflow": float(sim.outflows[i]),
            "water_level": float(sim.water_levels[i]),
            "volume": float(sim.volumes[i]),
        })

    violations = [
        ConstraintViolationResponse(
            time=v.time.isoformat(),
            violation_type=v.violation_type,
            actual_value=v.actual_value,
            limit_value=v.limit_value,
            severity=v.severity,
        ) for v in sim.constraint_violations
    ]

    return SimulateResponse(
        reservoir_id=rid,
        reservoir_name=rp.name,
        max_outflow=sim.max_outflow,
        max_water_level=sim.max_water_level,
        min_water_level=sim.min_water_level,
        energy_loss=sim.energy_loss,
        n_violations=len(sim.constraint_violations),
        timeline=timeline,
        violations=violations,
    )


@app.get("/reservoirs")
async def list_reservoirs():
    """Danh sách 4 hồ chứa chính và thông số vật lý."""
    return {
        rid: {
            "name": rp.name,
            "MNDBT": rp.MNDBT,
            "MNC": rp.MNC,
            "design_capacity": rp.design_capacity,
            "useful_capacity": rp.useful_capacity,
            "max_turbine_discharge": rp.max_turbine_discharge,
        }
        for rid, rp in RESERVOIR_PARAMS.items()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
