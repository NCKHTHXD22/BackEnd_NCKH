"""
train_local.py
Huấn luyện độc lập mô hình Bi-LSTM cho 4 hồ chứa lớn nhất: A Vương (0), Đăk Mi 4 (1), Sông Bung 4 (2), Sông Tranh 2 (3).
Script này dựa trên luồng của quick_train.py nhưng lọc dữ liệu riêng biệt cho từng hồ.
"""
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import math
import torch
import numpy as np
from torch.utils.data import DataLoader, Subset
from tqdm import tqdm

from config.settings import (
    HIDDEN_SIZE, HORIZON, QUANTILES, NUM_RESERVOIRS,
    LR, WEIGHT_DECAY
)
from models.inflow_model import InflowForecastModel
from training.train_global import FloodDataset, hybrid_loss, compute_metrics

QUICK_EPOCHS   = 100
WARMUP_EPOCHS  = 10
TARGET_RIDS    = [0, 1, 2, 3] # A Vương, Đăk Mi 4, Sông Bung 4, Sông Tranh 2

def train_local():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    print("Loading dataset (mmap)...")
    dataset = FloodDataset()
    N = len(dataset)
    n_features = dataset.X_past.shape[2]
    
    has_future = dataset.X_future is not None
    n_future   = dataset.X_future.shape[2] if has_future else 0
    print(f"Tong mau: {N:,}  |  Features: {n_features} | X_future: {has_future}")

    os.makedirs("artifacts", exist_ok=True)

    for target_rid in TARGET_RIDS:
        print("\n" + "="*50)
        print(f"BẮT ĐẦU HUẤN LUYỆN CHO HỒ CHỨA ID = {target_rid}")
        print("="*50)
        
        # 1. Lọc dữ liệu chỉ lấy các mẫu của target_rid
        idx_r = np.where(dataset.rid == target_rid)[0]
        
        # Chia Train/Val theo tỷ lệ 80/20 (vẫn giữ nguyên trật tự thời gian)
        split = int(0.8 * len(idx_r))
        train_ds = Subset(dataset, idx_r[:split])
        val_ds   = Subset(dataset, idx_r[split:])
        print(f"Local-train: {len(train_ds)} mau | Local-val: {len(val_ds)} mau")

        # 2. Khởi tạo DataLoader
        train_loader = DataLoader(train_ds, batch_size=128, shuffle=True,  num_workers=0)
        val_loader   = DataLoader(val_ds,   batch_size=128, shuffle=False, num_workers=0)

        # 3. Khởi tạo Mô hình (Train from scratch cho từng hồ)
        model = InflowForecastModel(
            input_size=n_features,
            hidden_size=HIDDEN_SIZE,
            horizon=HORIZON,
            quantiles=QUANTILES,
            num_reservoirs=NUM_RESERVOIRS,
            n_future=n_future
        ).to(device)
        
        optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)

        def lr_lambda(epoch):
            if epoch < WARMUP_EPOCHS:
                return float(epoch + 1) / float(WARMUP_EPOCHS)
            progress = (epoch - WARMUP_EPOCHS) / max(QUICK_EPOCHS - WARMUP_EPOCHS, 1)
            return max(0.1, 0.5 * (1.0 + math.cos(math.pi * progress)))

        scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

        best_nse = -float("inf")
        model_save_path = f"artifacts/inflow_model_local_{target_rid}.pt"

        # 4. Vòng lặp huấn luyện
        for epoch in range(QUICK_EPOCHS):
            model.train()
            train_loss = 0
            
            for batch in tqdm(train_loader, desc=f"RID {target_rid} - Epoch {epoch+1}/{QUICK_EPOCHS}", leave=False):
                # Xử lý tương thích với số lượng giá trị trả về từ Dataset
                if len(batch) == 4:
                    xb_past, xb_fut, yb, rid = batch
                    xb_fut = xb_fut.to(device) if has_future else None
                else:
                    xb_past, yb, rid = batch
                    xb_fut = None

                xb_past = xb_past.to(device)
                yb, rid = yb.to(device), rid.to(device)
                
                optimizer.zero_grad()
                preds = model(xb_past, rid, x_future=xb_fut)
                loss  = hybrid_loss(preds, yb, QUANTILES)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                train_loss += loss.item()
                
            train_loss /= len(train_loader)

            # Validation
            model.eval()
            val_loss = 0
            all_p, all_t, all_r = [], [], []
            with torch.no_grad():
                for batch in val_loader:
                    if len(batch) == 4:
                        xb_past, xb_fut, yb, rid = batch
                        xb_fut = xb_fut.to(device) if has_future else None
                    else:
                        xb_past, yb, rid = batch
                        xb_fut = None
                    
                    xb_past = xb_past.to(device)
                    yb, rid = yb.to(device), rid.to(device)
                    
                    preds = model(xb_past, rid, x_future=xb_fut)
                    val_loss += hybrid_loss(preds, yb, QUANTILES).item()
                    all_p.append(preds.cpu()); all_t.append(yb.cpu()); all_r.append(rid.cpu())
                    
            val_loss /= len(val_loader)

            mae, rmse, nse = compute_metrics(torch.cat(all_p), torch.cat(all_t), torch.cat(all_r))
            scheduler.step()
            current_lr = optimizer.param_groups[0]['lr']
            
            print(f"Epoch {epoch+1:2d}/{QUICK_EPOCHS} | LR {current_lr:.6f} | "
                  f"Train {train_loss:.4f} | Val {val_loss:.4f} | MAE {mae:.1f} | RMSE {rmse:.1f} | NSE {nse:.3f}")

            if nse > best_nse:
                best_nse = nse
                torch.save(model.state_dict(), model_save_path)
                print(f"  -> Saved {model_save_path} (Kỷ lục NSE: {nse:.3f})")

    print("\nHoàn tất huấn luyện Local Models cho 4 hồ.")

if __name__ == "__main__":
    train_local()
