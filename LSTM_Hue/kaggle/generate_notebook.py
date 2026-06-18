"""
Tạo file Train_HuongDien.ipynb sẵn sàng upload lên Kaggle.

Chạy:
    cd LSTM_Hue
    python kaggle/generate_notebook.py
Kết quả: kaggle/Train_HuongDien.ipynb
"""

import json, os, textwrap

OUT = os.path.join(os.path.dirname(__file__), "Train_HuongDien.ipynb")


def code(src: str):
    lines = textwrap.dedent(src).lstrip("\n").splitlines(keepends=True)
    return {"cell_type": "code", "execution_count": None,
            "metadata": {}, "outputs": [], "source": lines}


def md(src: str):
    return {"cell_type": "markdown", "metadata": {},
            "source": [textwrap.dedent(src).lstrip("\n")]}


# ══════════════════════════════════════════════════════════════════════════════
cells = []

# ── Cell 0: Title ─────────────────────────────────────────────────────────────
cells.append(md("""
# Hương Điền LSTM — Flood Inflow Forecasting
**Dataset**: Hồ Hương Điền (Thừa Thiên Huế)
**Target**: Dự báo lưu lượng vào hồ `inflow_m3s` cho 24 giờ tới
**Models**: LSTM_RAINY (tháng 9–12) · LSTM_DRY (tháng 2–8)
**Test**: Trận lũ Oct–Dec 2025 (max = 7 865 m³/s)

> **Trước khi chạy**: Vào panel **Input** bên phải → Add Input → tìm dataset `huongdien-dataset`
> Nếu bạn đặt tên khác thì sửa `DATA_DIR` ở Cell Setup bên dưới.
"""))

# ── Cell 1: Setup ─────────────────────────────────────────────────────────────
cells.append(code("""
import os, json, time, math, warnings
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset, Subset
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────────────────
OUTPUT_DIR = "/kaggle/working"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Auto-detect: tim thu muc chua X_rainy_train.npy
DATA_DIR = None
_input = "/kaggle/input"
_target = "X_rainy_train.npy"
for _root, _dirs, _files in os.walk(_input):
    if _target in _files:
        DATA_DIR = _root
        break

if DATA_DIR is None:
    print("Full tree under /kaggle/input:")
    for _root, _dirs, _files in os.walk(_input):
        _depth = _root.replace(_input, "").count(os.sep)
        print("  " * _depth + os.path.basename(_root) + "/", _files[:5])
    raise FileNotFoundError(
        "Khong tim thay dataset. "
        "Vao panel Input -> Add Input -> attach dataset huongdien-dataset."
    )

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device  : {device}")
if device.type == "cuda":
    print(f"GPU     : {torch.cuda.get_device_name(0)}")
print(f"DATA_DIR: {DATA_DIR}")
print(f"Files   : {sorted(os.listdir(DATA_DIR))}")

# ── Config ─────────────────────────────────────────────────────────────────────
CFG = {
    # Model
    "hidden_size"   : 128,
    "num_layers"    : 2,
    "dropout"       : 0.3,
    "n_quantiles"   : 3,
    "quantiles"     : [0.10, 0.50, 0.90],
    # Training
    "epochs"        : 150,
    "batch_size"    : 64,
    "lr"            : 3e-4,
    "weight_decay"  : 1e-5,
    "warmup_epochs" : 10,
    "grad_clip"     : 1.0,
    "patience"      : 20,
    # Oversampling lũ (RAINY only)
    "oversample_p95": 3,
    "oversample_p99": 5,
    # Teacher forcing
    "tf_start"      : 0.8,
    "tf_end"        : 0.0,
}
print("\\nConfig OK")
"""))

# ── Cell 2: Model definition ───────────────────────────────────────────────────
cells.append(md("## Model: Encoder-Decoder LSTM + Quantile Head"))

cells.append(code("""
# ══════════════════════════════════════════════════════════════════════════════
#  QUANTILE LOSS
# ══════════════════════════════════════════════════════════════════════════════

def quantile_loss(preds, targets, quantiles):
    \"\"\"Pinball loss — preds: (B,T,n_q)  targets: (B,T).\"\"\"
    loss = 0.0
    for i, q in enumerate(quantiles):
        err  = targets - preds[:, :, i]
        loss = loss + torch.mean(torch.max(q * err, (q - 1) * err))
    return loss / len(quantiles)


# ══════════════════════════════════════════════════════════════════════════════
#  MODEL
# ══════════════════════════════════════════════════════════════════════════════

class HuongDienLSTM(nn.Module):
    \"\"\"
    Encoder-Decoder LSTM cho Hồ Hương Điền.
      Encoder : LSTM(n_features → hidden) × num_layers — học hindcast 48h
      Decoder : LSTM(hidden → hidden) × num_layers     — dự báo 24h tới
      Head    : FC → (horizon, n_quantiles)  [Q10, Q50, Q90]
    Target transform: y = √inflow  →  inverse: inflow = y²
    \"\"\"

    def __init__(self, n_features, hidden_size=128, num_layers=2,
                 dropout=0.3, horizon=24, n_quantiles=3):
        super().__init__()
        self.horizon     = horizon
        self.n_quantiles = n_quantiles
        H = hidden_size

        self.input_proj = nn.Sequential(
            nn.Linear(n_features, H),
            nn.LayerNorm(H),
            nn.ReLU(),
        )
        self.encoder = nn.LSTM(H, H, num_layers,
                               dropout=dropout if num_layers > 1 else 0.0,
                               batch_first=True)
        self.decoder_proj = nn.Linear(H, H)
        self.decoder = nn.LSTM(H, H, num_layers,
                               dropout=dropout if num_layers > 1 else 0.0,
                               batch_first=True)
        self.fc_out = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(H, H // 2),
            nn.ReLU(),
            nn.Linear(H // 2, n_quantiles),
        )
        self.start_token = nn.Parameter(torch.zeros(1, 1, H))
        self._init_weights()

    def _init_weights(self):
        for lstm in [self.encoder, self.decoder]:
            for name, p in lstm.named_parameters():
                if "weight_ih" in name:   nn.init.xavier_uniform_(p)
                elif "weight_hh" in name: nn.init.orthogonal_(p)
                elif "bias" in name:
                    nn.init.zeros_(p)
                    n = p.size(0) // 4
                    p.data[n:2*n].fill_(1.0)   # forget gate bias = 1

    def forward(self, x_hist, teacher_forcing=False, y_teacher=None):
        \"\"\"x_hist: (B, 48, n_features) → (B, 24, n_quantiles).\"\"\"
        B = x_hist.size(0)
        enc_in = self.input_proj(x_hist)
        _, (h, c) = self.encoder(enc_in)

        dec_in = self.start_token.expand(B, -1, -1)
        preds  = []

        for t in range(self.horizon):
            out, (h, c) = self.decoder(dec_in, (h, c))
            q_t = self.fc_out(out.squeeze(1))
            preds.append(q_t)

            if teacher_forcing and y_teacher is not None and t < self.horizon - 1:
                nv  = y_teacher[:, t:t+1].unsqueeze(-1).expand(B, 1, h.size(-1))
                dec_in = self.decoder_proj(nv)
            else:
                mid = self.n_quantiles // 2
                nv  = q_t[:, mid:mid+1].unsqueeze(-1).expand(B, 1, h.size(-1))
                dec_in = self.decoder_proj(nv)

        return F.relu(torch.stack(preds, dim=1))   # (B, horizon, n_q)


# ══════════════════════════════════════════════════════════════════════════════
#  METRICS
# ══════════════════════════════════════════════════════════════════════════════

def compute_metrics(y_pred_sqrt, y_true_sqrt, horizon_h=24):
    \"\"\"Tính NSE/KGE/RMSE/MAE trên không gian inflow gốc (m³/s).\"\"\"
    yp = y_pred_sqrt.pow(2).reshape(-1).numpy()
    yt = y_true_sqrt.pow(2).reshape(-1).numpy()

    ss_res = ((yt - yp) ** 2).sum()
    ss_tot = ((yt - yt.mean()) ** 2).sum()
    nse    = float(1 - ss_res / (ss_tot + 1e-8))

    r     = float(np.corrcoef(yp, yt)[0, 1]) if len(yp) > 1 else 0.0
    alpha = yp.std() / (yt.std() + 1e-8)
    beta  = yp.mean() / (yt.mean() + 1e-8)
    kge   = float(1 - ((r-1)**2 + (alpha-1)**2 + (beta-1)**2)**0.5)

    rmse = float(((yt - yp)**2).mean()**0.5)
    mae  = float(abs(yt - yp).mean())
    bias = float((yp - yt).mean() / (yt.mean() + 1e-8) * 100)

    per_h = {}
    for h in [0, 5, 11, 23]:
        if h < horizon_h:
            p_h = y_pred_sqrt[:, h].pow(2).numpy()
            t_h = y_true_sqrt[:, h].pow(2).numpy()
            ss_r  = ((t_h - p_h)**2).sum()
            ss_to = ((t_h - t_h.mean())**2).sum()
            per_h[f"nse_t{h+1}h"]  = float(1 - ss_r / (ss_to + 1e-8))
            per_h[f"rmse_t{h+1}h"] = float(((t_h - p_h)**2).mean()**0.5)

    return {"nse": nse, "kge": kge, "rmse_m3s": rmse,
            "mae_m3s": mae, "bias_pct": bias, **per_h}


print("Model classes loaded OK")
print(f"  Test: {HuongDienLSTM(n_features=93)(torch.randn(2,48,93)).shape}")
"""))

# ── Cell 3: Data loading ───────────────────────────────────────────────────────
cells.append(md("## Data Loading"))

cells.append(code("""
def load_split(season, split):
    X = np.load(f"{DATA_DIR}/X_{season}_{split}.npy")
    y = np.load(f"{DATA_DIR}/y_{season}_{split}.npy")
    return TensorDataset(torch.tensor(X, dtype=torch.float32),
                         torch.tensor(y, dtype=torch.float32))


def oversample_flood(dataset, p95_factor, p99_factor):
    \"\"\"Duplicate flood events để cân bằng distribution (dùng cho RAINY).\"\"\"
    X, y  = dataset.tensors
    y_peak = y.max(dim=1).values.pow(2)
    thr95  = float(y_peak.quantile(0.95))
    thr99  = float(y_peak.quantile(0.99))
    idx95  = (y_peak >= thr95).nonzero(as_tuple=True)[0].tolist()
    idx99  = (y_peak >= thr99).nonzero(as_tuple=True)[0].tolist()
    all_idx = list(range(len(X))) + idx95 * p95_factor + idx99 * p99_factor
    print(f"  Oversample: base={len(X):,} "
          f"| p95(max²≥{thr95:.0f})×{p95_factor}={len(idx95)} "
          f"| p99×{p99_factor}={len(idx99)} "
          f"| total={len(all_idx):,}")
    return Subset(dataset, all_idx)


# Preview dataset sizes
for season in ["rainy", "dry"]:
    for split in ["train", "val", "test"]:
        ds = load_split(season, split)
        X, y = ds.tensors
        print(f"  {season}/{split:5s}: {len(ds):5,} windows  "
              f"max_inflow={y.max().item()**2:6.0f} m³/s")
"""))

# ── Cell 4: Training functions ─────────────────────────────────────────────────
cells.append(md("## Training Functions"))

cells.append(code("""
def get_tf_ratio(epoch, cfg):
    p = epoch / max(cfg["epochs"] - 1, 1)
    return cfg["tf_start"] * (1 - p) + cfg["tf_end"] * p


def train_one_epoch(model, loader, optimizer, scaler_amp, cfg, epoch):
    model.train()
    total_loss = 0.0
    tf = get_tf_ratio(epoch, cfg)
    use_amp = scaler_amp is not None

    for X_b, y_b in loader:
        X_b, y_b = X_b.to(device), y_b.to(device)
        use_tf = torch.rand(1).item() < tf
        optimizer.zero_grad()

        with torch.amp.autocast("cuda", enabled=use_amp):
            preds = model(X_b, teacher_forcing=use_tf,
                          y_teacher=(y_b if use_tf else None))
            loss  = quantile_loss(preds, y_b, cfg["quantiles"])

        if use_amp:
            scaler_amp.scale(loss).backward()
            scaler_amp.unscale_(optimizer)
            nn.utils.clip_grad_norm_(model.parameters(), cfg["grad_clip"])
            scaler_amp.step(optimizer); scaler_amp.update()
        else:
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), cfg["grad_clip"])
            optimizer.step()

        total_loss += loss.item()
    return total_loss / len(loader)


@torch.no_grad()
def evaluate(model, loader, cfg):
    model.eval()
    total_loss, preds_all, targets_all = 0.0, [], []
    for X_b, y_b in loader:
        X_b, y_b = X_b.to(device), y_b.to(device)
        preds = model(X_b, teacher_forcing=False)
        total_loss += quantile_loss(preds, y_b, cfg["quantiles"]).item()
        preds_all.append(preds.cpu()); targets_all.append(y_b.cpu())
    preds_cat   = torch.cat(preds_all)
    targets_cat = torch.cat(targets_all)
    q50 = preds_cat[:, :, cfg["n_quantiles"] // 2]
    return total_loss / len(loader), preds_cat, targets_cat, compute_metrics(q50, targets_cat)


def plot_results(season, preds, targets, test_m, cfg, history):
    prefix = f"{OUTPUT_DIR}/lstm_{season}"
    q50 = cfg["n_quantiles"] // 2
    q10, q90 = 0, cfg["n_quantiles"] - 1

    y_true = targets[:, 0].pow(2).numpy()
    y_q50  = preds[:, 0, q50].pow(2).numpy()
    y_q10  = preds[:, 0, q10].pow(2).numpy()
    y_q90  = preds[:, 0, q90].pow(2).numpy()
    n      = min(600, len(y_true))

    # Loss curve
    if history:
        fig, ax = plt.subplots(figsize=(10, 3))
        ep = [h["epoch"] for h in history]
        ax.plot(ep, [h["train_loss"] for h in history], label="Train")
        ax.plot(ep, [h["val_loss"]   for h in history], label="Val")
        ax.set(xlabel="Epoch", ylabel="Quantile Loss",
               title=f"LSTM_{season.upper()} — Loss curve")
        ax.legend(); ax.grid(alpha=0.3); fig.tight_layout()
        fig.savefig(f"{prefix}_loss.png", dpi=120); plt.close(fig)

    # Forecast vs Actual
    fig, ax = plt.subplots(figsize=(14, 4))
    ax.fill_between(range(n), y_q10[:n], y_q90[:n],
                    alpha=0.25, color="steelblue", label="Q10-Q90")
    ax.plot(range(n), y_true[:n], "k",   lw=1.5, label="Thực tế")
    ax.plot(range(n), y_q50[:n],  "r--", lw=1.5, label="Dự báo Q50")
    title = ("LSTM_RAINY — Test: Oct-Dec 2025" if season == "rainy"
             else "LSTM_DRY — Test: Jul-Aug 2025")
    ax.set(xlabel="Giờ", ylabel="Inflow (m³/s)",
           title=f"{title} | NSE={test_m['nse']:.3f} KGE={test_m['kge']:.3f}")
    ax.legend(); ax.grid(alpha=0.3); fig.tight_layout()
    fig.savefig(f"{prefix}_forecast.png", dpi=120); plt.close(fig)

    # Scatter
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.scatter(y_true, y_q50, s=4, alpha=0.3, color="steelblue")
    vmax = max(y_true.max(), y_q50.max())
    ax.plot([0, vmax], [0, vmax], "k--", lw=1, label="1:1")
    ax.set(xlabel="Thực tế (m³/s)", ylabel="Dự báo Q50 (m³/s)",
           title=f"Scatter | NSE={test_m['nse']:.3f}")
    ax.legend(); ax.grid(alpha=0.3); fig.tight_layout()
    fig.savefig(f"{prefix}_scatter.png", dpi=120); plt.close(fig)

    print(f"  Saved: {prefix}_loss.png | _forecast.png | _scatter.png")


print("Training functions loaded OK")
"""))

# ── Cell 5: train_season ───────────────────────────────────────────────────────
cells.append(md("## Core Training Loop"))

cells.append(code("""
def train_season(season, cfg):
    print(f"\\n{'='*60}")
    print(f"  TRAINING: LSTM_{season.upper()}")
    print(f"{'='*60}")

    ds_train = load_split(season, "train")
    ds_val   = load_split(season, "val")
    ds_test  = load_split(season, "test")

    n_features = ds_train[0][0].shape[-1]
    horizon    = ds_train[0][1].shape[-1]
    print(f"  n_features={n_features}  horizon={horizon}h  "
          f"train={len(ds_train):,}  val={len(ds_val):,}  test={len(ds_test):,}")

    # Oversample flood events cho RAINY
    ds_tr = (oversample_flood(ds_train, cfg["oversample_p95"], cfg["oversample_p99"])
             if season == "rainy" else ds_train)

    n_w  = 2 if device.type == "cuda" else 0
    pin  = device.type == "cuda"
    train_loader = DataLoader(ds_tr,     batch_size=cfg["batch_size"],
                              shuffle=True,  num_workers=n_w, pin_memory=pin)
    val_loader   = DataLoader(ds_val,    batch_size=cfg["batch_size"],
                              shuffle=False, num_workers=n_w, pin_memory=pin)
    test_loader  = DataLoader(ds_test,   batch_size=cfg["batch_size"],
                              shuffle=False, num_workers=0)

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

    optimizer  = torch.optim.AdamW(model.parameters(),
                                   lr=cfg["lr"], weight_decay=cfg["weight_decay"])
    scaler_amp = torch.amp.GradScaler("cuda") if device.type == "cuda" else None

    def lr_lambda(ep):
        if ep < cfg["warmup_epochs"]:
            return (ep + 1) / cfg["warmup_epochs"]
        prog = (ep - cfg["warmup_epochs"]) / max(cfg["epochs"] - cfg["warmup_epochs"], 1)
        return max(0.05, 0.5 * (1 + math.cos(math.pi * prog)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    ckpt_path = f"{OUTPUT_DIR}/lstm_{season}_best.pt"
    best_val, patience_cnt, history = float("inf"), 0, []

    for epoch in range(cfg["epochs"]):
        t0 = time.time()
        tr_loss = train_one_epoch(model, train_loader, optimizer, scaler_amp, cfg, epoch)
        vl_loss, _, _, vm = evaluate(model, val_loader, cfg)
        scheduler.step()
        lr_now = optimizer.param_groups[0]["lr"]

        history.append({"epoch": epoch+1, "lr": lr_now,
                         "train_loss": tr_loss, "val_loss": vl_loss, **vm})

        print(f"  Ep {epoch+1:3d}/{cfg['epochs']} | LR {lr_now:.1e} | "
              f"Train {tr_loss:.4f} | Val {vl_loss:.4f} | "
              f"NSE {vm['nse']:.3f} | KGE {vm['kge']:.3f} | "
              f"RMSE {vm['rmse_m3s']:.1f} m³/s | {time.time()-t0:.1f}s")

        if vl_loss < best_val:
            best_val = vl_loss; patience_cnt = 0
            torch.save({"state_dict": model.state_dict(), "cfg": cfg,
                        "n_features": n_features, "horizon": horizon,
                        "epoch": epoch+1, "val_metrics": vm}, ckpt_path)
            print(f"  ✔ Best saved (val_loss={best_val:.4f})")
        else:
            patience_cnt += 1
            if patience_cnt >= cfg["patience"]:
                print(f"  Early stopping ep {epoch+1}"); break

    # ── Test evaluation ────────────────────────────────────────────────────────
    test_label = "Oct-Dec 2025 (Tran lu lon nhat)" if season=="rainy" else "Jul-Aug 2025"
    print(f"\\n{'─'*60}")
    print(f"  TEST: {test_label}")
    print(f"{'─'*60}")

    ckpt = torch.load(ckpt_path, map_location=device)
    model.load_state_dict(ckpt["state_dict"])
    _, preds, targets, tm = evaluate(model, test_loader, cfg)

    print(f"  NSE       : {tm['nse']:.4f}   (>0.7 tot  >0.9 xuat sac)")
    print(f"  KGE       : {tm['kge']:.4f}   (>0.7 tot)")
    print(f"  RMSE      : {tm['rmse_m3s']:.1f} m3/s")
    print(f"  MAE       : {tm['mae_m3s']:.1f} m3/s")
    print(f"  Bias      : {tm['bias_pct']:.1f}%")
    for k, v in tm.items():
        if "nse_t" in k or "rmse_t" in k:
            print(f"    {k}: {v:.3f}")

    np.save(f"{OUTPUT_DIR}/preds_{season}_test.npy",   preds.numpy())
    np.save(f"{OUTPUT_DIR}/targets_{season}_test.npy", targets.numpy())
    with open(f"{OUTPUT_DIR}/metrics_{season}_test.json", "w") as f:
        json.dump(tm, f, indent=2)

    plot_results(season, preds, targets, tm, cfg, history)
    print(f"  Model saved: {ckpt_path}")
    return tm


print("train_season() ready")
"""))

# ── Cell 6: Train RAINY ────────────────────────────────────────────────────────
cells.append(md("""
## Train LSTM_RAINY
**Train**: Jan 2022 + Oct 2023 → Jan 2024 (chu kỳ lũ 2023-24)
**Val**: Sep 2025 (ramp-up mùa lũ)
**Test**: Oct–Dec 2025 — đỉnh lũ max = **7 865 m³/s**
"""))

cells.append(code("""
metrics_rainy = train_season("rainy", CFG)
"""))

# ── Cell 7: Train DRY ─────────────────────────────────────────────────────────
cells.append(md("""
## Train LSTM_DRY
**Train**: May 2022 → May 2025 (mùa khô các năm)
**Val**: May–Jun 2025
**Test**: Jul–Aug 2025
"""))

cells.append(code("""
metrics_dry = train_season("dry", CFG)
"""))

# ── Cell 8: Summary ───────────────────────────────────────────────────────────
cells.append(md("## Tổng kết kết quả"))

cells.append(code("""
print("=" * 50)
print("  KET QUA CUOI")
print("=" * 50)
for season, m in [("rainy", metrics_rainy), ("dry", metrics_dry)]:
    label = "LSTM_RAINY (Oct-Dec 2025)" if season=="rainy" else "LSTM_DRY  (Jul-Aug 2025)"
    print(f"\\n  {label}")
    print(f"    NSE  = {m['nse']:.4f}")
    print(f"    KGE  = {m['kge']:.4f}")
    print(f"    RMSE = {m['rmse_m3s']:.1f} m3/s")
    print(f"    MAE  = {m['mae_m3s']:.1f} m3/s")
    print(f"    Bias = {m['bias_pct']:.1f}%")

print(f"\\nFiles trong /kaggle/working/:")
for f in sorted(os.listdir(OUTPUT_DIR)):
    kb = os.path.getsize(os.path.join(OUTPUT_DIR, f)) / 1024
    print(f"  {f:45s} {kb:8.1f} KB")
"""))

# ══════════════════════════════════════════════════════════════════════════════
#  Assemble notebook
# ══════════════════════════════════════════════════════════════════════════════

notebook = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3",
        },
        "language_info": {
            "name": "python",
            "version": "3.10.0",
        },
        },
    "cells": cells,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(notebook, f, ensure_ascii=True, indent=1)  # ASCII-safe for Kaggle

print(f"Created: {OUT}")
print(f"Size   : {os.path.getsize(OUT)/1024:.1f} KB")
print(f"\nUpload file nay len Kaggle Notebook.")
