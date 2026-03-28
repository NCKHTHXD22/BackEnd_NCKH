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
    print(f"💻 Using device: {device}\n")

    dataset = FloodDataset()
    
    # Lấy Test indices giống hệt train_global.py
    test_indices = []
    for r in np.unique(dataset.rid):
        idx_r = np.where(dataset.rid == r)[0]
        n  = len(idx_r)
        t2 = int(0.80 * n)
        test_indices.extend(idx_r[t2:].tolist())

    test_ds  = torch.utils.data.Subset(dataset, test_indices)
    test_loader  = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    # Khởi tạo model skeleton
    model = InflowForecastModel(
        input_size=dataset.X_past.shape[2],
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS
    ).to(device)

    # Khởi tạo array để chứa kết quả chung
    all_preds_test = []
    all_targets_test = []
    all_rids_test = []

    # Lưu tạm weight của mô hình (vì phải load 16 weights khác nhau trong vòng lặp)
    # Tuy nhiên, DataLoader trả về batch có thể mix rids. 
    # Mặc định bộ test_indices đã được sort theo rids (r=1, r=2...).
    # Vậy an toàn nhất là ta gom hết test_ds, tự split inference theo từng hồ.
    
    # Do tập test của 1 hồ khá nhỏ (khoảng 7000 mẫu), ta xử lý thủ công từng hồ
    results = []
    total_mae, total_rmse, total_nse = 0, 0, 0
    valid_reservoirs = 0

    # Tạo thư mục chứa biểu đồ riêng
    os.makedirs("artifacts/charts", exist_ok=True)

    for rid in np.unique(dataset.rid):
        reservoir_name = next((v["name"] for k,v in RESERVOIRS.items() if v["idx"] == rid), f"Hồ ID={rid}")
        model_path = f"artifacts/inflow_model_rid_{rid}.pt"
        
        if not os.path.exists(model_path):
            print(f"  ❌ Bỏ qua {reservoir_name:.<30} (Không tìm thấy {model_path})")
            continue
            
        # Lấy subset test chỉ riêng của hồ này
        idx_r_test = [i for i in test_indices if dataset.rid[i] == rid]
        if len(idx_r_test) == 0:
            continue
            
        r_test_ds = torch.utils.data.Subset(dataset, idx_r_test)
        r_loader = DataLoader(r_test_ds, batch_size=BATCH_SIZE, shuffle=False)
        
        model.load_state_dict(torch.load(model_path, map_location=device))
        model.eval()
        
        preds_list = []
        targets_list = []
        
        with torch.no_grad():
            for xb_past, xb_future, yb, rid_b in r_loader:
                xb_past, xb_future, yb, rid_b = xb_past.to(device), xb_future.to(device), yb.to(device), rid_b.to(device)
                preds = model(xb_past, xb_future, rid_b)
                
                # Median = quantile 50%
                med_idx = len(QUANTILES) // 2
                q50 = preds[:, :, med_idx]
                
                preds_list.append(q50.cpu())
                targets_list.append(yb.cpu())
                
        preds_cat = torch.cat(preds_list).numpy().flatten()
        targets_cat = torch.cat(targets_list).numpy().flatten()
        
        p = preds_cat
        t = targets_cat
        
        mae = np.mean(np.abs(p - t))
        rmse = np.sqrt(np.mean((p - t)**2))
        
        t_mean = np.mean(t)
        sse = np.sum((p - t)**2)
        sst = np.sum((t - t_mean)**2)
        nse = 1 - (sse / sst) if sst != 0 else 0

        total_mae += mae
        total_rmse += rmse
        total_nse += nse
        valid_reservoirs += 1

        print(f"  {reservoir_name:.<30} NSE={nse:.3f}  MAE={mae:.2f}  RMSE={rmse:.2f}")

        results.append({
            "Reservoir_ID": rid,
            "Reservoir_Name": reservoir_name,
            "NSE": round(float(nse), 3),
            "MAE": round(float(mae), 2),
            "RMSE": round(float(rmse), 2)
        })

        # Vẽ biểu đồ riêng cho từng hồ (chỉ vẽ 500 giờ đầu tiên của 2025 để tránh rối mắt)
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
    print("\n✅ Đã lưu bảng đánh giá → ket_qua_finetune_2025.xlsx")

if __name__ == "__main__":
    evaluate_finetuned_models()
