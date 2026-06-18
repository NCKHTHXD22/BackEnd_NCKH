"""
HueFloodPredictor — Inference pipeline cho HueLSTM.

Chế độ vận hành (production):
  1. Fetch 31 ngày lịch sử thủy văn + mưa từ VNDMS/API
  2. Fetch Open-Meteo 7-day NWP forecast
  3. Feature engineering (build_feature_matrix + build_nwp_features)
  4. Normalize (dùng scaler đã fit trong training)
  5. Inference HueLSTM
  6. Inverse sqrt transform → m³/s
  7. Tra cứu risk level → cảnh báo lũ

Tích hợp với api/main.py qua route POST /predict/{basin_id}
"""

import os
import pickle
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import torch

from config.settings import HueLSTMConfig
from config.basins import BASINS, BASIN_ID_TO_KEY, get_basin
from config.thresholds import RISK_LEVELS, get_risk_level, is_flood_season
from data.feature_builder import build_feature_matrix, build_nwp_features
from data.nwp_fetcher import fetch_nwp_forecast, nwp_to_arrays
from models.hue_lstm import HueLSTM


QUANTILE_LABELS = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]


class HueFloodPredictor:
    """
    Production predictor — load model một lần, predict nhiều lần.

    Cách dùng trong FastAPI:
        predictor = HueFloodPredictor("artifacts/hue_lstm.pt")

        @app.post("/predict/{basin_id}")
        async def predict(basin_id: int):
            return predictor.predict(basin_id, hist_data_fetcher_fn)
    """

    def __init__(self, model_path: str, device: str = "cpu"):
        self.device = torch.device(device)

        cfg_path = model_path.replace(".pt", "_config.pt")
        self.cfg: HueLSTMConfig = torch.load(cfg_path, map_location="cpu", weights_only=False)

        self.model = HueLSTM(self.cfg).to(self.device)
        state = torch.load(model_path, map_location=self.device, weights_only=True)
        self.model.load_state_dict(state)
        self.model.eval()

        # Load scaler (fit trong training, sau khi có data)
        scaler_path = os.path.join(os.path.dirname(model_path), "hue_scaler.pkl")
        self.scaler = None
        if os.path.exists(scaler_path):
            with open(scaler_path, "rb") as f:
                self.scaler = pickle.load(f)

        print(f"HueFloodPredictor loaded: {model_path} | device={device}")

    @torch.no_grad()
    def predict(
        self,
        basin_key: str,            # "ta_trach" / "binh_dien" / "huong_dien"
        x_hist_raw: np.ndarray,    # (T_hist, 47) features chưa scale (≥720 timesteps)
        nwp_forecast: dict,        # output của fetch_nwp_forecast()
        reference_time: datetime | None = None,
    ) -> dict[str, Any]:
        """
        Args:
            basin_key      : key của hồ (xem config/basins.py)
            x_hist_raw     : (T_hist, 47) observation features, chưa normalize
            nwp_forecast   : dict từ data/nwp_fetcher.fetch_nwp_forecast()
            reference_time : thời điểm issue date (mặc định = now UTC+7)

        Returns:
            {
              "basin": "Hồ Tả Trạch",
              "referenceTime": "...",
              "forecastHorizonHours": 168,
              "predictions": [...],   # list 168 steps × 7 quantiles
              "floodAlert": "low"|"moderate"|"high"|"extreme",
              "peakForecast": {...},  # peak P50 + timing
            }
        """
        if reference_time is None:
            from datetime import timezone
            reference_time = datetime.now(timezone.utc)

        basin = get_basin(basin_key)
        basin_id = basin["id"]
        cfg = self.cfg

        # Normalize x_hist
        if self.scaler is not None:
            T = x_hist_raw.shape[0]
            x_scaled = self.scaler.transform(x_hist_raw.reshape(-1, x_hist_raw.shape[-1])).reshape(T, -1)
        else:
            x_scaled = x_hist_raw.copy()

        # Pad nếu ngắn hơn hindcast_len
        if len(x_scaled) < cfg.hindcast_length:
            pad_n = cfg.hindcast_length - len(x_scaled)
            x_scaled = np.vstack([np.tile(x_scaled[:1], (pad_n, 1)), x_scaled])
        x_scaled = x_scaled[-cfg.hindcast_length:]

        # NWP features
        rain, temp, wind, pressure, rh = nwp_to_arrays(nwp_forecast)
        x_nwp = build_nwp_features(rain, temp, wind, pressure, rh)  # (168, 8)
        x_nwp = x_nwp[:cfg.forecast_length]

        # Tensors
        x_h = torch.from_numpy(x_scaled).float().unsqueeze(0).to(self.device)    # (1, 720, 47)
        x_n = torch.from_numpy(x_nwp).float().unsqueeze(0).to(self.device)       # (1, 168, 8)
        bid = torch.tensor([basin_id], dtype=torch.long, device=self.device)

        # Inference
        out = self.model(x_h, x_n, bid)

        if cfg.head == "quantile":
            preds_sqrt = out.squeeze(0).cpu().numpy()  # (168, 7)
        else:
            preds_sqrt = self.model.head.sample_quantiles(out, cfg.quantiles).squeeze(0).cpu().numpy()

        preds_q = np.clip(preds_sqrt, 0, None) ** 2  # inverse √Q → Q (m³/s)

        # Build response
        predictions = []
        for t in range(cfg.forecast_length):
            target_time = reference_time + timedelta(hours=t + 1)
            step = {"targetTime": target_time.strftime("%Y-%m-%dT%H:%M:%S")}
            for label, val in zip(QUANTILE_LABELS, preds_q[t].tolist()):
                step[label] = round(val, 2)
            predictions.append(step)

        # Peak forecast (P50)
        p50 = preds_q[:, 3]  # index 3 = P50
        peak_idx = int(np.argmax(p50))
        peak_val = float(p50[peak_idx])
        peak_time = (reference_time + timedelta(hours=peak_idx + 1)).strftime("%Y-%m-%dT%H:%M:%S")

        # Risk level (theo config/thresholds.py)
        risk = get_risk_level(basin_key, peak_val)

        return {
            "basin":              basin["name"],
            "basinId":            basin_id,
            "referenceTime":      reference_time.strftime("%Y-%m-%dT%H:%M:%S"),
            "forecastHorizonHours": cfg.forecast_length,
            "modelVersion":       "hue_lstm_v1",
            "quantiles":          QUANTILE_LABELS,
            "predictions":        predictions,
            "floodAlert":         risk,
            "floodSeason":        is_flood_season(reference_time.month),
            "peakForecast": {
                "time":       peak_time,
                "p50_m3s":    round(peak_val, 1),
                "p10_m3s":    round(float(preds_q[peak_idx, 1]), 1),
                "p90_m3s":    round(float(preds_q[peak_idx, 5]), 1),
                "leadTimeHours": peak_idx + 1,
            },
        }
