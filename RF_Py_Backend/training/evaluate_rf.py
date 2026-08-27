# training/evaluate_rf.py
"""
Danh gia mo hinh Random Forest tren tap test 2025 (flood season holdout, cung
khoang ngay voi LSTM/XGBoost -- xem config/settings.py) -- dung event_metrics.py
(NSE, KGE, R2, RMSE/MAE theo horizon cu the, PICP cho quantile coverage).

Xuat:
  ket_qua_danh_gia_2025_rf.xlsx    -- NSE/KGE/R2/MAE/RMSE + PICP theo tung ho
  ket_qua_nse_theo_gio_rf.xlsx     -- NSE theo tung nhom lead-time (6h/nhom)

Chay: python training/evaluate_rf.py
Yeu cau: da chay training/train_rf.py (co du 24 file .joblib trong artifacts/rf/).
"""
import sys
import numpy as np
import pandas as pd
import joblib

if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from config.settings import HORIZON, QUANTILES
from config.reservoirs import RESERVOIRS
from training.event_metrics import (
    nse_single, kge_single, r2_single, picp,
    nse_per_horizon, flood_event_diagnostics, extract_lead_time_series,
)
from training.train_rf import ARTIFACT_DIR
from data.tabular_dataset import build_tabular_dataset, split_60_20_20


def load_models():
    models = {}
    for h in range(HORIZON):
        models[h] = joblib.load(f"{ARTIFACT_DIR}/h{h + 1:02d}.joblib")
    return models


def predict_all(models: dict, X: np.ndarray) -> np.ndarray:
    """Tra ve (N, HORIZON, n_quantiles), da sort quantile de chong crossing."""
    N = X.shape[0]
    preds = np.zeros((N, HORIZON, len(QUANTILES)), dtype=np.float32)
    for h in range(HORIZON):
        preds[:, h, :] = models[h].predict(X, quantiles=QUANTILES)
    preds = np.sort(preds, axis=2)
    return preds


def evaluate():
    X, y, rid, ts = build_tabular_dataset()
    _, _, test_idx = split_60_20_20(ts)
    if len(test_idx) == 0:
        raise RuntimeError("Test set rong -- kiem tra dataset co du lieu >= TEST_START khong.")

    print(f"Test samples: {len(test_idx):,}")
    models = load_models()

    preds = predict_all(models, X[test_idx])          # (N, HORIZON, 3), sqrt space
    med_idx = len(QUANTILES) // 2
    preds_med = preds[:, :, med_idx]
    preds_p10 = preds[:, :, 0]
    preds_p90 = preds[:, :, -1]

    # Inverse sqrt transform: x^2 (v2_y.npy da la sqrt-space, cap san)
    preds_raw   = np.clip(preds_med, 0, None) ** 2
    p10_raw     = np.clip(preds_p10, 0, None) ** 2
    p90_raw     = np.clip(preds_p90, 0, None) ** 2
    targets_raw = y[test_idx] ** 2
    rids_test   = rid[test_idx]

    idx_to_name = {info["idx"]: info["name"] for _, info in RESERVOIRS.items()}

    results_rows = []
    nse_dict = {}
    for r_idx in sorted(idx_to_name.keys()):
        mask = rids_test == r_idx
        if not mask.any():
            continue
        p_r, t_r = preds_raw[mask].reshape(-1), targets_raw[mask].reshape(-1)
        nse = nse_single(t_r, p_r)
        if np.isnan(nse):
            continue
        nse_dict[r_idx] = nse
        kge = kge_single(t_r, p_r)
        r2 = r2_single(t_r, p_r)
        mae = float(np.mean(np.abs(p_r - t_r)))
        rmse = float(np.sqrt(np.mean((p_r - t_r) ** 2)))
        cov = picp(targets_raw[mask].reshape(-1), p10_raw[mask].reshape(-1), p90_raw[mask].reshape(-1))
        name = idx_to_name[r_idx]
        results_rows.append({
            "Reservoir": name, "NSE": round(nse, 4), "KGE": round(kge, 4), "R2": round(r2, 4),
            "MAE (m³/s)": round(mae, 2), "RMSE (m³/s)": round(rmse, 2),
            "PICP (P10-P90)": cov["picp"], "Mean Interval Width": cov["mean_interval_width"],
        })
        print(f"  {name:.<30} NSE={nse:.3f}  KGE={kge:.3f}  R2={r2:.3f}  "
              f"MAE={mae:.2f}  RMSE={rmse:.2f}  PICP={cov['picp']:.2f}")

    avg_nse = sum(nse_dict.values()) / len(nse_dict) if nse_dict else 0.0
    results_rows.append({"Reservoir": "--- AVERAGE ---", "NSE": round(avg_nse, 4)})
    print(f"\n  NSE AVERAGE ({len(nse_dict)} ho): {avg_nse:.3f}")

    pd.DataFrame(results_rows).to_excel("ket_qua_danh_gia_2025_rf.xlsx", index=False)
    print("\nSaved: ket_qua_danh_gia_2025_rf.xlsx")

    print("\n" + "=" * 70)
    print("CHAN DOAN BO SUNG: NSE THEO LEAD-TIME & TUNG TRAN LU")
    print("=" * 70)

    horizon_rows = []
    for r_idx in sorted(nse_dict.keys()):
        name = idx_to_name[r_idx]
        mask = rids_test == r_idx
        p_r, t_r = preds_raw[mask], targets_raw[mask]

        for hrow in nse_per_horizon(p_r, t_r, group_hours=6):
            horizon_rows.append({"Reservoir": name, **hrow})

        obs_series, pred_series = extract_lead_time_series(p_r, t_r, lead_idx=HORIZON - 1)
        if len(obs_series) > 10 and obs_series.max() > 0:
            thr = float(np.percentile(obs_series, 90))
            diag = flood_event_diagnostics(obs_series, pred_series, threshold=thr)
            print(f"  {name:.<30} [lead={HORIZON}h] n_events={diag['n_events']:>3}  "
                  f"NSE_event={diag['mean_event_nse']}  peak_RE={diag['peak_re_mean']}  "
                  f"QA={diag['qa_pass_rate']}")

    pd.DataFrame(horizon_rows).to_excel("ket_qua_nse_theo_gio_rf.xlsx", index=False)
    print("\nSaved: ket_qua_nse_theo_gio_rf.xlsx")


if __name__ == "__main__":
    evaluate()
