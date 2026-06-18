"""
HueTrainer — Training pipeline cho HueLSTM.

Theo Google Flood Forecasting (training/trainer.py):
  - Fixed-date train/val/test splits (không random)
  - Flood event oversampling (top 5%, 1%)
  - Gradient clipping = 1.0
  - Validation mỗi epoch, early stopping
  - Lưu best checkpoint theo val loss

Thêm vào so với Google:
  - Teacher forcing annealing (cho AR training)
  - AMP fp16 khi có GPU
  - Per-basin NSE/KGE logging
"""

import os
import math
import json
import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader, Subset
from tqdm import tqdm

from config.settings import HueLSTMConfig
from config.basins import BASIN_ID_TO_KEY
from data.dataset import HueFloodDataset
from models.hue_lstm import HueLSTM
from models.losses import quantile_loss, cmal_nll_loss
from training.metrics import compute_all_metrics


BASIN_NAMES = {0: "Tả Trạch", 1: "Bình Điền", 2: "Hương Điền"}


def train(cfg: HueLSTMConfig = None, data_dir: str = "."):
    if cfg is None:
        cfg = HueLSTMConfig()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # ── Dataset ────────────────────────────────────────────────────────────────
    dataset = HueFloodDataset(data_dir)

    if dataset.timestamps is None:
        raise FileNotFoundError(
            "hue_timestamps.npy không tìm thấy. "
            "Chạy python main_build_dataset.py trước."
        )

    ts = dataset.timestamps
    train_start = np.datetime64(cfg.train_start, "s")
    val_start   = np.datetime64(cfg.val_start, "s")
    val_end     = np.datetime64(cfg.val_end, "s")
    test_start  = np.datetime64(cfg.test_start, "s")

    all_idx = np.arange(len(ts))
    train_idx = all_idx[ts < val_start].tolist()
    val_idx   = all_idx[(ts >= val_start) & (ts < val_end)].tolist()
    test_idx  = all_idx[ts >= test_start].tolist()

    print(f"Train: {len(train_idx):,} | Val: {len(val_idx):,} | Test: {len(test_idx):,}")

    # Flood oversampling
    train_y_max = dataset.y[train_idx].max(axis=1)
    thr95 = float(np.percentile(train_y_max, 95))
    thr99 = float(np.percentile(train_y_max, 99))
    idx95 = [train_idx[i] for i in np.where(train_y_max >= thr95)[0]]
    idx99 = [train_idx[i] for i in np.where(train_y_max >= thr99)[0]]
    oversampled = train_idx + idx95 * cfg.oversample_p95_factor + idx99 * cfg.oversample_p99_factor
    print(f"Oversampling: top5%={len(idx95):,}×{cfg.oversample_p95_factor} | "
          f"top1%={len(idx99):,}×{cfg.oversample_p99_factor} | total={len(oversampled):,}")

    n_w = 2 if device.type == "cuda" else 0
    _kw = dict(num_workers=n_w, pin_memory=(device.type == "cuda"),
               persistent_workers=(n_w > 0))
    train_loader = DataLoader(Subset(dataset, oversampled), batch_size=cfg.batch_size, shuffle=True, **_kw)
    val_loader   = DataLoader(Subset(dataset, val_idx),    batch_size=cfg.batch_size, shuffle=False, **_kw)
    test_loader  = DataLoader(Subset(dataset, test_idx),   batch_size=cfg.batch_size, shuffle=False, num_workers=n_w)

    # ── Model ──────────────────────────────────────────────────────────────────
    model = HueLSTM(cfg).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"HueLSTM parameters: {n_params:,} | head={cfg.head}")

    optimizer = torch.optim.Adam(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)

    def lr_lambda(epoch):
        if epoch < cfg.warmup_epochs:
            return float(epoch + 1) / cfg.warmup_epochs
        progress = (epoch - cfg.warmup_epochs) / max(cfg.epochs - cfg.warmup_epochs, 1)
        return max(0.05, 0.5 * (1 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    use_amp = device.type == "cuda"
    amp_scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    print(f"AMP: {'ON' if use_amp else 'OFF'}")

    os.makedirs(cfg.artifacts_dir, exist_ok=True)
    best_val = float("inf")
    patience_cnt = 0
    patience = 25
    history = []

    def compute_loss(preds_or_params, y_b):
        if cfg.head == "quantile":
            return quantile_loss(preds_or_params, y_b, cfg.quantiles)
        else:
            return cmal_nll_loss(preds_or_params, y_b, cfg.target_noise_std)

    def get_quantile_preds(preds_or_params) -> torch.Tensor:
        if cfg.head == "quantile":
            return preds_or_params
        # CMAL: sample quantiles
        return model.head.sample_quantiles(preds_or_params, cfg.quantiles)

    # ── Training loop ──────────────────────────────────────────────────────────
    for epoch in range(cfg.epochs):
        tf_ratio = cfg.teacher_forcing_ratio(epoch)

        model.train()
        train_loss = 0.0

        for x_hist, x_nwp, y_b, bid_b in tqdm(
            train_loader, desc=f"Epoch {epoch+1}/{cfg.epochs}", leave=False
        ):
            x_hist = x_hist.to(device)
            x_nwp  = x_nwp.to(device)
            y_b    = y_b.to(device)
            bid_b  = bid_b.to(device)

            # Target noise (theo Google: tránh overfit trên exact targets)
            if cfg.target_noise_std > 0:
                y_noisy = y_b + torch.randn_like(y_b) * cfg.target_noise_std
            else:
                y_noisy = y_b

            optimizer.zero_grad()
            with torch.amp.autocast("cuda", enabled=use_amp):
                out = model(x_hist, x_nwp, bid_b)
                loss = compute_loss(out, y_noisy)

            amp_scaler.scale(loss).backward()
            amp_scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.gradient_clip_norm)
            amp_scaler.step(optimizer)
            amp_scaler.update()
            train_loss += loss.item()

        train_loss /= len(train_loader)

        # ── Validation ─────────────────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        all_preds, all_targets, all_bids = [], [], []

        with torch.no_grad():
            for x_hist, x_nwp, y_b, bid_b in val_loader:
                x_hist = x_hist.to(device)
                x_nwp  = x_nwp.to(device)
                y_b    = y_b.to(device)
                bid_b  = bid_b.to(device)

                with torch.amp.autocast("cuda", enabled=use_amp):
                    out = model(x_hist, x_nwp, bid_b)
                    val_loss += compute_loss(out, y_b).item()

                pq = get_quantile_preds(out)
                all_preds.append(pq.cpu())
                all_targets.append(y_b.cpu())
                all_bids.append(bid_b.cpu())

        val_loss /= len(val_loader)
        preds_cat   = torch.cat(all_preds)
        targets_cat = torch.cat(all_targets)
        bids_cat    = torch.cat(all_bids)

        metrics = compute_all_metrics(preds_cat, targets_cat, bids_cat, cfg.quantiles, BASIN_NAMES)
        ov = metrics["__overall__"]
        scheduler.step()
        lr_now = optimizer.param_groups[0]["lr"]

        print(
            f"Epoch {epoch+1:3d} | LR {lr_now:.2e} | "
            f"Train {train_loss:.4f} | Val {val_loss:.4f} | "
            f"NSE {ov['nse']:.3f} | KGE {ov['kge']:.3f} | CRPS {ov['crps']:.4f}"
        )
        for bid, bname in BASIN_NAMES.items():
            if bname in metrics:
                m = metrics[bname]
                print(f"  {bname}: NSE={m['nse']:.3f} KGE={m['kge']:.3f} MAE={m['mae_m3s']:.1f}")

        history.append({
            "epoch": epoch + 1, "lr": lr_now,
            "train_loss": train_loss, "val_loss": val_loss, **ov
        })

        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), os.path.join(cfg.artifacts_dir, "hue_lstm.pt"))
            torch.save(cfg, os.path.join(cfg.artifacts_dir, "hue_lstm_config.pt"))
            patience_cnt = 0
            print("  ✔ Best model saved")
        else:
            patience_cnt += 1

        if patience_cnt >= patience:
            print("Early stopping.")
            break

    # ── Test Evaluation ─────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("ĐÁNH GIÁ TẬP TEST (HOLDOUT)")
    print("=" * 70)

    model.load_state_dict(
        torch.load(os.path.join(cfg.artifacts_dir, "hue_lstm.pt"), map_location=device)
    )
    model.eval()

    all_preds, all_targets, all_bids = [], [], []
    with torch.no_grad():
        for x_hist, x_nwp, y_b, bid_b in test_loader:
            out = model(x_hist.to(device), x_nwp.to(device), bid_b.to(device))
            pq = get_quantile_preds(out)
            all_preds.append(pq.cpu())
            all_targets.append(y_b)
            all_bids.append(bid_b)

    preds_cat   = torch.cat(all_preds)
    targets_cat = torch.cat(all_targets)
    bids_cat    = torch.cat(all_bids)

    metrics = compute_all_metrics(preds_cat, targets_cat, bids_cat, cfg.quantiles, BASIN_NAMES)

    rows = []
    for name, m in metrics.items():
        if name == "__overall__":
            name = "--- OVERALL ---"
        rows.append({"Basin": name, **m})
        print(f"  {name:.<20} NSE={m.get('nse',''):.3f}  KGE={m.get('kge',''):.3f}  "
              f"MAE={m.get('mae_m3s',''):.2f}  CRPS={m.get('crps',''):.4f}")

    pd.DataFrame(rows).to_excel(os.path.join(cfg.artifacts_dir, "ket_qua_test.xlsx"), index=False)
    pd.DataFrame(history).to_excel(os.path.join(cfg.artifacts_dir, "lich_su_training.xlsx"), index=False)

    with open(os.path.join(cfg.artifacts_dir, "metrics_test.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    print(f"\nSaved: {cfg.artifacts_dir}/ket_qua_test.xlsx | lich_su_training.xlsx | metrics_test.json")


if __name__ == "__main__":
    train()
