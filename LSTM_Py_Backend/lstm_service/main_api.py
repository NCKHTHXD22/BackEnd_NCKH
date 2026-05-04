import os
import torch
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import timedelta
from typing import Any, Optional, List
import pandas as pd

from config.reservoirs import RESERVOIRS
from config.settings import *
from models.inflow_model import InflowForecastModel
from utils.scaler_utils import GlobalScaler
from data.data_fetcher import (
    fetch_hydro_data,
    fetch_rain_data,
    fetch_meteo_history,
    fetch_rain_forecast_idw,
    _vn_now,
)
from features.feature_engineering import (
    add_time_features,
    add_rain_features,
    add_inflow_features,
    add_reservoir_features,
    add_meteo_features,
)
from operation import get_operation_calculator
import requests

app = FastAPI(title="LSTM Inflow Prediction API", version="2.0.0")

# ─── CONSTANTS ────────────────────────────────────────────────────────────────
# INPUT_SIZE được xác định động từ scaler sau startup.
# 36 features (cũ) hoặc 38 features (mới, sau khi rebuild dataset với Z+Q_out).
# Thứ tự phải khớp chính xác với dataset_builder.py
_FEATURES_BASE = [
    "rain", "rain_3h", "rain_6h", "rain_12h", "rain_24h",
    "rain_48h", "rain_72h", "rain_96h", "rain_120h", "rain_168h",
    "rain_intensity", "rain_12h_std", "rain_24h_max",
    "rain_lag_1", "rain_lag_3", "rain_lag_6", "rain_lag_12", "rain_lag_24",
    "inflow", "inflow_prev", "inflow_diff", "inflow_diff_2",
    "inflow_3h_avg", "inflow_6h_avg", "inflow_12h_avg",
    "inflow_24h_avg", "inflow_48h_avg", "inflow_rising",
    "rain_inflow_interaction", "soil_moisture_x_inflow",
    "water_level", "outflow", "Z_diff", "Z_24h_avg", "outflow_diff", "Q_ratio",
    "et0", "wind_speed",
    "hour_sin", "hour_cos", "doy_sin", "doy_cos", "month_sin", "month_cos",
]

INPUT_SIZE: int = 36  # placeholder, sẽ được cập nhật sau startup
FEATURES: list  = _FEATURES_BASE[:36]

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
scaler = GlobalScaler()
_model_cache: dict = {}


@app.on_event("startup")
async def startup_event():
    """Load only the scaler on startup. Models are loaded on-demand to save RAM."""
    global INPUT_SIZE, FEATURES
    try:
        scaler.load("artifacts/global_scaler.pkl")
        INPUT_SIZE = int(scaler.scaler.n_features_in_)
        FEATURES   = _FEATURES_BASE[:INPUT_SIZE]
        print(f"[OK] Scaler loaded. INPUT_SIZE={INPUT_SIZE}. Device: {device}. Models will be loaded on-demand.")
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
    reference_time: str = None


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
    data: Any = None
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
            # Nếu Content-Type là json, dùng 'json' arg, ngược lại dùng 'data'
            if "application/json" in headers.get("Content-Type", "").lower():
                r = requests.post(req.url, json=req.data, params=req.params, headers=headers, timeout=60)
            else:
                r = requests.post(req.url, data=req.data, params=req.params, headers=headers, timeout=60)
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

        # Parse reference_time if provided, otherwise use current UTC hour
        if req.reference_time:
            try:
                # Handle ISO format from Node.js (2026-03-30T17:00:00.000Z)
                ref_dt = pd.to_datetime(req.reference_time).tz_convert("Asia/Ho_Chi_Minh").tz_localize(None).floor("h")
                reference_time = ref_dt.to_pydatetime()
                print(f"  [Ref] Using provided reference time: {reference_time}")
            except Exception as e:
                print(f"  [Ref] Error parsing reference_time '{req.reference_time}': {e}. Using current time.")
                reference_time = _vn_now().replace(minute=0, second=0, microsecond=0)
        else:
            reference_time = _vn_now().replace(minute=0, second=0, microsecond=0)
            print(f"  [Ref] Using current Vietnamese time: {reference_time}")

        # ── 1. Fetch hydro data (5-day lookback) ───────────────────────────
        hydro = fetch_hydro_data(rid, days=11, end_time=reference_time)
        if hydro.empty:
            raise HTTPException(status_code=400, detail=f"No hydro data for reservoir {rid}")

        # ── 2. Determine reference time (latest hydro point) ──────────────────
        reference_time = hydro["time"].max()
        print(f"  Reference time (from hydro): {reference_time}")

        # ── 3. Fetch rain + meteo history + rain forecast IDW ───────────────
        rain_all   = fetch_rain_data(rid, info["lat"], info["lon"],
                                     reference_time=reference_time, days=11)
        meteo_hist = fetch_meteo_history(info["lat"], info["lon"], days=11)
        rain_fc_df = fetch_rain_forecast_idw(res_idx, reference_time, hours=HORIZON)

        # ── 4. Merge and build feature dataframe ─────────────────────────────
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

        # ── 5. Pad neu lich su ngan ───────────────────────────────────────────
        if len(df) < SEQ_LENGTH:
            needed = SEQ_LENGTH - len(df)
            print(f"  [WARN] Insufficient data: {len(df)} rows. Padding {needed}h...")
            padding = pd.concat([df.iloc[[0]]] * needed, ignore_index=True)
            df = pd.concat([padding, df], ignore_index=True)
            has_warning = True
            warning_msg = f"Insufficient history ({len(df)-needed}h). Padded with {needed}h of oldest data."
        else:
            has_warning = False
            warning_msg = ""

        # ── 6. Prepare model inputs ───────────────────────────────────────────
        available = [f for f in FEATURES if f in df.columns]
        if len(available) != INPUT_SIZE:
            missing = [f for f in FEATURES if f not in df.columns]
            raise HTTPException(
                status_code=500,
                detail=f"Feature mismatch: expected {INPUT_SIZE}, got {len(available)}. Missing: {missing}"
            )

        past_seq = df[available].iloc[-SEQ_LENGTH:].values.astype(np.float32)
        past_seq = np.nan_to_num(past_seq, nan=0.0, posinf=0.0, neginf=0.0)
        past_seq = scaler.transform(past_seq[np.newaxis])[0]

        # ── 7. Build X_future từ mưa dự báo IDW ────────────────────────────
        x_future_tensor = None
        if N_FUTURE_FEATURES > 0:
            if not rain_fc_df.empty and len(rain_fc_df) >= HORIZON:
                rain_fc     = rain_fc_df["rain_fc"].values[:HORIZON].astype(np.float32)
                rain_fc_6h  = rain_fc_df["rain_fc_6h"].values[:HORIZON].astype(np.float32)
                rain_fc_24h = rain_fc_df["rain_fc_24h"].values[:HORIZON].astype(np.float32)
                x_fut = np.stack([rain_fc, rain_fc_6h, rain_fc_24h], axis=1)
            else:
                x_fut = np.zeros((HORIZON, N_FUTURE_FEATURES), dtype=np.float32)
            x_future_tensor = torch.tensor(x_fut[None]).float().to(device)

        # ── 8. Load model & run inference ────────────────────────────────────
        model = load_model_for_reservoir(res_idx)

        with torch.no_grad():
            preds = model(
                torch.tensor(past_seq[None]).float().to(device),
                torch.tensor([res_idx]).long().to(device),
                x_future=x_future_tensor,
            )

        raw_np = np.clip(preds.cpu().numpy()[0], 0.0, 500.0)
        preds_np = raw_np ** 2
        preds_np = np.sort(preds_np, axis=1)

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


# ─── OPERATION ENDPOINTS ─────────────────────────────────────────────────────

class OperationRequest(BaseModel):
    """Request body cho tính toán vận hành hồ theo QĐ 1865."""
    rid: int                              # Reservoir ID (1=A Vuong, 2=DakMi4, 3=SBung4, 4=STranh2, 9=SBung2)
    Z_current: float                      # Mực nước hiện tại (m)
    Q_inflow: float                       # Lưu lượng đến hồ (m³/s)
    timestamp: Optional[str] = None       # ISO datetime, mặc định = now
    Q_inflow_forecast_24h: Optional[float] = None  # Dự báo Q trung bình 24h tới


class OperationForecastRequest(BaseModel):
    """Request body cho tính toán vận hành theo chuỗi dự báo."""
    rid: int                              # Reservoir ID
    Z_initial: float                      # Mực nước ban đầu (m)
    Q_inflow_series: List[float]          # Chuỗi lưu lượng dự báo (m³/s), mỗi phần tử = 1 bước 24h
    start_time: Optional[str] = None      # ISO datetime bắt đầu, mặc định = now
    delta_t_hours: float = 24.0           # Bước thời gian (giờ)


@app.post("/operation/calculate")
async def operation_calculate(req: OperationRequest):
    """
    Tính toán lưu lượng xả khuyến nghị và dự báo mực nước cho một hồ chứa.
    Dựa trên QĐ 1865/QĐ-TTg về quy trình vận hành liên hồ chứa Vu Gia - Thu Bồn.
    """
    try:
        # Parse timestamp
        if req.timestamp:
            ts = pd.to_datetime(req.timestamp)
            if ts.tzinfo is not None:
                ts = ts.tz_convert("Asia/Ho_Chi_Minh").tz_localize(None)
            ts = ts.to_pydatetime()
        else:
            ts = _vn_now()

        calc = get_operation_calculator()
        result = calc.calculate_for_rid(
            rid=req.rid,
            Z_current=req.Z_current,
            Q_inflow=req.Q_inflow,
            timestamp=ts,
            Q_inflow_forecast_24h=req.Q_inflow_forecast_24h
        )

        # Lấy tên hồ từ config
        reservoir_name = RESERVOIRS.get(req.rid, {}).get("name", f"Reservoir {req.rid}")

        return {
            "status": "ok",
            "reservoirId": req.rid,
            "reservoirName": reservoir_name,
            "legalBasis": "QĐ 1865/QĐ-TTg ngày 23/12/2019",
            **result.to_dict()
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail={
            "error": str(e),
            "traceback": traceback.format_exc()
        })


@app.post("/operation/forecast")
async def operation_forecast(req: OperationForecastRequest):
    """
    Tính toán vận hành theo chuỗi dự báo lưu lượng đến hồ.
    Mô phỏng mực nước hồ theo phương trình cân bằng nước qua nhiều bước thời gian.
    """
    try:
        if len(req.Q_inflow_series) == 0:
            raise ValueError("Q_inflow_series không được rỗng")
        if len(req.Q_inflow_series) > 72:
            raise ValueError("Q_inflow_series tối đa 72 bước (72 ngày)")

        # Parse start_time
        if req.start_time:
            ts = pd.to_datetime(req.start_time)
            if ts.tzinfo is not None:
                ts = ts.tz_convert("Asia/Ho_Chi_Minh").tz_localize(None)
            ts = ts.to_pydatetime()
        else:
            ts = _vn_now()

        calc = get_operation_calculator()
        results = calc.calculate_forecast_series(
            rid=req.rid,
            Z_initial=req.Z_initial,
            Q_inflow_series=req.Q_inflow_series,
            start_time=ts,
            delta_t_hours=req.delta_t_hours
        )

        reservoir_name = RESERVOIRS.get(req.rid, {}).get("name", f"Reservoir {req.rid}")

        return {
            "status": "ok",
            "reservoirId": req.rid,
            "reservoirName": reservoir_name,
            "legalBasis": "QĐ 1865/QĐ-TTg ngày 23/12/2019",
            "totalSteps": len(results),
            "deltaT_hours": req.delta_t_hours,
            "steps": [r.to_dict() for r in results],
            "summary": {
                "Z_initial": req.Z_initial,
                "Z_final": round(results[-1].Z_predicted, 2) if results else None,
                "Q_avg_inflow": round(float(np.mean(req.Q_inflow_series)), 2),
                "Q_avg_discharge": round(float(np.mean([r.Q_discharge for r in results])), 2),
                "isAllCompliant": all(r.is_compliant for r in results),
                "totalViolations": sum(len(r.violations) for r in results),
                "totalWarnings": sum(len(r.warnings) for r in results)
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail={
            "error": str(e),
            "traceback": traceback.format_exc()
        })


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
