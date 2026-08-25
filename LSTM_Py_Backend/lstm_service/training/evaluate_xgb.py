# training/evaluate_xgb.py
"""
Đánh giá mô hình XGBoost trên tập test 2025 (flood season holdout, cùng
khoảng ngày với LSTM) — tái dùng training/event_metrics.py nguyên bản (model-
agnostic, chỉ nhận numpy array) để 2 mô hình so sánh được trên cùng thước đo.

Xuất:
  ket_qua_danh_gia_2025_xgb.xlsx   — NSE/MAE/RMSE theo từng hồ (giống LSTM)
  ket_qua_nse_theo_gio_xgb.xlsx    — NSE theo từng nhóm lead-time (giống LSTM)

Chạy: python training/evaluate_xgb.py
Yêu cầu: đã chạy training/train_xgb.py (có đủ 72 file .json trong artifacts/xgb/).
"""
import sys
import numpy as np
import pandas as pd
import xgboost as xgb

# Xem giai thich trong training/train_xgb.py — tranh UnicodeEncodeError khi
# print() co dau tieng Viet tren console Windows mac dinh (cp1252).
if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from config.settings import QUANTILES, HORIZON
from config.reservoirs import RESERVOIRS
from training.event_metrics import nse_per_horizon, flood_event_diagnostics, extract_lead_time_series
from training.train_xgb import load_dataset, clip_targets, build_features, split_by_date, ARTIFACT_DIR


def load_boosters():
    models = {}
    for h in range(HORIZON):
        for q in QUANTILES:
            bst = xgb.Booster()
            bst.load_model(f"{ARTIFACT_DIR}/h{h+1:02d}_q{int(q*100):02d}.json")
            models[(h, q)] = bst
    return models


def predict_all(models: dict, X_full: np.ndarray) -> np.ndarray:
    """Trả về (N, HORIZON, n_quantiles), đã sort theo quantile để tránh crossing
    (cùng trick với main_api.py: np.sort(preds, axis=-1))."""
    N = X_full.shape[0]
    preds = np.zeros((N, HORIZON, len(QUANTILES)), dtype=np.float32)
    dmat = xgb.DMatrix(X_full)
    for h in range(HORIZON):
        for qi, q in enumerate(QUANTILES):
            preds[:, h, qi] = models[(h, q)].predict(dmat)
    preds = np.sort(preds, axis=2)
    return preds


def evaluate():
    X, y, rid, ts = load_dataset()
    y = clip_targets(y, rid)
    X_full = build_features(X, rid)
    _, _, test_idx = split_by_date(ts)
    if len(test_idx) == 0:
        raise RuntimeError("Test set rỗng — kiểm tra dataset_ts_tabular.npy có dữ liệu >= 2025-09-01 không.")

    print(f"Test samples: {len(test_idx):,}")
    models = load_boosters()

    preds = predict_all(models, X_full[test_idx])          # (N, HORIZON, 3), sqrt space
    med_idx = len(QUANTILES) // 2
    preds_med = preds[:, :, med_idx]

    # Inverse sqrt transform: x^2
    preds_raw   = preds_med ** 2
    targets_raw = y[test_idx] ** 2
    rids_test   = rid[test_idx]

    mae  = float(np.mean(np.abs(preds_raw - targets_raw)))
    rmse = float(np.sqrt(np.mean((preds_raw - targets_raw) ** 2)))

    idx_to_name = {info["idx"]: info["name"] for _, info in RESERVOIRS.items()}

    results_rows = []
    nse_dict = {}
    for r_idx in sorted(idx_to_name.keys()):
        mask = rids_test == r_idx
        if not mask.any():
            continue
        p_r, t_r = preds_raw[mask], targets_raw[mask]
        mean_obs = t_r.mean()
        ss_res = np.sum((t_r - p_r) ** 2)
        ss_tot = np.sum((t_r - mean_obs) ** 2)
        if ss_tot <= 0:
            continue
        nse = float(1 - ss_res / ss_tot)
        nse_dict[r_idx] = nse
        r_mae  = float(np.mean(np.abs(p_r - t_r)))
        r_rmse = float(np.sqrt(np.mean((p_r - t_r) ** 2)))
        name = idx_to_name[r_idx]
        results_rows.append({"Reservoir": name, "NSE": round(nse, 4),
                              "MAE (m³/s)": round(r_mae, 2), "RMSE (m³/s)": round(r_rmse, 2)})
        print(f"  {name:.<30} NSE={nse:.3f}  MAE={r_mae:.2f}  RMSE={r_rmse:.2f}")

    avg_nse = sum(nse_dict.values()) / len(nse_dict) if nse_dict else 0.0
    results_rows.append({"Reservoir": "--- AVERAGE ---", "NSE": round(avg_nse, 4),
                          "MAE (m³/s)": round(mae, 2), "RMSE (m³/s)": round(rmse, 2)})
    print(f"\n  NSE AVERAGE ({len(nse_dict)} ho): {avg_nse:.3f}  |  MAE: {mae:.2f}  |  RMSE: {rmse:.2f}")

    pd.DataFrame(results_rows).to_excel("ket_qua_danh_gia_2025_xgb.xlsx", index=False)
    print("\nSaved: ket_qua_danh_gia_2025_xgb.xlsx")

    # ── NSE theo lead-time + chẩn đoán từng trận lũ (giống train_global.py) ──
    print("\n" + "=" * 70)
    print("CHẨN ĐOÁN BỔ SUNG: NSE THEO LEAD-TIME & TỪNG TRẬN LŨ")
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

    pd.DataFrame(horizon_rows).to_excel("ket_qua_nse_theo_gio_xgb.xlsx", index=False)
    print("\nSaved: ket_qua_nse_theo_gio_xgb.xlsx")


if __name__ == "__main__":
    evaluate()
