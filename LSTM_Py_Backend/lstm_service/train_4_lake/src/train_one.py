"""
train_one.py  –  Training loop cho một hồ
------------------------------------------
Sử dụng:
    from src.train_one import train_reservoir
    result = train_reservoir("dakmi4", cfg, data_dir, out_dir)
"""

import os
import math
import time
import numpy as np
import torch
from torch.utils.data import DataLoader

from src.model   import PerReservoirModel, count_params
from src.loss    import quantile_loss
from src.dataset import load_npy_files, make_split, oversample_floods
from src.evaluate import compute_metrics


def train_reservoir(name: str, cfg: dict, data_dir: str, out_dir: str) -> dict:
    """
    Train model cho một hồ.

    Args:
        name    : tên hồ (avuong | dakmi4 | songbung4 | songtranh2)
        cfg     : dict config (từ configs/{name}.json)
        data_dir: đường dẫn thư mục chứa data/{name}/
        out_dir : đường dẫn lưu model + log

    Returns:
        dict với best_val_loss, history, test_metrics
    """
    device  = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_amp = device.type == "cuda"

    QUANTILES     = cfg["quantiles"]
    HIDDEN_SIZE   = cfg["hidden_size"]
    HORIZON       = cfg["horizon"]
    BATCH_SIZE    = cfg["batch_size"]
    EPOCHS        = cfg["epochs"]
    LR            = cfg["lr"]
    WEIGHT_DECAY  = cfg["weight_decay"]
    WARMUP_EPOCHS = cfg["warmup_epochs"]
    PATIENCE      = cfg["patience"]
    N_FUTURE      = cfg["n_future"]

    print(f"\n{'='*60}")
    print(f"  TRAINING: {cfg['display_name']}")
    print(f"  Device  : {device}  |  AMP: {use_amp}")
    print(f"  Model   : hidden={HIDDEN_SIZE}, horizon={HORIZON}h")
    print(f"{'='*60}")

    # ── Load data ──────────────────────────────────────────────────────────────
    X_past, X_future, y, timestamps, cap = load_npy_files(data_dir, name)
    has_future = X_future is not None
    print(f"  Samples : {len(X_past):,}")
    print(f"  Features: {X_past.shape[2]}  |  X_future: {'ON' if has_future else 'OFF'}")

    # ── Split ──────────────────────────────────────────────────────────────────
    train_ds, val_ds, test_ds, train_peaks = make_split(X_past, X_future, y, timestamps, cap)
    print(f"  Train: {len(train_ds):,}  |  Val: {len(val_ds):,}  |  Test: {len(test_ds):,}")

    # ── Oversample floods ─────────────────────────────────────────────────────
    train_os = oversample_floods(train_ds, train_peaks)
    print(f"  After oversampling: {len(train_os):,}")

    n_workers   = 2 if use_amp else 0
    pin_memory  = use_amp
    train_loader = DataLoader(train_os,  batch_size=BATCH_SIZE, shuffle=True,
                              num_workers=n_workers, pin_memory=pin_memory,
                              persistent_workers=(n_workers > 0))
    val_loader   = DataLoader(val_ds,    batch_size=BATCH_SIZE, shuffle=False,
                              num_workers=n_workers, pin_memory=pin_memory,
                              persistent_workers=(n_workers > 0))
    test_loader  = DataLoader(test_ds,   batch_size=BATCH_SIZE, shuffle=False)

    # ── Model ──────────────────────────────────────────────────────────────────
    input_size = X_past.shape[2]
    model = PerReservoirModel(
        input_size=input_size,
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        n_future=N_FUTURE if has_future else 0,
    ).to(device)
    print(f"  Params  : {count_params(model):,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)

    def lr_lambda(epoch: int) -> float:
        if epoch < WARMUP_EPOCHS:
            return float(epoch + 1) / float(WARMUP_EPOCHS)
        progress = (epoch - WARMUP_EPOCHS) / max(EPOCHS - WARMUP_EPOCHS, 1)
        return max(0.05, 0.5 * (1.0 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    amp_scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    os.makedirs(out_dir, exist_ok=True)
    model_path = os.path.join(out_dir, f"{name}_best.pt")

    best_val  = float("inf")
    patience_counter = 0
    history   = []
    t_start   = time.time()

    # ── Training loop ─────────────────────────────────────────────────────────
    for epoch in range(EPOCHS):
        model.train()
        train_loss = 0.0

        for xb_past, xb_fut, yb in train_loader:
            xb_past = xb_past.to(device)
            yb      = yb.to(device)
            xb_fut  = xb_fut.to(device) if has_future else None

            optimizer.zero_grad()
            with torch.amp.autocast("cuda", enabled=use_amp):
                preds    = model(xb_past, xb_fut)
                yb_noisy = yb + torch.randn_like(yb) * 0.005  # label smoothing
                loss     = quantile_loss(preds, yb_noisy, QUANTILES)

            amp_scaler.scale(loss).backward()
            amp_scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            amp_scaler.step(optimizer)
            amp_scaler.update()
            train_loss += loss.item()

        train_loss /= len(train_loader)

        # Validation
        model.eval()
        val_loss = 0.0
        all_preds, all_targets = [], []

        with torch.no_grad():
            for xb_past, xb_fut, yb in val_loader:
                xb_past = xb_past.to(device)
                yb      = yb.to(device)
                xb_fut  = xb_fut.to(device) if has_future else None
                with torch.amp.autocast("cuda", enabled=use_amp):
                    preds = model(xb_past, xb_fut)
                val_loss += quantile_loss(preds, yb, QUANTILES).item()
                all_preds.append(preds.cpu())
                all_targets.append(yb.cpu())

        val_loss   /= len(val_loader)
        all_preds   = torch.cat(all_preds)
        all_targets = torch.cat(all_targets)
        mae, rmse, nse = compute_metrics(all_preds, all_targets)

        scheduler.step()
        lr = optimizer.param_groups[0]["lr"]
        elapsed = (time.time() - t_start) / 60

        row = dict(epoch=epoch+1, train_loss=train_loss, val_loss=val_loss,
                   mae=mae, rmse=rmse, nse=nse, lr=lr)
        history.append(row)

        marker = ""
        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), model_path)
            patience_counter = 0
            marker = "  ← best"
        else:
            patience_counter += 1

        print(f"  [{epoch+1:3d}/{EPOCHS}] {elapsed:5.1f}m | "
              f"LR {lr:.5f} | Train {train_loss:.4f} | Val {val_loss:.4f} | "
              f"NSE {nse:.3f} | MAE {mae:.1f}{marker}")

        if patience_counter >= PATIENCE:
            print(f"  Early stopping at epoch {epoch+1}.")
            break

    # ── Test evaluation ───────────────────────────────────────────────────────
    print(f"\n  Loading best model: {model_path}")
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()

    all_preds, all_targets = [], []
    with torch.no_grad():
        for xb_past, xb_fut, yb in test_loader:
            xb_past = xb_past.to(device)
            xb_fut  = xb_fut.to(device) if has_future else None
            preds   = model(xb_past, xb_fut)
            all_preds.append(preds.cpu())
            all_targets.append(yb)

    all_preds   = torch.cat(all_preds)
    all_targets = torch.cat(all_targets)
    test_mae, test_rmse, test_nse = compute_metrics(all_preds, all_targets)

    print(f"\n  TEST 2025 — NSE: {test_nse:.4f}  MAE: {test_mae:.2f}  RMSE: {test_rmse:.2f}")

    return {
        "name":        name,
        "best_val_loss": best_val,
        "history":     history,
        "test_nse":    test_nse,
        "test_mae":    test_mae,
        "test_rmse":   test_rmse,
        "model_path":  model_path,
    }
