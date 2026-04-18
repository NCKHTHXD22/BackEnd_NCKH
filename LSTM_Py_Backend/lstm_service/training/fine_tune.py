import os
import torch
import numpy as np
from torch.utils.data import DataLoader

from config.settings import *
from config.reservoirs import RESERVOIRS
from models.inflow_model import InflowForecastModel
from training.train_global import FloodDataset, hybrid_loss

def split_data_by_date(X_past, y, timestamps):
    """
    Fixed-date split khop voi train_global.py:
      Train : timestamps <  2024-09-01
      Val   : 2024-09-01 <= timestamps < 2025-01-01  (mua lu 2024)
    (Test 2025-09->12 giu kin, khong dung o fine-tune)
    """
    VAL_START = np.datetime64("2024-09-01", "s")
    VAL_END   = np.datetime64("2025-01-01", "s")

    mask_train = timestamps <  VAL_START
    mask_val   = (timestamps >= VAL_START) & (timestamps < VAL_END)

    return (
        X_past[mask_train], y[mask_train],
        X_past[mask_val],   y[mask_val],
    )

def fine_tune_single_reservoir(rid, global_model_path="artifacts/inflow_model.pt", epochs=20, lr=5e-5):
    print(f"\n{'='*50}")
    reservoir_name = next((v["name"] for k,v in RESERVOIRS.items() if v["idx"] == rid), f"Hồ ID={rid}")
    print(f"FINE-TUNING: {reservoir_name} (ID={rid})")
    print(f"{'='*50}")

    # Clear GPU cache truoc khi load model moi
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    # 1. Load data dung mmap_mode de tranh OOM (khong copy 22GB vao RAM)
    X_past_all = np.load("dataset_X_past.npy", mmap_mode="r")
    y_all      = np.load("dataset_y.npy",      mmap_mode="r")
    rid_all    = np.load("dataset_rid.npy",     mmap_mode="r")
    ts_all     = np.load("dataset_timestamps.npy")

    mask   = (rid_all == rid)
    # Copy phan du lieu cua ho nay vao RAM (chi ~34k samples, ~1.4GB)
    X_past = np.array(X_past_all[mask], dtype=np.float32)
    y      = np.array(y_all[mask],      dtype=np.float32)
    ts     = ts_all[mask]

    if len(X_past) == 0:
        print(f"Không có dữ liệu cho hồ {rid}")
        return

    print(f"Samples: {len(X_past)}")

    # 2. Split Train / Val theo năm (Test 2025 giữ kín)
    X_p_tr, y_tr, X_p_va, y_va = split_data_by_date(X_past, y, ts)
    print(f"   Train: {len(X_p_tr):,} | Val: {len(X_p_va):,}")

    if len(X_p_tr) == 0 or len(X_p_va) == 0:
        print("   SKIP — không đủ dữ liệu train/val.")
        return

    # Tạo rids dummy array
    rids_tr = np.full(len(X_p_tr), rid, dtype=np.int64)
    rids_va = np.full(len(X_p_va), rid, dtype=np.int64)

    # X_future: lọc cùng mask nếu có
    xf_path = "dataset_X_future.npy"
    X_future_all = np.load(xf_path, mmap_mode="r") if os.path.exists(xf_path) else None
    X_future_masked = X_future_all[mask] if X_future_all is not None else None
    mask_train_local = ts < np.datetime64("2024-09-01", "s")
    mask_val_local   = (ts >= np.datetime64("2024-09-01", "s")) & (ts < np.datetime64("2025-01-01", "s"))
    xf_tr = X_future_masked[mask_train_local] if X_future_masked is not None else None
    xf_va = X_future_masked[mask_val_local]   if X_future_masked is not None else None

    train_dataset = FloodDataset(X_p_tr, xf_tr, y_tr, rids_tr)
    val_dataset   = FloodDataset(X_p_va, xf_va, y_va, rids_va)

    # Dung batch size nho hon khi fine-tune de tranh OOM sau global training
    FT_BATCH = min(BATCH_SIZE, 128)
    train_loader = DataLoader(train_dataset, batch_size=FT_BATCH, shuffle=True,  pin_memory=False)
    val_loader   = DataLoader(val_dataset,   batch_size=FT_BATCH, shuffle=False, pin_memory=False)

    # 3. Load Global Model
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Device: {device}")

    n_future = X_future_masked.shape[2] if X_future_masked is not None else 0
    model = InflowForecastModel(
        input_size=X_past.shape[2],
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS,
        n_future=n_future,
    ).to(device)

    if os.path.exists(global_model_path):
        model.load_state_dict(torch.load(global_model_path, map_location=device, weights_only=True))
        print("Đã load Global Pre-trained Model")
    else:
        print(f"KHÔNG TÌM THẤY {global_model_path}. Phải train global trước!")
        return

    # 4. FREEZE Encoder / Un-freeze Decoder
    for param in model.hindcast_embedding.parameters():
        param.requires_grad = False
    for param in model.encoder.parameters():
        param.requires_grad = False
    for param in model.enc_repro.parameters():
        param.requires_grad = False

    # Đảm bảo Decoder / Output head được học
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

    has_future = xf_tr is not None
    for epoch in range(epochs):
        model.train()
        train_loss = 0
        for xb_past, xb_fut, yb, rid_b in train_loader:
            xb_past, yb, rid_b = xb_past.to(device), yb.to(device), rid_b.to(device)
            xb_fut = xb_fut.to(device) if has_future else None

            optimizer.zero_grad()
            preds = model(xb_past, rid_b, x_future=xb_fut)
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
            for xb_past, xb_fut, yb, rid_b in val_loader:
                xb_past, yb, rid_b = xb_past.to(device), yb.to(device), rid_b.to(device)
                xb_fut = xb_fut.to(device) if has_future else None
                preds = model(xb_past, rid_b, x_future=xb_fut)
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
                print("   Early stopping!")
                break

    print(f"Đã lưu fine-tuned model: {save_path}")

def fine_tune_all():
    valid_rids = [v["idx"] for v in RESERVOIRS.values()]
    for rid in valid_rids:
        fine_tune_single_reservoir(rid)
        # Giai phong GPU memory giua cac ho
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

if __name__ == "__main__":
    fine_tune_all()
