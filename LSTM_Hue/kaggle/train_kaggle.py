"""
Training script cho Hương Điền LSTM — chạy trên Kaggle GPU (T4/P100).

Cách dùng trên Kaggle:
  1. Attach dataset "huong-dien-dataset" (chứa .npy files từ preprocess_huongdien.py)
  2. Copy script này vào Kaggle Notebook
  3. Run All  → lưu model vào /kaggle/working/

Cấu trúc Kaggle Notebook:
  Cell 1: Install / imports
  Cell 2: Config
  Cell 3: Dataset & DataLoader
  Cell 4: Model definition (copy từ model.py)
  Cell 5: Training LSTM_RAINY
  Cell 6: Evaluate RAINY trên Test 2025
  Cell 7: Training LSTM_DRY
  Cell 8: Evaluate DRY
  Cell 9: Save + visualize

Để chạy LOCAL:
  cd LSTM_Hue
  python kaggle/train_kaggle.py --season rainy
  python kaggle/train_kaggle.py --season dry
"""

import os, json, time, argparse, math
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ── Detect Kaggle vs Local ────────────────────────────────────────────────────
ON_KAGGLE   = os.path.exists("/kaggle")
DATA_DIR    = "/kaggle/input/huong-dien-dataset" if ON_KAGGLE else \
              os.path.join(os.path.dirname(__file__), "..", "kaggle_dataset")
OUTPUT_DIR  = "/kaggle/working" if ON_KAGGLE else \
              os.path.join(os.path.dirname(__file__), "..", "kaggle_output")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Import model (local) hoặc paste inline (Kaggle) ──────────────────────────
try:
    from model import HuongDienLSTM, quantile_loss, compute_metrics
except ImportError:
    # Khi chạy trên Kaggle: copy nội dung model.py vào đây
    raise ImportError("Copy nội dung kaggle/model.py vào notebook cell trước khi chạy.")


# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════

CFG = {
    # Model
    "hidden_size":   128,
    "num_layers":    2,
    "dropout":       0.3,
    "n_quantiles":   3,
    "quantiles":     [0.10, 0.50, 0.90],

    # Training
    "epochs":        150,
    "batch_size":    64,
    "lr":            3e-4,
    "weight_decay":  1e-5,
    "warmup_epochs": 10,
    "grad_clip":     1.0,
    "patience":      20,   # early stopping

    # Oversampling flood events (chỉ dùng cho RAINY)
    "oversample_p95": 3,
    "oversample_p99": 5,

    # Teacher forcing (RAINY — giảm dần về 0)
    "tf_start": 0.8,
    "tf_end":   0.0,
}


# ══════════════════════════════════════════════════════════════════════════════
#  DATASET LOADER
# ══════════════════════════════════════════════════════════════════════════════

def load_split(season: str, split: str):
    """Load (X, y) từ .npy files. Trả về TensorDataset."""
    X = np.load(f"{DATA_DIR}/X_{season}_{split}.npy")
    y = np.load(f"{DATA_DIR}/y_{season}_{split}.npy")
    return TensorDataset(
        torch.tensor(X, dtype=torch.float32),
        torch.tensor(y, dtype=torch.float32),
    )


def oversample_flood(dataset: TensorDataset, p95_factor: int, p99_factor: int):
    """
    Duplicate flood event samples để cân bằng distribution.
    Dùng cho RAINY model vì lũ lớn chiếm rất ít samples.
    """
    X, y = dataset.tensors
    # Peak inflow ≈ max của √y trong horizon → invert → y_max²
    y_peak = y.max(dim=1).values.pow(2)   # max inflow trong window

    thr95 = float(y_peak.quantile(0.95))
    thr99 = float(y_peak.quantile(0.99))

    idx95 = (y_peak >= thr95).nonzero(as_tuple=True)[0]
    idx99 = (y_peak >= thr99).nonzero(as_tuple=True)[0]

    all_idx = list(range(len(X)))
    all_idx += idx95.tolist() * p95_factor
    all_idx += idx99.tolist() * p99_factor

    print(f"  Oversampling: base={len(X):,} | "
          f"p95(≥{thr95:.0f}²)×{p95_factor}={len(idx95)} | "
          f"p99(≥{thr99:.0f}²)×{p99_factor}={len(idx99)} | "
          f"total={len(all_idx):,}")

    from torch.utils.data import Subset
    return Subset(dataset, all_idx)


# ══════════════════════════════════════════════════════════════════════════════
#  TRAINING
# ══════════════════════════════════════════════════════════════════════════════

def get_tf_ratio(epoch: int, cfg: dict) -> float:
    """Teacher forcing ratio giảm tuyến tính từ tf_start → tf_end."""
    p = epoch / max(cfg["epochs"] - 1, 1)
    return cfg["tf_start"] * (1 - p) + cfg["tf_end"] * p


def train_one_epoch(model, loader, optimizer, scaler_amp, device, cfg, epoch):
    model.train()
    total_loss = 0.0
    tf_ratio   = get_tf_ratio(epoch, cfg)
    use_amp    = scaler_amp is not None

    for X_b, y_b in loader:
        X_b = X_b.to(device)
        y_b = y_b.to(device)

        use_tf = (torch.rand(1).item() < tf_ratio)
        optimizer.zero_grad()

        with torch.amp.autocast("cuda", enabled=use_amp):
            preds = model(X_b, teacher_forcing=use_tf,
                          y_teacher=(y_b if use_tf else None))
            loss  = quantile_loss(preds, y_b, cfg["quantiles"])

        if use_amp:
            scaler_amp.scale(loss).backward()
            scaler_amp.unscale_(optimizer)
            nn.utils.clip_grad_norm_(model.parameters(), cfg["grad_clip"])
            scaler_amp.step(optimizer)
            scaler_amp.update()
        else:
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), cfg["grad_clip"])
            optimizer.step()

        total_loss += loss.item()

    return total_loss / len(loader)


@torch.no_grad()
def evaluate(model, loader, device, cfg):
    model.eval()
    total_loss = 0.0
    preds_all, targets_all = [], []

    for X_b, y_b in loader:
        X_b = X_b.to(device)
        y_b = y_b.to(device)
        preds = model(X_b, teacher_forcing=False)
        loss  = quantile_loss(preds, y_b, cfg["quantiles"])
        total_loss += loss.item()
        preds_all.append(preds.cpu())
        targets_all.append(y_b.cpu())

    preds_cat   = torch.cat(preds_all,   dim=0)   # (N, horizon, n_q)
    targets_cat = torch.cat(targets_all, dim=0)   # (N, horizon)

    # Q50 = index 1 cho metrics
    q50_preds = preds_cat[:, :, cfg["n_quantiles"] // 2]
    metrics   = compute_metrics(q50_preds, targets_cat)

    return total_loss / len(loader), preds_cat, targets_cat, metrics


def train_season(season: str, cfg: dict):
    print(f"\n{'═'*60}")
    print(f"  TRAINING: LSTM_{season.upper()}")
    print(f"{'═'*60}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  Device: {device}"
          + (f" — {torch.cuda.get_device_name(0)}" if device.type == "cuda" else ""))

    # ── Data ─────────────────────────────────────────────────────────────────
    ds_train = load_split(season, "train")
    ds_val   = load_split(season, "val")
    ds_test  = load_split(season, "test")

    # Feature dimension từ data
    n_features = ds_train[0][0].shape[-1]
    horizon    = ds_train[0][1].shape[-1]

    print(f"  n_features={n_features}  horizon={horizon}h")
    print(f"  Train: {len(ds_train):,}  Val: {len(ds_val):,}  Test: {len(ds_test):,}")

    # Oversample flood events cho RAINY
    if season == "rainy":
        ds_train_loader = oversample_flood(
            ds_train, cfg["oversample_p95"], cfg["oversample_p99"]
        )
    else:
        ds_train_loader = ds_train

    n_w = 2 if device.type == "cuda" else 0
    pin = device.type == "cuda"
    train_loader = DataLoader(ds_train_loader, batch_size=cfg["batch_size"],
                              shuffle=True,  num_workers=n_w, pin_memory=pin)
    val_loader   = DataLoader(ds_val,         batch_size=cfg["batch_size"],
                              shuffle=False, num_workers=n_w, pin_memory=pin)
    test_loader  = DataLoader(ds_test,        batch_size=cfg["batch_size"],
                              shuffle=False, num_workers=0)

    # ── Model ────────────────────────────────────────────────────────────────
    model = HuongDienLSTM(
        n_features  = n_features,
        hidden_size = cfg["hidden_size"],
        num_layers  = cfg["num_layers"],
        dropout     = cfg["dropout"],
        horizon     = horizon,
        n_quantiles = cfg["n_quantiles"],
    ).to(device)

    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"  Parameters: {n_params:,}")

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=cfg["lr"], weight_decay=cfg["weight_decay"]
    )

    # LR: warmup → cosine decay
    def lr_lambda(epoch):
        if epoch < cfg["warmup_epochs"]:
            return (epoch + 1) / cfg["warmup_epochs"]
        progress = (epoch - cfg["warmup_epochs"]) / max(cfg["epochs"] - cfg["warmup_epochs"], 1)
        return max(0.05, 0.5 * (1 + math.cos(math.pi * progress)))

    scheduler   = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    scaler_amp  = torch.amp.GradScaler("cuda") if device.type == "cuda" else None

    best_val_loss   = float("inf")
    patience_count  = 0
    history         = []
    ckpt_path       = os.path.join(OUTPUT_DIR, f"lstm_{season}_best.pt")

    # ── Training loop ────────────────────────────────────────────────────────
    for epoch in range(cfg["epochs"]):
        t0 = time.time()

        train_loss = train_one_epoch(model, train_loader, optimizer,
                                     scaler_amp, device, cfg, epoch)
        val_loss, _, _, val_m = evaluate(model, val_loader, device, cfg)
        scheduler.step()

        elapsed = time.time() - t0
        lr_now  = optimizer.param_groups[0]["lr"]

        log = {
            "epoch": epoch + 1, "lr": lr_now,
            "train_loss": train_loss, "val_loss": val_loss,
            **val_m,
        }
        history.append(log)

        print(
            f"  Epoch {epoch+1:3d}/{cfg['epochs']} | "
            f"LR {lr_now:.1e} | "
            f"Train {train_loss:.4f} | Val {val_loss:.4f} | "
            f"NSE {val_m['nse']:.3f} | KGE {val_m['kge']:.3f} | "
            f"RMSE {val_m['rmse_m3s']:.1f} m³/s | "
            f"{elapsed:.1f}s"
        )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_count = 0
            torch.save({
                "state_dict":  model.state_dict(),
                "config":      cfg,
                "n_features":  n_features,
                "horizon":     horizon,
                "epoch":       epoch + 1,
                "val_metrics": val_m,
            }, ckpt_path)
            print(f"  ✔ Best model saved (val_loss={best_val_loss:.4f})")
        else:
            patience_count += 1
            if patience_count >= cfg["patience"]:
                print(f"  Early stopping tại epoch {epoch+1}.")
                break

    # ── Test evaluation ───────────────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print(f"  ĐÁNH GIÁ TEST — {'Trận lũ 2025 (Sep-Dec)' if season=='rainy' else 'Jul-Aug 2025'}")
    print(f"{'─'*60}")

    ckpt = torch.load(ckpt_path, map_location=device)
    model.load_state_dict(ckpt["state_dict"])

    _, preds_test, targets_test, test_m = evaluate(model, test_loader, device, cfg)

    print(f"  NSE   : {test_m['nse']:.4f}  (>0.7 tốt, >0.9 xuất sắc)")
    print(f"  KGE   : {test_m['kge']:.4f}  (>0.7 tốt)")
    print(f"  RMSE  : {test_m['rmse_m3s']:.1f} m³/s")
    print(f"  MAE   : {test_m['mae_m3s']:.1f} m³/s")
    print(f"  Bias  : {test_m['bias_pct']:.1f}%")
    for k, v in test_m.items():
        if "nse_t" in k or "rmse_t" in k:
            print(f"    {k}: {v:.3f}")

    # ── Save kết quả & biểu đồ ───────────────────────────────────────────────
    _save_results(season, history, preds_test, targets_test, test_m, cfg)
    print(f"\n  Files saved → {OUTPUT_DIR}/")


# ══════════════════════════════════════════════════════════════════════════════
#  SAVE RESULTS & PLOT
# ══════════════════════════════════════════════════════════════════════════════

def _save_results(season, history, preds, targets, test_m, cfg):
    prefix = os.path.join(OUTPUT_DIR, f"lstm_{season}")

    # History CSV
    import csv
    if history:
        keys = history[0].keys()
        with open(f"{prefix}_history.csv", "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader(); w.writerows(history)

    # Test metrics JSON
    with open(f"{prefix}_test_metrics.json", "w", encoding="utf-8") as f:
        json.dump(test_m, f, ensure_ascii=False, indent=2)

    # Numpy predictions
    np.save(f"{prefix}_preds_test.npy",   preds.numpy())
    np.save(f"{prefix}_targets_test.npy", targets.numpy())

    # ── Biểu đồ 1: Loss curve ─────────────────────────────────────────────────
    if history:
        fig, ax = plt.subplots(figsize=(10, 4))
        epochs_done = [h["epoch"] for h in history]
        ax.plot(epochs_done, [h["train_loss"] for h in history], label="Train loss")
        ax.plot(epochs_done, [h["val_loss"]   for h in history], label="Val loss")
        ax.set_xlabel("Epoch"); ax.set_ylabel("Quantile Loss")
        ax.set_title(f"LSTM_{season.upper()} — Training curve")
        ax.legend(); ax.grid(True, alpha=0.3)
        fig.tight_layout()
        fig.savefig(f"{prefix}_loss_curve.png", dpi=120)
        plt.close(fig)

    # ── Biểu đồ 2: Dự báo vs Thực tế (200 bước đầu của test) ─────────────────
    q50_idx = cfg["n_quantiles"] // 2
    q10_idx = 0
    q90_idx = cfg["n_quantiles"] - 1

    # Lấy t+1h (step 0) để vẽ time series
    y_true_inflow = targets[:, 0].pow(2).numpy()     # inverse √
    y_pred_q50    = preds[:, 0, q50_idx].pow(2).numpy()
    y_pred_q10    = preds[:, 0, q10_idx].pow(2).numpy()
    y_pred_q90    = preds[:, 0, q90_idx].pow(2).numpy()

    n_plot = min(500, len(y_true_inflow))
    fig, ax = plt.subplots(figsize=(14, 5))
    x_axis = range(n_plot)
    ax.fill_between(x_axis, y_pred_q10[:n_plot], y_pred_q90[:n_plot],
                    alpha=0.25, color="steelblue", label="Q10-Q90 interval")
    ax.plot(x_axis, y_true_inflow[:n_plot], color="black", lw=1.5, label="Thực tế (m³/s)")
    ax.plot(x_axis, y_pred_q50[:n_plot],    color="tomato", lw=1.5, ls="--", label="Dự báo Q50")
    ax.set_xlabel("Timestep (giờ)")
    ax.set_ylabel("Inflow (m³/s)")
    title_map = {
        "rainy": f"LSTM_RAINY — Test: Trận lũ 2025 (t+1h) | NSE={test_m['nse']:.3f}",
        "dry":   f"LSTM_DRY  — Test: Jul-Aug 2025 (t+1h)  | NSE={test_m['nse']:.3f}",
    }
    ax.set_title(title_map.get(season, ""))
    ax.legend(); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(f"{prefix}_forecast_test.png", dpi=120)
    plt.close(fig)

    # ── Biểu đồ 3: Scatter plot (dự báo vs thực tế) ──────────────────────────
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.scatter(y_true_inflow, y_pred_q50, alpha=0.3, s=5, color="steelblue")
    vmax = max(y_true_inflow.max(), y_pred_q50.max())
    ax.plot([0, vmax], [0, vmax], "k--", lw=1, label="1:1 line")
    ax.set_xlabel("Inflow thực tế (m³/s)")
    ax.set_ylabel("Inflow dự báo Q50 (m³/s)")
    ax.set_title(f"LSTM_{season.upper()} Scatter | NSE={test_m['nse']:.3f}")
    ax.legend(); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(f"{prefix}_scatter_test.png", dpi=120)
    plt.close(fig)

    print(f"  Saved: {prefix}_loss_curve.png")
    print(f"         {prefix}_forecast_test.png")
    print(f"         {prefix}_scatter_test.png")


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", choices=["rainy", "dry", "both"], default="both")
    parser.add_argument("--epochs", type=int,   default=CFG["epochs"])
    parser.add_argument("--hidden", type=int,   default=CFG["hidden_size"])
    parser.add_argument("--lr",     type=float, default=CFG["lr"])
    args = parser.parse_args()

    # Override config từ args
    cfg = dict(CFG)
    cfg["epochs"]      = args.epochs
    cfg["hidden_size"] = args.hidden
    cfg["lr"]          = args.lr

    seasons = ["rainy", "dry"] if args.season == "both" else [args.season]
    for s in seasons:
        train_season(s, cfg)

    print(f"\n{'═'*60}")
    print(f"  Hoàn tất! Kết quả tại: {OUTPUT_DIR}")
    print(f"{'═'*60}")


if __name__ == "__main__":
    main()
