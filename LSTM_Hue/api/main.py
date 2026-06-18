"""
FastAPI server cho HueLSTM — Flood Forecast API.

Endpoints:
  GET  /health          — health check
  GET  /basins          — danh sách 3 hồ
  POST /predict/{basin} — 7-day probabilistic forecast
  GET  /thresholds      — ngưỡng cảnh báo lũ

Chạy: uvicorn api.main:app --host 0.0.0.0 --port 8001
"""

import os
from datetime import datetime
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config.basins import BASINS, BASIN_KEY_TO_ID
from config.thresholds import RESERVOIR_THRESHOLDS, HUONG_RIVER_KIM_LONG
from data.nwp_fetcher import fetch_nwp_forecast

app = FastAPI(
    title="HueLSTM Flood Forecast API",
    description="7-day probabilistic flood forecasting cho 3 hồ Thừa Thiên Huế",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global predictor (lazy load) ───────────────────────────────────────────────
_predictor = None


def get_predictor():
    global _predictor
    if _predictor is None:
        from inference.predictor import HueFloodPredictor
        model_path = os.environ.get("MODEL_PATH", "artifacts/hue_lstm.pt")
        if not os.path.exists(model_path):
            raise RuntimeError(f"Model not found: {model_path}. Train first: python main_train.py")
        device = "cuda" if __import__("torch").cuda.is_available() else "cpu"
        _predictor = HueFloodPredictor(model_path, device=device)
    return _predictor


# ── Request/Response schemas ───────────────────────────────────────────────────

class PredictRequest(BaseModel):
    """
    Historical observation data để build hindcast.
    Caller cung cấp dữ liệu đã feature-engineer (raw values, chưa scale).
    """
    timestamps:   list[str]   # ISO8601 strings, len >= 720
    rain_mm:      list[float] # mưa bình quân lưu vực (mm/h) — từ IDW
    inflow_m3s:   list[float] # lưu lượng vào hồ (m³/s)
    water_level_m: list[float] # mực nước hồ (m)
    outflow_m3s:  list[float] # lưu lượng xả (m³/s)
    temp_c:       list[float] | None = None
    wind_ms:      list[float] | None = None
    is_typhoon:   list[float] | None = None
    typhoon_intensity: list[float] | None = None
    reference_time: str | None = None  # ISO8601, mặc định = now


class PredictResponse(BaseModel):
    basin: str
    basinId: int
    referenceTime: str
    forecastHorizonHours: int
    modelVersion: str
    quantiles: list[str]
    predictions: list[dict]
    floodAlert: str
    floodSeason: bool
    peakForecast: dict


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "model_loaded": _predictor is not None,
    }


@app.get("/basins")
def list_basins():
    return {
        "count": len(BASINS),
        "basins": [
            {
                "id":    info["id"],
                "key":   key,
                "name":  info["name"],
                "river": info["river"],
                "lat":   info["lat"],
                "lon":   info["lon"],
                "capacity_Mm3": info["total_capacity_Mm3"],
                "catchment_km2": info["catchment_area_km2"],
            }
            for key, info in BASINS.items()
        ],
    }


@app.get("/thresholds")
def get_thresholds():
    return {
        "reservoir_thresholds": RESERVOIR_THRESHOLDS,
        "huong_river_kim_long": HUONG_RIVER_KIM_LONG,
    }


@app.post("/predict/{basin_key}", response_model=PredictResponse)
def predict(basin_key: str, body: PredictRequest):
    """
    Tạo 7-day probabilistic flood forecast cho một hồ.

    basin_key: "ta_trach" | "binh_dien" | "huong_dien"
    """
    if basin_key not in BASINS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown basin '{basin_key}'. Valid: {list(BASINS.keys())}",
        )

    basin = BASINS[basin_key]

    if len(body.timestamps) < 24:
        raise HTTPException(status_code=400, detail="Cần ít nhất 24 timesteps lịch sử.")

    # Build feature matrix
    from data.feature_builder import build_feature_matrix
    timestamps = np.array([np.datetime64(t, "s") for t in body.timestamps])

    def _to_arr(lst, default=0.0):
        if lst is None:
            return None
        return np.array(lst, dtype=np.float32)

    x_hist = build_feature_matrix(
        timestamps=timestamps,
        rain_mm=_to_arr(body.rain_mm),
        inflow=_to_arr(body.inflow_m3s),
        water_level=_to_arr(body.water_level_m),
        outflow=_to_arr(body.outflow_m3s),
        flood_limit_m=basin["flood_limit_level_m"],
        temp_c=_to_arr(body.temp_c),
        wind_ms=_to_arr(body.wind_ms),
        is_typhoon=_to_arr(body.is_typhoon),
        typhoon_intensity=_to_arr(body.typhoon_intensity),
    )

    # Fetch NWP forecast
    try:
        nwp = fetch_nwp_forecast(lat=basin["lat"], lon=basin["lon"])
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"NWP fetch failed: {e}")

    # Reference time
    ref_time = (
        datetime.fromisoformat(body.reference_time)
        if body.reference_time else None
    )

    try:
        result = get_predictor().predict(
            basin_key=basin_key,
            x_hist_raw=x_hist,
            nwp_forecast=nwp,
            reference_time=ref_time,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return result


@app.get("/predict/nwp/{basin_key}")
def get_nwp_only(basin_key: str):
    """Lấy 7-day NWP forecast thuần túy (không inference model)."""
    if basin_key not in BASINS:
        raise HTTPException(status_code=404, detail=f"Unknown basin: {basin_key}")
    basin = BASINS[basin_key]
    try:
        nwp = fetch_nwp_forecast(lat=basin["lat"], lon=basin["lon"])
        return {"basin": basin["name"], "nwp": nwp}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
