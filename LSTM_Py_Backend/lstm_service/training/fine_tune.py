import os
import torch
import numpy as np
import pandas as pd
from torch.utils.data import DataLoader
from tqdm import tqdm
import math

from config.settings import *
from config.reservoirs import RESERVOIRS
from models.inflow_model import InflowForecastModel
from models.quantile_loss import quantile_loss
from training.train_global import FloodDataset, hybrid_loss

def split_data_chronological(X_past, X_future, y, val_ratio=0.25):
    # Dữ liệu đã được sort theo thời gian từ dataset_builder
    # Ở giai đoạn fine-tuning, ta lấy 2022-2024 (do 2025 là test set giữ kín)
    # Tỉ lệ 0.25 của tập Train+Val tương đương với 20% Val trong tổng 80% (60/20) ban đầu
    n = len(X_past)
    val_size = int(n * val_ratio)
    train_size = n - val_size
    
    return (
        X_past[:train_size], X_future[:train_size], y[:train_size],
        X_past[train_size:], X_future[train_size:], y[train_size:]
    )

def fine_tune_single_reservoir(rid, global_model_path="artifacts/inflow_model.pt", epochs=20, lr=5e-5):
    print(f"\n{'='*50}")
    reservoir_name = next((v["name"] for k,v in RESERVOIRS.items() if v["idx"] == rid), f"Hồ ID={rid}")
    print(f"🚀 FINE-TUNING: {reservoir_name} (ID={rid})")
    print(f"{'='*50}")
    
    # 1. Load toàn bộ data và lọc theo rid
    X_past_all = np.load("dataset_X_past.npy")
    X_fut_all  = np.load("dataset_X_future.npy")
    y_all      = np.load("dataset_y.npy")
    rid_all    = np.load("dataset_rid.npy")
    
    mask = (rid_all == rid)
    X_past = X_past_all[mask]
    X_fut  = X_fut_all[mask]
    y      = y_all[mask]
    rids   = rid_all[mask]
    
    if len(X_past) == 0:
        print(f"⚠ Không có dữ liệu cho hồ {rid}")
        return
        
    print(f"✅ Samples: {len(X_past)}")
    
    # 2. Bỏ năm 2025 (Test set) - giả định 1 năm cuối là 2025 ~ 8760 mẫu
    # Vì file npy hiện tại đã bao gồm cả test set
    test_size = 8760
    if len(X_past) > test_size * 1.5:
        X_past = X_past[:-test_size]
        X_fut  = X_fut[:-test_size]
        y      = y[:-test_size]
        rids   = rids[:-test_size]
        
    # Split Train / Val
    X_p_tr, X_f_tr, y_tr, X_p_va, X_f_va, y_va = split_data_chronological(X_past, X_fut, y)
    print(f"   Train: {len(X_p_tr)} | Val: {len(X_p_va)}")
    
    # Tạo rids dummy array
    rids_tr = np.full(len(X_p_tr), rid, dtype=np.int64)
    rids_va = np.full(len(X_p_va), rid, dtype=np.int64)
    
    train_dataset = FloodDataset(X_p_tr, X_f_tr, y_tr, rids_tr)
    val_dataset   = FloodDataset(X_p_va, X_f_va, y_va, rids_va)
    
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader   = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)
    
    # 3. Load Global Model
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"💻 Device: {device}")
    
    model = InflowForecastModel(
        input_size=X_past.shape[2],
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS
    ).to(device)
    
    if os.path.exists(global_model_path):
        model.load_state_dict(torch.load(global_model_path, map_location=device))
        print("✅ Đã load Global Pre-trained Model")
    else:
        print(f"❌ KHÔNG TÌM THẤY {global_model_path}. Phải train global trước!")
        return
        
    # 4. FREEZE Encoder / Un-freeze Decoder
    # Đóng băng phần đại diện dùng chung
    for param in model.hindcast_embedding.parameters():
        param.requires_grad = False
    for param in model.encoder.parameters():
        param.requires_grad = False
    for param in model.enc_repro.parameters():
        param.requires_grad = False
        
    # Đảm bảo Decoder / Output head được học
    for param in model.forecast_embedding.parameters():
        param.requires_grad = True
    for param in model.decoder.parameters():
        param.requires_grad = True
    for param in model.handoff_net.parameters():
        param.requires_grad = True
    for param in model.handoff_linear.parameters():
        param.requires_grad = True
    for param in model.fc.parameters():
        param.requires_grad = True
    # Embedding reservoir luôn học
    for param in model.embedding.parameters():
        param.requires_grad = True

    # 5. Optimizer (chỉ optimize các tham số có requires_grad=True)
    trainable_params = [p for p in model.parameters() if p.requires_grad]
    print(f"   Trainable params: {sum(p.numel() for p in trainable_params):,}")
    
    optimizer = torch.optim.AdamW(trainable_params, lr=lr, weight_decay=1e-3)
    
    # Cosine Annealing (không cần warmup vì đã là fine-tune)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-6)
    
    # 6. Training Loop
    best_val = float('inf')
    patience = 5
    patience_counter = 0
    save_path = f"artifacts/inflow_model_rid_{rid}.pt"
    
    for epoch in range(epochs):
        model.train()
        train_loss = 0
        for xb_past, xb_future, yb, rid_b in train_loader:
            xb_past, xb_future, yb, rid_b = xb_past.to(device), xb_future.to(device), yb.to(device), rid_b.to(device)
            
            optimizer.zero_grad()
            preds = model(xb_past, xb_future, rid_b)
            loss = hybrid_loss(preds, yb, QUANTILES)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable_params, 0.5)
            optimizer.step()
            train_loss += loss.item()
            
        train_loss /= len(train_loader)
        
        # Validation
        model.eval()
        val_loss = 0
        with torch.no_grad():
            for xb_past, xb_future, yb, rid_b in val_loader:
                xb_past, xb_future, yb, rid_b = xb_past.to(device), xb_future.to(device), yb.to(device), rid_b.to(device)
                preds = model(xb_past, xb_future, rid_b)
                loss = hybrid_loss(preds, yb, QUANTILES)
                val_loss += loss.item()
                
        val_loss /= len(val_loader)
        scheduler.step()
        
        print(f"   Epoch {epoch+1:2d}/{epochs} | Tr_Loss {train_loss:.4f} | Val_Loss {val_loss:.4f} | LR {optimizer.param_groups[0]['lr']:.6f}")
        
        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), save_path)
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print("   ➡ Early stopping!")
                break
                
    print(f"✅ Đã lưu fine-tuned model: {save_path}")

def fine_tune_all():
    # Tập hợp các ID hợp lệ
    valid_rids = [v["idx"] for v in RESERVOIRS.values()]
    for rid in valid_rids:
        fine_tune_single_reservoir(rid)
        
if __name__ == "__main__":
    fine_tune_all()
