# training/evaluate_xgb.py
"""
Danh gia mo hinh XGBoost tren tap test 2025 (flood season holdout)
Dung event_metrics.py (NSE, KGE, R2, RMSE/MAE, PICP cho quantile coverage)
Kem phan ra danh gia theo Mua Kho (T1-8) va Mua Mua (T9-12).

Chay:
    python training/evaluate_xgb.py                                      # Global model
    python training/evaluate_xgb.py --artifact-dir artifacts/xgb_branch/A_VUONG
    python training/evaluate_xgb.py --artifact-dir artifacts/xgb_basin/VU_GIA
"""
import os
import sys
import json
import argparse
import numpy as np
import pandas as pd
import xgboost as xgb

if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from config.settings import QUANTILES, HORIZON
from config.reservoirs import RESERVOIRS
from training.event_metrics import (
    nse_single, kge_single, r2_single, picp,
    nse_per_horizon, flood_event_diagnostics, extract_lead_time_series,
)
from data.tabular_dataset import build_tabular_dataset, split_60_20_20


def load_boosters(artifact_dir: str):
    models = {}
    for h in range(HORIZON):
        for q in QUANTILES:
            path = os.path.join(artifact_dir, f"h{h + 1:02d}_q{int(q * 100):02d}.json")
            if not os.path.exists(path):
                raise FileNotFoundError(f"Không tìm thấy file model: {path}")
            bst = xgb.Booster()
            bst.load_model(path)
            models[(h, q)] = bst
    return models


def predict_all(models: dict, X: np.ndarray) -> np.ndarray:
    """Tra ve (N, HORIZON, n_quantiles), da sort de chong quantile crossing."""
    N = X.shape[0]
    preds = np.zeros((N, HORIZON, len(QUANTILES)), dtype=np.float32)
    dmat = xgb.DMatrix(X)
    for h in range(HORIZON):
        for qi, q in enumerate(QUANTILES):
            preds[:, h, qi] = models[(h, q)].predict(dmat)
    preds = np.sort(preds, axis=2)
    return preds


def evaluate(artifact_dir: str = "artifacts/xgb", output_prefix: str = "xgb", json_out_dir: str = None,
             data: tuple = None):
    """json_out_dir: nếu truyền vào, lưu thêm 1 file <Ten_Ho>.json / hồ (đầy đủ
    metric: nse/nse_dry/nse_rainy/kge/r2/mae/rmse/horizons/picp) -- dùng để
    main_generate_excel_summary.py gộp nhiều lần evaluate() (single/branch/
    basin x season) lại thành 1 bảng so sánh, không phải đọc lại từ Excel.

    data: (X, y, rid, ts) đã build sẵn (build_tabular_dataset()) -- truyền vào
    khi gọi evaluate() NHIỀU LẦN liên tiếp (vd notebook master train+eval tuần
    tự single/nhánh/lưu vực/fine-tune x mùa, ~70 lần gọi) để khỏi build lại
    dataset từ đĩa mỗi lần (rất tốn thời gian). None = tự build (dùng CLI)."""
    print("=" * 70)
    print(f"ĐÁNH GIÁ XGBOOST MODEL: {artifact_dir}")
    print("=" * 70)

    X, y, rid, ts = data if data is not None else build_tabular_dataset()
    _, _, test_idx = split_60_20_20(ts)
    if len(test_idx) == 0:
        raise RuntimeError("Test set rong -- kiem tra du lieu >= TEST_START.")

    print(f"Test samples: {len(test_idx):,}")
    models = load_boosters(artifact_dir)

    preds = predict_all(models, X[test_idx])
    med_idx = len(QUANTILES) // 2
    preds_med = preds[:, :, med_idx]
    preds_p10 = preds[:, :, 0]
    preds_p90 = preds[:, :, -1]

    preds_raw   = np.clip(preds_med, 0, None) ** 2
    p10_raw     = np.clip(preds_p10, 0, None) ** 2
    p90_raw     = np.clip(preds_p90, 0, None) ** 2
    targets_raw = y[test_idx] ** 2
    rids_test   = rid[test_idx]
    ts_test     = ts[test_idx]

    test_months = ts_test.astype("datetime64[M]").astype(int) % 12 + 1
    dry_mask_all = np.isin(test_months, [1, 2, 3, 4, 5, 6, 7, 8])
    rainy_mask_all = np.isin(test_months, [9, 10, 11, 12])

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

        # Phân rã theo mùa
        mask_dry = mask & dry_mask_all
        mask_rainy = mask & rainy_mask_all
        nse_dry = nse_single(targets_raw[mask_dry].reshape(-1), preds_raw[mask_dry].reshape(-1)) if mask_dry.any() else np.nan
        nse_rainy = nse_single(targets_raw[mask_rainy].reshape(-1), preds_raw[mask_rainy].reshape(-1)) if mask_rainy.any() else np.nan
        rmse_dry = float(np.sqrt(np.mean((preds_raw[mask_dry] - targets_raw[mask_dry]) ** 2))) if mask_dry.any() else np.nan
        rmse_rainy = float(np.sqrt(np.mean((preds_raw[mask_rainy] - targets_raw[mask_rainy]) ** 2))) if mask_rainy.any() else np.nan

        # Phân rã theo mốc lead-time cụ thể (3h/6h/12h/24h)
        horizons = {}
        for hz in (3, 6, 12, 24):
            if hz > preds_raw.shape[1]:
                continue
            p_h, t_h = preds_raw[mask, hz - 1], targets_raw[mask, hz - 1]
            nse_h = nse_single(t_h, p_h)
            rmse_h = float(np.sqrt(np.mean((p_h - t_h) ** 2)))
            horizons[f"{hz}h"] = {"nse": round(nse_h, 4) if not np.isnan(nse_h) else None, "rmse": round(rmse_h, 2)}

        name = idx_to_name[r_idx]
        row_metrics = {
            "reservoir": name, "nse": round(nse, 4), "kge": round(kge, 4), "r2": round(r2, 4),
            "mae": round(mae, 2), "rmse": round(rmse, 2),
            "nse_dry_season": round(nse_dry, 4) if not np.isnan(nse_dry) else None,
            "nse_rainy_season": round(nse_rainy, 4) if not np.isnan(nse_rainy) else None,
            "rmse_dry_season": round(rmse_dry, 2) if not np.isnan(rmse_dry) else None,
            "rmse_rainy_season": round(rmse_rainy, 2) if not np.isnan(rmse_rainy) else None,
            "picp_p10_p90": cov["picp"], "mean_interval_width": cov["mean_interval_width"],
            "horizons": horizons,
        }
        results_rows.append({
            "Reservoir": name,
            "NSE (Cả năm)": round(nse, 4),
            "NSE (Mùa khô T1-8)": round(nse_dry, 4) if not np.isnan(nse_dry) else "N/A",
            "NSE (Mùa mưa T9-12)": round(nse_rainy, 4) if not np.isnan(nse_rainy) else "N/A",
            "KGE": round(kge, 4),
            "R2": round(r2, 4),
            "MAE (m³/s)": round(mae, 2),
            "RMSE (m³/s)": round(rmse, 2),
            "PICP (P10-P90)": cov["picp"],
            "Mean Interval Width": cov["mean_interval_width"],
        })
        print(f"  {name:.<28} NSE={nse:.3f} | NSE_Dry={nse_dry:.3f} | NSE_Rainy={nse_rainy:.3f} | KGE={kge:.3f}")

        if json_out_dir:
            os.makedirs(json_out_dir, exist_ok=True)
            with open(os.path.join(json_out_dir, f"{name.replace(' ', '_')}.json"), "w", encoding="utf-8") as f:
                json.dump(row_metrics, f, ensure_ascii=False, indent=2)

    avg_nse = sum(nse_dict.values()) / len(nse_dict) if nse_dict else 0.0
    results_rows.append({"Reservoir": "--- AVERAGE ---", "NSE (Cả năm)": round(avg_nse, 4)})
    print(f"\n  NSE AVERAGE ({len(nse_dict)} hồ): {avg_nse:.3f}")

    excel_out = f"ket_qua_danh_gia_2025_{output_prefix}.xlsx"
    pd.DataFrame(results_rows).to_excel(excel_out, index=False)
    print(f"\nSaved: {excel_out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Đánh giá mô hình XGBoost")
    parser.add_argument("--artifact-dir", type=str, default="artifacts/xgb", help="Thư mục chứa 72 file json")
    parser.add_argument("--output-prefix", type=str, default="xgb", help="Tiền tố file excel xuất ra")
    args = parser.parse_args()

    evaluate(artifact_dir=args.artifact_dir, output_prefix=args.output_prefix)

