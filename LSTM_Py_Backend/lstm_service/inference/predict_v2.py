"""
Inference pipeline cho FloodLSTM v2 — dự báo 7 ngày.

Tích hợp với main_api.py qua route POST /predict/v2.
Input: reservoir_id (int)
Output: 168 bước (7 ngày), 7 quantiles mỗi bước (P5/P10/P25/P50/P75/P90/P95)

Data flow:
  1. Fetch 31 ngày lịch sử hydro + rain (=744h để có đủ 720h sau clean)
  2. Feature engineer (46 features, same as v1)
  3. Normalize (global_scaler.pkl — CÙNG scaler với v1)
  4. Fetch Open-Meteo 7-day forecast → NWP src0
  5. Inference FloodLSTMv2
  6. Inverse sqrt transform → Q (m³/s)
  7. Build JSON response với 168 timesteps × 7 quantiles
"""

import torch
import numpy as np
from datetime import datetime, timedelta
from typing import Any

from config.settings_v2 import FloodLSTMv2Config
from models.flood_lstm_v2 import FloodLSTMv2


QUANTILE_LABELS = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]


class FloodPredictorV2:
    """
    Singleton-style predictor — load model một lần, dùng nhiều lần.

    Cách dùng trong FastAPI:
        predictor_v2 = FloodPredictorV2("artifacts/flood_model_v2.pt")

        @app.post("/predict/v2")
        async def predict_v2(body: PredictRequest):
            return predictor_v2.predict(body.reservoirId, feature_fetcher_fn, nwp_fetcher_fn)
    """

    def __init__(self, model_path: str, device: str = "cpu"):
        self.device = torch.device(device)

        cfg = torch.load(
            model_path.replace(".pt", "_config.pt"),
            map_location="cpu",
            weights_only=False,
        )
        self.cfg = cfg

        self.model = FloodLSTMv2(cfg).to(self.device)
        state = torch.load(model_path, map_location=self.device, weights_only=True)
        self.model.load_state_dict(state)
        self.model.eval()

        print(f"FloodPredictorV2 loaded: {model_path} | device={device}")

    @torch.no_grad()
    def predict(
        self,
        reservoir_idx: int,
        x_hindcast: np.ndarray,       # (720, 46) đã scale
        nwp_src0: np.ndarray,          # (168, 6)  Open-Meteo forecast
        nwp_src1: np.ndarray | None,   # (168, 6) | None
        reference_time: datetime | None = None,
    ) -> dict[str, Any]:
        """
        Args:
            reservoir_idx  : index hồ (0-based, khớp với config/reservoirs.py)
            x_hindcast     : (720, 46) feature matrix đã chuẩn hóa
            nwp_src0       : (168, 6) NWP forecast features
            nwp_src1       : (168, 6) hoặc None nếu không có backup NWP
            reference_time : thời điểm bắt đầu dự báo (mặc định = now)

        Returns:
            dict với "predictions": list 168 dict {targetTime, p5..p95}
        """
        if reference_time is None:
            reference_time = datetime.utcnow()

        B = 1  # batch size = 1
        cfg = self.cfg

        # Pad nếu x_hindcast < 720h (giống logic v1)
        if len(x_hindcast) < cfg.hindcast_len:
            pad = np.tile(x_hindcast[:1], (cfg.hindcast_len - len(x_hindcast), 1))
            x_hindcast = np.vstack([pad, x_hindcast])

        x_h = torch.from_numpy(x_hindcast[-cfg.hindcast_len:]).float().unsqueeze(0).to(self.device)

        _nwp0 = torch.from_numpy(nwp_src0.astype(np.float32)).unsqueeze(0).to(self.device)
        if nwp_src1 is not None:
            _nwp1 = torch.from_numpy(nwp_src1.astype(np.float32)).unsqueeze(0).to(self.device)
            avail = torch.tensor([[1.0, 1.0]], device=self.device)
        else:
            _nwp1 = torch.zeros(1, cfg.forecast_len, cfg.n_nwp_features, device=self.device)
            avail = torch.tensor([[1.0, 0.0]], device=self.device)

        rid = torch.tensor([reservoir_idx], dtype=torch.long, device=self.device)

        # Inference — không teacher forcing
        preds_sqrt = self.model(
            x_hindcast=x_h,
            reservoir_idx=rid,
            nwp_sources=[_nwp0, _nwp1],
            nwp_availability=avail,
            teacher_forcing_ratio=0.0,
        )  # (1, 168, 7)

        preds_sqrt = preds_sqrt.squeeze(0).cpu().numpy()  # (168, 7)

        # Inverse sqrt transform
        preds_q = np.clip(preds_sqrt, 0.0, None) ** 2    # (168, 7) — m³/s

        # Build response
        predictions = []
        for t in range(cfg.forecast_len):
            target_time = reference_time + timedelta(hours=t + 1)
            step = {"targetTime": target_time.strftime("%Y-%m-%dT%H:%M:%S")}
            for label, val in zip(QUANTILE_LABELS, preds_q[t].tolist()):
                step[label] = round(val, 3)
            predictions.append(step)

        return {
            "reservoirId": reservoir_idx,
            "referenceTime": reference_time.strftime("%Y-%m-%dT%H:%M:%S"),
            "modelVersion": "v2",
            "forecastHorizonHours": cfg.forecast_len,
            "quantiles": QUANTILE_LABELS,
            "predictions": predictions,
        }


def build_nwp_features_from_openmeteo(
    hourly_rain: np.ndarray,  # (168,) Open-Meteo total_precipitation hourly
    hourly_temp: np.ndarray,  # (168,) temperature_2m
    hourly_wind: np.ndarray,  # (168,) wind_speed_10m
) -> np.ndarray:              # (168, 6)
    """
    Tạo NWP feature matrix từ Open-Meteo 7-day forecast.

    Features (6):
      [0] rain_fc       — mưa raw (mm/h)
      [1] rain_fc_3h    — rolling sum 3h
      [2] rain_fc_6h    — rolling sum 6h
      [3] rain_fc_24h   — rolling sum 24h
      [4] temp_norm     — nhiệt độ chuẩn hóa (0-1)
      [5] wind_norm     — tốc độ gió chuẩn hóa (0-1)
    """
    T = len(hourly_rain)
    feats = np.zeros((T, 6), dtype=np.float32)
    feats[:, 0] = hourly_rain

    rain_pad = np.concatenate([np.zeros(23), hourly_rain])
    for t in range(T):
        feats[t, 1] = rain_pad[t+21:t+24].sum()   # 3h
        feats[t, 2] = rain_pad[t+18:t+24].sum()   # 6h
        feats[t, 3] = rain_pad[t:t+24].sum()       # 24h

    temp_min, temp_max = hourly_temp.min(), hourly_temp.max() + 1e-6
    feats[:, 4] = (hourly_temp - temp_min) / (temp_max - temp_min)

    wind_max = hourly_wind.max() + 1e-6
    feats[:, 5] = hourly_wind / wind_max

    return feats
