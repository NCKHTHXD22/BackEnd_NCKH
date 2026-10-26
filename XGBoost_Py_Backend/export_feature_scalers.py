# export_feature_scalers.py
"""
Xuat mean/scale cua StandardScaler theo tung ho (LSTM_Py_Backend_v2/artifacts/<HO>/scaler.pkl)
ra config/feature_scalers.json cho main_api.py.

Ly do: dataset v2 (LSTM_Py_Backend_v2/data/dataset_builder.py, buoc 9) luu v2_X_hindcast.npy DA chuan hoa
bang StandardScaler fit rieng tung ho, va XGBoost hoc tren dung cac feature do (data/tabular_dataset.py
lay X_hindcast[:, -1, :]). Luc serving phai chuan hoa y het: (x - mean) / scale. Truoc 26/10/2026 main_api
dua feature tho vao model -> du bao cao gap ~14 lan Q den thuc do.

JSON thay cho pickle: image Docker khong can scikit-learn, khong nap pickle luc chay.
Chay lai moi khi build lai dataset v2 (scaler doi) va train lai model:
    python export_feature_scalers.py
"""
import json
import os
import pickle

from config.reservoirs import RESERVOIRS
from data.tabular_dataset import FEATURES

SRC = os.path.join("..", "LSTM_Py_Backend_v2", "artifacts")
OUT = os.path.join("config", "feature_scalers.json")

out = {"features": FEATURES, "source": "LSTM_Py_Backend_v2/artifacts/<HO>/scaler.pkl", "reservoirs": {}}
for rid, info in sorted(RESERVOIRS.items()):
    key = info["name"].replace(" ", "_")
    with open(os.path.join(SRC, key, "scaler.pkl"), "rb") as f:
        sc = pickle.load(f)
    if sc.n_features_in_ != len(FEATURES):
        raise SystemExit(f"{key}: scaler co {sc.n_features_in_} feature, FEATURES co {len(FEATURES)}")
    out["reservoirs"][key] = {
        "mean": [round(float(v), 6) for v in sc.mean_],
        "scale": [round(float(v), 6) for v in sc.scale_],
    }
    print(f"  [{rid:2d}] {key}")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(f"Ghi {OUT}: {len(out['reservoirs'])} ho x {len(FEATURES)} feature")
