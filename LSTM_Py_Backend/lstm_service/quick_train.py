"""
quick_train.py
Train nhanh 10 epochs trên mini-dataset (300 mau/ho × 16 ho = 4800 mau).
Moi epoch ~50 giay tren CPU. Tong ~8 phut.
Dung de kiem tra pipeline va xem NSE co hop ly truoc khi push len Colab.

Chay: cd lstm_service && python quick_train.py
"""
import os, math
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

QUICK_EPOCHS   = 10
WARMUP_EPOCHS  = 3
SAMPLES_PER_RES = 300  # 300 mau × 16 ho = 4800 mau


def quick_train():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    print("Loading dataset (mmap)...")
    dataset = FloodDataset()
    N = len(dataset)
    n_features = dataset.X_past.shape[2]
    print(f"Tong mau: {N:,}  |  Features: {n_features}")

    # Chon mau dai dien: moi ho lay SAMPLES_PER_RES mau (phan bo deu theo thoi gian)
    mini_indices = []
    for r in np.unique(dataset.rid):
        idx_r = np.where(dataset.rid == r)[0]
        # Lay deu theo buoc, khong phai ngau nhien (giu tinh thoi gian)
        step = max(1, len(idx_r) // SAMPLES_PER_RES)
        chosen = idx_r[::step][:SAMPLES_PER_RES]
        mini_indices.extend(chosen.tolist())

    split = int(0.8 * len(mini_indices))
    train_ds = Subset(dataset, mini_indices[:split])
    val_ds   = Subset(dataset, mini_indices[split:])
    print(f"Mini-train: {len(train_ds)} mau | Mini-val: {len(val_ds)} mau")

    train_loader = DataLoader(train_ds, batch_size=128, shuffle=True,  num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=128, shuffle=False, num_workers=0)

    model = InflowForecastModel(
        input_size=n_features,
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS
    ).to(device)
    print(f"Model params: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)

    # LR warmup: bat dau tu LR/WARMUP_EPOCHS, tang dan den LR
    def lr_lambda(epoch):
        if epoch < WARMUP_EPOCHS:
            return float(epoch + 1) / float(WARMUP_EPOCHS)
        progress = (epoch - WARMUP_EPOCHS) / max(QUICK_EPOCHS - WARMUP_EPOCHS, 1)
        return max(0.1, 0.5 * (1.0 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

    os.makedirs("artifacts", exist_ok=True)
    best_val = float("inf")

    for epoch in range(QUICK_EPOCHS):
        model.train()
        train_loss = 0
        for xb_past, yb, rid in tqdm(train_loader, desc=f"Epoch {epoch+1}/{QUICK_EPOCHS}", leave=False):
            xb_past = xb_past.to(device)
            yb, rid = yb.to(device), rid.to(device)
            optimizer.zero_grad()
            preds = model(xb_past, rid)
            loss  = hybrid_loss(preds, yb, QUANTILES)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item()
        train_loss /= len(train_loader)

        model.eval()
        val_loss = 0
        all_p, all_t, all_r = [], [], []
        with torch.no_grad():
            for xb_past, yb, rid in val_loader:
                xb_past = xb_past.to(device)
                yb, rid = yb.to(device), rid.to(device)
                preds = model(xb_past, rid)
                val_loss += hybrid_loss(preds, yb, QUANTILES).item()
                all_p.append(preds.cpu()); all_t.append(yb.cpu()); all_r.append(rid.cpu())
        val_loss /= len(val_loader)

        mae, rmse, nse = compute_metrics(torch.cat(all_p), torch.cat(all_t), torch.cat(all_r))
        scheduler.step()
        current_lr = optimizer.param_groups[0]['lr']
        print(f"Epoch {epoch+1:2d}/{QUICK_EPOCHS} | LR {current_lr:.6f} | "
              f"Train {train_loss:.4f} | Val {val_loss:.4f} | MAE {mae:.1f} | RMSE {rmse:.1f} | NSE {nse:.3f}")

        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), "artifacts/inflow_model.pt")
            print("  -> Saved artifacts/inflow_model.pt")

    print(f"\nDone. Test: python main_predict.py")


if __name__ == "__main__":
    quick_train()
