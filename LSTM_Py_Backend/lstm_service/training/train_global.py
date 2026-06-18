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


# ====================== OUTLIER CAPS (sqrt space) ======================
# Giới hạn tối đa hợp lý cho từng hồ (dựa trên p99.9 + kiểm tra thực địa)
# Loại bỏ các giá trị bất thường (data error) khỏi training
# sqrt(Q_max) vì dataset dùng sqrt transform
INFLOW_CAPS_SQRT = {
    0:  np.sqrt(2500),   # HO A VUONG      p99.9=1705
    1:  np.sqrt(4500),   # HO DAK MI 4     p99.9=2591
    2:  np.sqrt(4500),   # HO SONG BUNG 4  p99.9=2078
    3:  np.sqrt(8000),   # HO SONG TRANH 2 p99.9=3686
    4:  np.sqrt(7000),   # HO SONG BUNG 4A p99.9=4962
    5:  np.sqrt(7000),   # HO SONG BUNG 5  p99.9=5187
    6:  np.sqrt(800),    # HO SONG BUNG 2  p99.9=617  (max=19701 -> loi data)
    7:  np.sqrt(8000),   # HO SONG BUNG 6  p99.9=5946 (max=40232 -> loi data)
    8:  np.sqrt(12000),  # HO SONG TRANH 3 p99.9=6347
    9:  np.sqrt(2500),   # HO ZA HUNG      p99.9=2199
    10: np.sqrt(2000),   # HO DAK MI 3     p99.9=1350 (max=35321 -> loi data)
    11: np.sqrt(1000),   # HO KHE DIEN     p99.9=729  (max=6087  -> loi data)
    12: np.sqrt(900),    # HO SONG CON 2   p99.9=855
    13: np.sqrt(13000),  # HO SONG TRANH 4 p99.9=7450
    14: np.sqrt(2500),   # HO DAK MI 2     p99.9=1537 (max=391526 -> loi data ro rang)
    15: np.sqrt(700),    # HO DAK MI 4C    p99.9=656
}

# ====================== DATASET ======================
class FloodDataset(torch.utils.data.Dataset):

    def __init__(self, X_past=None, X_future=None, y=None, rid=None):
        if X_past is not None:
            self.X_past   = X_past
            self.X_future = X_future
            self.y        = y
            self.rid      = rid
        else:
            self.X_past   = np.load("dataset_X_past.npy",   mmap_mode="r")
            self.y        = np.load("dataset_y.npy",         mmap_mode="r")
            self.rid      = np.load("dataset_rid.npy",       mmap_mode="r")
            # X_future: oracle rain 24h toi — load neu co, None neu khong co
            x_fut_path = "dataset_X_future.npy"
            self.X_future = np.load(x_fut_path, mmap_mode="r") if os.path.exists(x_fut_path) else None

    def __len__(self):
        return len(self.X_past)

    def __getitem__(self, idx):
        rid_val = int(self.rid[idx])
        y = np.array(self.y[idx], copy=True).astype(np.float32)

        cap = INFLOW_CAPS_SQRT.get(rid_val)
        if cap is not None:
            y = np.clip(y, 0, cap)

        x_past = torch.from_numpy(np.array(self.X_past[idx], copy=False)).float()
        x_fut  = (
            torch.from_numpy(np.array(self.X_future[idx], copy=False)).float()
            if self.X_future is not None else torch.zeros(0)
        )
        return x_past, x_fut, torch.from_numpy(y).float(), torch.tensor(rid_val).long()


# ====================== LOSS (HYBRID: NSE + QUANTILE + PEAK-AWARE) ======================
def nse_loss(pred_med, targets):
    """
    NSE Loss (Nash-Sutcliffe Efficiency) - toi uu truc tiep metric danh gia.
    minimize(nse_loss) = maximize(NSE).
    """
    mean_obs = targets.mean(dim=1, keepdim=True)
    ss_res = ((targets - pred_med) ** 2).sum(dim=1)
    ss_tot = ((targets - mean_obs) ** 2).sum(dim=1) + 1e-8
    nse_per_sample = ss_res / ss_tot
    return nse_per_sample.mean()


def hybrid_loss(preds, targets, quantiles):
    """
    Delegates to models/quantile_loss.py which now implements a balanced 
    hybrid of Quantile Loss + Stable Peak-Aware MSE.
    """
    return quantile_loss(preds, targets, quantiles)


# ====================== METRICS ======================
def compute_metrics(preds, targets, rids, return_detailed=False):
    """preds: (N, T, Q), targets: (N, T), rids: (N,)"""
    med_idx = len(QUANTILES) // 2
    preds_med = preds[:, :, med_idx]

    # Inverse sqrt transform: x² (vì inflow = sqrt(Q) to Q = x²)
    preds_raw   = preds_med ** 2
    targets_raw = targets ** 2

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
    print(f"Total samples: {N_total:,}")

    # ------- FIXED-DATE SPLIT (flood-season validation) -------
    # Train : 2022-01-01 to 2024-08-31  (~2.5 years)
    # Val   : 2024-09-01 to 2024-12-31  (FLOOD SEASON 2024 — early stopping on real peaks)
    # Test  : 2025-09-01 to 2025-12-31  (FLOOD SEASON 2025 — holdout)
    # Unused: 2025-01-01 to 2025-08-31  (excluded to keep test clean)
    VAL_START  = np.datetime64("2024-09-01", "s")
    VAL_END    = np.datetime64("2025-01-01", "s")
    TEST_START = np.datetime64("2025-09-01", "s")

    ts_path = "dataset_timestamps.npy"
    if not os.path.exists(ts_path):
        raise FileNotFoundError(
            "Missing dataset_timestamps.npy - rebuild: python main_build_dataset.py"
        )
    timestamps = np.load(ts_path)  # (N,) datetime64[s]

    all_idx = np.arange(len(timestamps))
    train_indices = all_idx[timestamps <  VAL_START].tolist()
    val_indices   = all_idx[(timestamps >= VAL_START) & (timestamps < VAL_END)].tolist()
    test_indices  = all_idx[timestamps >= TEST_START].tolist()

    print(f"Train : {len(train_indices):,}  ({timestamps[train_indices[0]] if train_indices else '?'} to {timestamps[train_indices[-1]] if train_indices else '?'})")
    print(f"Val   : {len(val_indices):,}  ({timestamps[val_indices[0]] if val_indices else '?'} to {timestamps[val_indices[-1]] if val_indices else '?'})")
    print(f"Test  : {len(test_indices):,}  ({timestamps[test_indices[0]] if test_indices else '?'} to {timestamps[test_indices[-1]] if test_indices else '?'})")

    val_ds   = torch.utils.data.Subset(dataset, val_indices)
    test_ds  = torch.utils.data.Subset(dataset, test_indices)

    # --- Flood Oversampling ---
    train_y = dataset.y[train_indices]
    train_peaks = train_y.max(axis=1)

    # Top 5% (p95): repeat 2x
    thr_95 = float(np.percentile(train_peaks, 95))
    idx_95 = [train_indices[i] for i in np.where(train_peaks >= thr_95)[0]]

    # Top 1% (p99): repeat 3x
    thr_99 = float(np.percentile(train_peaks, 99))
    idx_99 = [train_indices[i] for i in np.where(train_peaks >= thr_99)[0]]

    oversampled = train_indices + idx_95 * 2 + idx_99 * 3
    oversampled_ds = torch.utils.data.Subset(dataset, oversampled)
    print(f"Oversampling: top5%={len(idx_95):,}x2 | top1%={len(idx_99):,}x3 | total train={len(oversampled):,}")

    n_workers = 2 if device.type == "cuda" else 0
    train_loader = DataLoader(oversampled_ds, batch_size=BATCH_SIZE, shuffle=True,  num_workers=n_workers, pin_memory=(device.type == "cuda"), persistent_workers=(n_workers > 0))
    val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=n_workers, pin_memory=(device.type == "cuda"), persistent_workers=(n_workers > 0))
    test_loader  = DataLoader(test_ds,  batch_size=BATCH_SIZE, shuffle=False, num_workers=n_workers)

    has_future = dataset.X_future is not None
    n_future   = dataset.X_future.shape[2] if has_future else 0
    print(f"X_future: {'ON (n_future=' + str(n_future) + ')' if has_future else 'OFF'}")

    model = InflowForecastModel(
        input_size=dataset.X_past.shape[2],
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS,
        n_future=n_future,
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
        return max(0.05, 0.5 * (1.0 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

    # AMP fp16 — 2x speedup tren GPU T4, tu dong tat tren CPU
    use_amp = (device.type == "cuda")
    scaler  = torch.amp.GradScaler("cuda", enabled=use_amp)
    print(f"AMP fp16: {'ON' if use_amp else 'OFF (CPU)'}")

    os.makedirs("artifacts", exist_ok=True)

    best_val = float("inf")
    early_counter = 0
    patience = 20
    history = []

    # ------- TRAINING LOOP -------
    for epoch in range(EPOCHS):

        model.train()
        train_loss = 0
        for xb_past, xb_fut, yb, rid in tqdm(train_loader, desc=f"Epoch {epoch+1}/{EPOCHS} [Train]", leave=False):
            xb_past = xb_past.to(device)
            yb, rid = yb.to(device), rid.to(device)
            xb_fut  = xb_fut.to(device) if has_future else None

            optimizer.zero_grad()
            with torch.amp.autocast("cuda", enabled=use_amp):
                preds = model(xb_past, rid, x_future=xb_fut)
                yb_noisy = yb + torch.randn_like(yb) * 0.005
                loss  = hybrid_loss(preds, yb_noisy, QUANTILES)
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
            train_loss += loss.item()

        train_loss /= len(train_loader)

        # Validation
        model.eval()
        val_loss = 0
        all_preds, all_targets, all_rids = [], [], []
        with torch.no_grad():
            for xb_past, xb_fut, yb, rid in val_loader:
                xb_past = xb_past.to(device)
                yb, rid = yb.to(device), rid.to(device)
                xb_fut  = xb_fut.to(device) if has_future else None
                with torch.amp.autocast("cuda", enabled=use_amp):
                    preds = model(xb_past, rid, x_future=xb_fut)
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
        for xb_past, xb_fut, yb, rid in test_loader:
            xb_past = xb_past.to(device)
            rid     = rid.to(device)
            xb_fut  = xb_fut.to(device) if has_future else None
            preds = model(xb_past, rid, x_future=xb_fut)
            all_preds.append(preds.cpu())
            all_targets.append(yb.cpu())
            all_rids.append(rid.cpu())

    all_preds   = torch.cat(all_preds)
    all_targets = torch.cat(all_targets)
    all_rids    = torch.cat(all_rids)

    mae, rmse, avg_nse, nse_dict = compute_metrics(all_preds, all_targets, all_rids, return_detailed=True)

    from config.reservoirs import RESERVOIRS
    # Map from idx to name
    idx_to_name = {info["idx"]: info["name"] for rid, info in RESERVOIRS.items()}

    results_rows = []
    for rid_idx, score in sorted(nse_dict.items()):
        name = idx_to_name.get(rid_idx, f"Reservoir idx={rid_idx}")
        # Compute per-reservoir MAE/RMSE
        mask = (all_rids == rid_idx)
        p_r  = all_preds[mask][:, :, len(QUANTILES)//2] ** 2
        t_r  = all_targets[mask] ** 2
        r_mae  = torch.mean(torch.abs(p_r - t_r)).item()
        r_rmse = torch.sqrt(torch.mean((p_r - t_r)**2)).item()
        results_rows.append({"Reservoir": name, "NSE": round(score, 4), "MAE (m³/s)": round(r_mae, 2), "RMSE (m³/s)": round(r_rmse, 2)})
        print(f"  {name:.<30} NSE={score:.3f}  MAE={r_mae:.2f}  RMSE={r_rmse:.2f}")

    results_rows.append({"Reservoir": "--- AVERAGE ---", "NSE": round(avg_nse, 4), "MAE (m³/s)": round(mae, 2), "RMSE (m³/s)": round(rmse, 2)})
    print(f"\n  NSE AVERAGE: {avg_nse:.3f}  |  MAE: {mae:.2f}  |  RMSE: {rmse:.2f}")

    # Export kết quả ra Excel
    results_df = pd.DataFrame(results_rows)
    results_df.to_excel("ket_qua_danh_gia_2025.xlsx", index=False)
    print("\nSaved: ket_qua_danh_gia_2025.xlsx")

    # Also save training history
    pd.DataFrame(history).to_excel("lich_su_training.xlsx", index=False)
    print("Saved: lich_su_training.xlsx")

if __name__ == "__main__":
    train()