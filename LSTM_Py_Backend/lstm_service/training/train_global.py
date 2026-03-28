import os
import torch
import numpy as np
import pandas as pd
from torch.utils.data import DataLoader
from tqdm import tqdm
import math

from config.settings import *
from models.inflow_model import InflowForecastModel
from models.quantile_loss import quantile_loss


# ====================== DATASET ======================
class FloodDataset(torch.utils.data.Dataset):

    def __init__(self, X_past=None, X_future=None, y=None, rid=None):
        if X_past is not None:
            self.X_past = X_past
            self.X_future = X_future
            self.y = y
            self.rid = rid
        else:
            self.X_past   = np.load("dataset_X_past.npy", mmap_mode="r")
            self.X_future = np.load("dataset_X_future.npy", mmap_mode="r")
            self.y        = np.load("dataset_y.npy", mmap_mode="r")
            self.rid      = np.load("dataset_rid.npy", mmap_mode="r")

    def __len__(self):
        return len(self.X_past)

    def __getitem__(self, idx):
        return (
            torch.from_numpy(np.array(self.X_past[idx], copy=False)).float(),
            torch.from_numpy(np.array(self.X_future[idx], copy=False)).float(),
            torch.from_numpy(np.array(self.y[idx], copy=False)).float(),
            torch.tensor(self.rid[idx]).long()
        )


# ====================== LOSS (HYBRID) ======================
def hybrid_loss(preds, targets, quantiles):
    """
    Hybrid Loss = 0.5 × QuantileLoss + 0.5 × MSE(median prediction)
    MSE term directly optimizes NSE since:
        NSE = 1 - SS_res/SS_tot
        Maximizing NSE ≡ Minimizing MSE when SS_tot is constant.
    """
    q_loss = quantile_loss(preds, targets, quantiles)

    # Median = quantile index 1 (middle)
    med_idx = len(quantiles) // 2
    pred_med = preds[:, :, med_idx]
    mse = torch.mean((pred_med - targets) ** 2)

    return 0.5 * q_loss + 0.5 * mse


# ====================== METRICS ======================
def compute_metrics(preds, targets, rids, return_detailed=False):
    """preds: (N, T, Q), targets: (N, T), rids: (N,)"""
    med_idx = len(QUANTILES) // 2
    preds_med = preds[:, :, med_idx]

    # Inverse log1p transform
    preds_raw   = torch.expm1(preds_med)
    targets_raw = torch.expm1(targets)

    mae  = torch.mean(torch.abs(preds_raw - targets_raw)).item()
    rmse = torch.sqrt(torch.mean((preds_raw - targets_raw) ** 2)).item()

    # NSE per reservoir
    unique_rids = torch.unique(rids)
    nse_dict = {}
    for rid in unique_rids:
        mask = (rids == rid)
        if mask.any():
            r_preds   = preds_raw[mask]
            r_targets = targets_raw[mask]
            mean_obs  = torch.mean(r_targets)
            ss_res    = torch.sum((r_targets - r_preds) ** 2)
            ss_tot    = torch.sum((r_targets - mean_obs) ** 2)
            if ss_tot > 0:
                nse_dict[rid.item()] = (1 - ss_res / ss_tot).item()

    avg_nse = sum(nse_dict.values()) / len(nse_dict) if nse_dict else 0.0

    if return_detailed:
        return mae, rmse, avg_nse, nse_dict
    return mae, rmse, avg_nse


# ====================== TRAIN ======================
def train():

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("Using device:", device)
    if device.type == "cuda":
        print("GPU:", torch.cuda.get_device_name(0))

    dataset = FloodDataset()
    N_total = len(dataset)
    print(f"Tổng số mẫu: {N_total:,}")

    # ------- CHRONOLOGICAL SPLIT per reservoir -------
    # 60% Train (2022-01 → ~2024-04)
    # 20% Val   (2024-04 → 2024-12)
    # 20% Test  (Toàn bộ 2025) - chỉ dùng để đánh giá cuối
    train_indices, val_indices, test_indices = [], [], []

    for r in np.unique(dataset.rid):
        idx_r = np.where(dataset.rid == r)[0]
        n  = len(idx_r)
        t1 = int(0.60 * n)
        t2 = int(0.80 * n)
        train_indices.extend(idx_r[:t1].tolist())
        val_indices.extend(idx_r[t1:t2].tolist())
        test_indices.extend(idx_r[t2:].tolist())

    print(f"Train: {len(train_indices):,}  Val: {len(val_indices):,}  Test: {len(test_indices):,}")

    train_ds = torch.utils.data.Subset(dataset, train_indices)
    val_ds   = torch.utils.data.Subset(dataset, val_indices)
    test_ds  = torch.utils.data.Subset(dataset, test_indices)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  num_workers=0, pin_memory=(device.type == "cuda"))
    val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=0, pin_memory=(device.type == "cuda"))
    test_loader  = DataLoader(test_ds,  batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    model = InflowForecastModel(
        input_size=dataset.X_past.shape[2],
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS
    ).to(device)

    print(f"Model parameters: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")

    # Warmup setting (with fallback defaults for backward compat)
    try:
        from config.settings import WARMUP_EPOCHS, WEIGHT_DECAY
    except ImportError:
        WARMUP_EPOCHS, WEIGHT_DECAY = 5, 1e-3

    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)

    # Cosine annealing with linear warmup
    def lr_lambda(epoch):
        if epoch < WARMUP_EPOCHS:
            return float(epoch + 1) / float(WARMUP_EPOCHS)
        progress = (epoch - WARMUP_EPOCHS) / max(EPOCHS - WARMUP_EPOCHS, 1)
        return max(0.05, 0.5 * (1.0 + math.cos(math.pi * progress)))  # min LR = 5% of base

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

    os.makedirs("artifacts", exist_ok=True)

    best_val = float("inf")
    early_counter = 0
    patience = 20
    history = []

    # ------- TRAINING LOOP -------
    for epoch in range(EPOCHS):

        model.train()
        train_loss = 0
        for xb_past, xb_future, yb, rid in tqdm(train_loader, desc=f"Epoch {epoch+1}/{EPOCHS} [Train]", leave=False):
            xb_past, xb_future = xb_past.to(device), xb_future.to(device)
            yb, rid = yb.to(device), rid.to(device)

            optimizer.zero_grad()
            preds = model(xb_past, xb_future, rid)
            loss  = hybrid_loss(preds, yb, QUANTILES)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)  # Tighter clipping
            optimizer.step()
            train_loss += loss.item()

        train_loss /= len(train_loader)

        # Validation
        model.eval()
        val_loss = 0
        all_preds, all_targets, all_rids = [], [], []
        with torch.no_grad():
            for xb_past, xb_future, yb, rid in val_loader:
                xb_past, xb_future = xb_past.to(device), xb_future.to(device)
                yb, rid = yb.to(device), rid.to(device)
                preds = model(xb_past, xb_future, rid)
                val_loss += hybrid_loss(preds, yb, QUANTILES).item()
                all_preds.append(preds.cpu())
                all_targets.append(yb.cpu())
                all_rids.append(rid.cpu())

        val_loss /= len(val_loader)
        all_preds   = torch.cat(all_preds)
        all_targets = torch.cat(all_targets)
        all_rids    = torch.cat(all_rids)

        mae, rmse, nse = compute_metrics(all_preds, all_targets, all_rids)
        scheduler.step()  # CosineAnnealing steps every epoch
        current_lr = optimizer.param_groups[0]['lr']

        row = {"epoch": epoch+1, "train_loss": train_loss, "val_loss": val_loss, "mae": mae, "rmse": rmse, "nse": nse}
        history.append(row)

        print(
            f"Epoch {epoch+1:3d} | "
            f"LR {current_lr:.6f} | "
            f"Train {train_loss:.4f} | Val {val_loss:.4f} | MAE {mae:.2f} | RMSE {rmse:.2f} | NSE {nse:.3f}")

        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), "artifacts/inflow_model.pt")
            early_counter = 0
            print("  ✔ Best model saved")
        else:
            early_counter += 1

        if early_counter >= patience:
            print("Early stopping.")
            break

    # ------- TEST EVALUATION (2025 Holdout) -------
    print("\n" + "="*70)
    print("ĐÁNH GIÁ TRÊN TẬP TEST 2025 (HOLDOUT)")
    print("="*70)

    model.load_state_dict(torch.load("artifacts/inflow_model.pt", map_location=device))
    model.eval()

    all_preds, all_targets, all_rids = [], [], []
    with torch.no_grad():
        for xb_past, xb_future, yb, rid in test_loader:
            xb_past, xb_future = xb_past.to(device), xb_future.to(device)
            rid = rid.to(device)
            preds = model(xb_past, xb_future, rid)
            all_preds.append(preds.cpu())
            all_targets.append(yb.cpu())
            all_rids.append(rid.cpu())

    all_preds   = torch.cat(all_preds)
    all_targets = torch.cat(all_targets)
    all_rids    = torch.cat(all_rids)

    mae, rmse, avg_nse, nse_dict = compute_metrics(all_preds, all_targets, all_rids, return_detailed=True)

    from config.reservoirs import RESERVOIRS
    # Map from idx → name
    idx_to_name = {info["idx"]: info["name"] for rid, info in RESERVOIRS.items()}

    results_rows = []
    for rid_idx, score in sorted(nse_dict.items()):
        name = idx_to_name.get(rid_idx, f"Hồ idx={rid_idx}")
        # Compute per-reservoir MAE/RMSE
        mask = (all_rids == rid_idx)
        p_r  = torch.expm1(all_preds[mask][:, :, len(QUANTILES)//2])
        t_r  = torch.expm1(all_targets[mask])
        r_mae  = torch.mean(torch.abs(p_r - t_r)).item()
        r_rmse = torch.sqrt(torch.mean((p_r - t_r)**2)).item()
        results_rows.append({"Hồ": name, "NSE": round(score, 4), "MAE (m³/s)": round(r_mae, 2), "RMSE (m³/s)": round(r_rmse, 2)})
        print(f"  {name:.<30} NSE={score:.3f}  MAE={r_mae:.2f}  RMSE={r_rmse:.2f}")

    results_rows.append({"Hồ": "--- TRUNG BÌNH ---", "NSE": round(avg_nse, 4), "MAE (m³/s)": round(mae, 2), "RMSE (m³/s)": round(rmse, 2)})
    print(f"\n  NSE TRUNG BÌNH: {avg_nse:.3f}  |  MAE: {mae:.2f}  |  RMSE: {rmse:.2f}")

    # Export kết quả ra Excel
    results_df = pd.DataFrame(results_rows)
    results_df.to_excel("ket_qua_danh_gia_2025.xlsx", index=False)
    print("\n✅ Đã lưu bảng đánh giá → ket_qua_danh_gia_2025.xlsx")

    # Also save training history
    pd.DataFrame(history).to_excel("lich_su_training.xlsx", index=False)
    print("✅ Đã lưu lịch sử training → lich_su_training.xlsx")

if __name__ == "__main__":
    train()