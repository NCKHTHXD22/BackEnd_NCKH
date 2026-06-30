import torch
from config.settings import HORIZON, QUANTILES, NUM_RESERVOIRS
from models.inflow_model import InflowForecastModel

def get_features_for_input_size(input_size):
    if input_size == 22:
        return [
            "rain","rain_3h","rain_6h","rain_12h", "rain_24h", "rain_intensity",
            "rain_lag_1","rain_lag_3","rain_lag_6",
            "inflow","inflow_prev","inflow_diff", "inflow_diff_2",
            "inflow_3h_avg","inflow_6h_avg", "inflow_12h_avg",
            "hour_sin","hour_cos","doy_sin","doy_cos", "month_sin","month_cos"
        ]
    elif input_size == 36:
        return [
            "rain", "rain_3h", "rain_6h", "rain_12h", "rain_24h",
            "rain_48h", "rain_72h", "rain_96h", "rain_120h", "rain_168h",
            "rain_intensity", "rain_12h_std", "rain_24h_max",
            "rain_lag_1", "rain_lag_3", "rain_lag_6", "rain_lag_12", "rain_lag_24",
            "inflow", "inflow_prev", "inflow_diff", "inflow_diff_2",
            "inflow_3h_avg", "inflow_6h_avg", "inflow_12h_avg",
            "inflow_24h_avg", "inflow_48h_avg", "inflow_rising",
            "rain_inflow_interaction", "soil_moisture_x_inflow",
            "hour_sin", "hour_cos", "doy_sin", "doy_cos", "month_sin", "month_cos",
        ]
    elif input_size == 44:
        return [
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
    else:
        raise ValueError(f"Unknown input_size {input_size}. Cannot determine feature list.")

def load_model_from_checkpoint(state_dict_path, device):
    state_dict = torch.load(state_dict_path, map_location=device, weights_only=True)
    
    input_size = state_dict['hindcast_embedding.weight'].shape[1]
    hidden_size = state_dict['encoder.weight_hh_l0'].shape[1]
    
    if "future_embedding.weight" in state_dict:
        n_future = state_dict["future_embedding.weight"].shape[1]
    else:
        n_future = 0
        
    model = InflowForecastModel(
        input_size=input_size,
        hidden_size=hidden_size,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS,
        n_future=n_future
    ).to(device)
    
    model.load_state_dict(state_dict)
    model.eval()
    
    features = get_features_for_input_size(input_size)
    
    return model, features, n_future
