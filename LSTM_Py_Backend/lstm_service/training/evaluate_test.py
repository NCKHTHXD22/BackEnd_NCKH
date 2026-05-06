import os
import torch
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from torch.utils.data import DataLoader

from config.settings import *
from config.reservoirs import RESERVOIRS
from models.inflow_model import InflowForecastModel
from training.train_global import FloodDataset

def evaluate_finetuned_models():
    print("\n" + "="*70)
    print("ĐÁNH GIÁ TRÊN TẬP TEST 2025 (FINE-TUNED MODELS)")
    print("="*70)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}\n")

    dataset = FloodDataset()

    # Lấy Test indices: timestamps >= 2025-01-01 (khớp với train_global.py)
    TEST_START = np.datetime64("2025-09-01", "s")
    ts_path = "dataset_timestamps.npy"
    if not os.path.exists(ts_path):
        raise FileNotFoundError("Thiếu dataset_timestamps.npy — rebuild dataset trước.")
    timestamps = np.load(ts_path)
    test_indices = np.where(timestamps >= TEST_START)[0].tolist()

    # Khởi tạo model skeleton
    n_future = dataset.X_future.shape[2] if dataset.X_future is not None else 0
    model = InflowForecastModel(
        input_size=dataset.X_past.shape[2],
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS,
        n_future=n_future,
    ).to(device)
    has_future = dataset.X_future is not None

    results = []
    total_mae, total_rmse, total_nse = 0, 0, 0
    valid_reservoirs = 0

    os.makedirs("artifacts/charts", exist_ok=True)

    for rid in np.unique(dataset.rid):
        reservoir_name = next((v["name"] for k,v in RESERVOIRS.items() if v["idx"] == rid), f"Hồ ID={rid}")
        model_path = f"artifacts/inflow_model_rid_{rid}.pt"

        if not os.path.exists(model_path):
            print(f"  Bỏ qua {reservoir_name:.<30} (Không tìm thấy {model_path})")
            continue

        # Lấy subset test chỉ riêng của hồ này
        idx_r_test = [i for i in test_indices if dataset.rid[i] == rid]
        if len(idx_r_test) == 0:
            continue

        r_test_ds = torch.utils.data.Subset(dataset, idx_r_test)
        r_loader = DataLoader(r_test_ds, batch_size=BATCH_SIZE, shuffle=False)

        model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
        model.eval()

        preds_list = []
        targets_list = []

        with torch.no_grad():
            for xb_past, xb_fut, yb, rid_b in r_loader:
                xb_past, yb, rid_b = xb_past.to(device), yb.to(device), rid_b.to(device)
                xb_fut = xb_fut.to(device) if has_future else None
                preds = model(xb_past, rid_b, x_future=xb_fut)

                med_idx = len(QUANTILES) // 2
                q50 = preds[:, :, med_idx]

                preds_list.append(q50.cpu())
                targets_list.append(yb.cpu())

        preds_cat = torch.cat(preds_list).numpy().flatten()
        targets_cat = torch.cat(targets_list).numpy().flatten()

        # Inverse sqrt transform để tính metrics trên m3/s thực
        p = preds_cat ** 2
        t = targets_cat ** 2

        mae = np.mean(np.abs(p - t))
        rmse = np.sqrt(np.mean((p - t)**2))

        t_mean = np.mean(t)
        sse = np.sum((p - t)**2)
        sst = np.sum((t - t_mean)**2)
        nse = 1 - (sse / sst) if sst != 0 else 0

        # Peak-Timing: trung binh so buoc thoi gian lech dinh lu
        p_2d = preds_cat.reshape(-1, HORIZON)
        t_2d = targets_cat.reshape(-1, HORIZON)
        peak_timing_errors = np.abs(p_2d.argmax(axis=1) - t_2d.argmax(axis=1))
        peak_timing = np.mean(peak_timing_errors)

        # Missed-Peaks: % dinh lu (top 5%) bi bo sot
        thr_95 = np.percentile(t, 95)
        is_peak = t >= thr_95
        missed = np.mean(p[is_peak] < thr_95) if is_peak.sum() > 0 else 0.0

        # FHV: bias tren top 2% lu luong cao nhat
        thr_98 = np.percentile(t, 98)
        mask_high = t >= thr_98
        fhv = (np.sum(p[mask_high] - t[mask_high]) / (np.sum(t[mask_high]) + 1e-8)) if mask_high.sum() > 0 else 0.0

        total_mae += mae
        total_rmse += rmse
        total_nse += nse
        valid_reservoirs += 1

        print(f"  {reservoir_name:.<30} NSE={nse:.3f}  MAE={mae:.2f}  RMSE={rmse:.2f}  PeakTiming={peak_timing:.1f}h  Missed={missed*100:.1f}%  FHV={fhv*100:.1f}%")

        results.append({
            "Reservoir_ID": rid,
            "Reservoir_Name": reservoir_name,
            "NSE": round(float(nse), 3),
            "MAE (m3/s)": round(float(mae), 2),
            "RMSE (m3/s)": round(float(rmse), 2),
            "Peak_Timing (h)": round(float(peak_timing), 2),
            "Missed_Peaks (%)": round(float(missed * 100), 1),
            "FHV (%)": round(float(fhv * 100), 1),
        })

        # Vẽ biểu đồ 500 giờ đầu tiên
        plt.figure(figsize=(12, 5))
        plt.plot(t[:500], label='Thực tế (Q_actual)', color='blue', alpha=0.7, linewidth=1.5)
        plt.plot(p[:500], label='Dự báo P50 (Q_predict)', color='red', alpha=0.7, linestyle='--', linewidth=1.5)
        plt.title(f"{reservoir_name} | Đánh giá Test 2025 | NSE: {nse:.2f}", fontsize=12, fontweight='bold')
        plt.xlabel("Thời gian (Giờ liên tục)")
        plt.ylabel("Lưu lượng (m3/s)")
        plt.legend()
        plt.grid(True, linestyle=':', alpha=0.6)
        plt.tight_layout()

        safe_name = reservoir_name.replace(' ', '_').replace('/', '_')
        plt.savefig(f"artifacts/charts/{rid:02d}_{safe_name}.png", dpi=150)
        plt.close()

    if valid_reservoirs > 0:
        print(f"\n  NSE TRUNG BÌNH: {total_nse/valid_reservoirs:.3f}  |  MAE: {total_mae/valid_reservoirs:.2f}  |  RMSE: {total_rmse/valid_reservoirs:.2f}")

    df_results = pd.DataFrame(results)
    df_results.to_excel("ket_qua_finetune_2025.xlsx", index=False)
    print("\nĐã lưu bảng đánh giá → ket_qua_finetune_2025.xlsx")

if __name__ == "__main__":
    evaluate_finetuned_models()
