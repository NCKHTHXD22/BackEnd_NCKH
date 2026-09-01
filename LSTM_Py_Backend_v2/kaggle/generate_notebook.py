"""
Tạo notebook Kaggle sẵn sàng upload, cho 1 hồ (tham số hóa qua RID ở Cell Setup).

Khác LSTM_Hue/kaggle/generate_notebook.py (code model được gõ tay trực tiếp
vào notebook): script này ĐỌC nội dung thật từ các file .py trong
LSTM_Py_Backend_v2/ (models/, training/, data/reservoir_dataset.py) và nhúng
vào cell — tránh notebook bị lệch (drift) so với code thật khi sửa sau này.

Chạy:
    cd LSTM_Py_Backend_v2
    python kaggle/generate_notebook.py --rid 2
Kết quả: kaggle/train_reservoir_<rid>.ipynb

Cách dùng trên Kaggle:
    1. Chạy main_build_dataset.py --rid <rid> ở máy có quyền truy cập
       Data_Tung_Ho_Ma_Tran_Rong/ (không chạy được trên Kaggle vì cần Excel nội bộ).
    2. Upload thư mục datasets/<reservoir_key>/ (chứa v2_*.npy) làm Kaggle Dataset.
    3. Upload notebook này, Add Input -> attach dataset vừa tạo.
    4. Run All -> checkpoint lưu vào /kaggle/working/.
"""

import argparse
import json
import os
import re
import sys
import textwrap

# Console Windows mac dinh dung cp1252, khong encode duoc tieng Viet co dau -> loi
# UnicodeEncodeError khi print(). Chuyen sang utf-8 neu co the (Python 3.7+).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")


def code(src: str):
    lines = textwrap.dedent(src).lstrip("\n").splitlines(keepends=True)
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": lines}


def md(src: str):
    return {"cell_type": "markdown", "metadata": {}, "source": [textwrap.dedent(src).lstrip("\n")]}


def read_source(rel_path: str, strip_local_imports: bool = True) -> str:
    """Đọc 1 file .py thật trong project, bỏ import nội bộ (đã nhúng ở cell trước)."""
    with open(os.path.join(ROOT, rel_path), "r", encoding="utf-8") as f:
        src = f.read()
    if strip_local_imports:
        # Bỏ "from .xxx import ..." và "from models.xxx import ..." / "from config...",
        # "from data...", "from training..." — các class/hàm đã nằm sẵn trong notebook.
        src = re.sub(r"^from \.\w+ import .*$", "", src, flags=re.MULTILINE)
        src = re.sub(r"^from (models|config|data|training)\.\w+ import .*$", "", src, flags=re.MULTILINE)
    return src.strip() + "\n"


def build_notebook(rid: int, reservoir_name: str, reservoir_key: str) -> dict:
    cells = []

    # ── Cell 0: Title ─────────────────────────────────────────────────────────
    cells.append(md(f"""
    # ReservoirLSTM — {reservoir_name} (rid={rid})
    **Kiến trúc**: Hindcast Bi-LSTM + Cross-Attention + NWP Embedding + Quantile Head (7 mức)
    **Target**: Dự báo lưu lượng vào hồ `inflow_m3s`
    **1 model độc lập cho hồ này** — không train chung với 15 hồ còn lại.

    > **Trước khi chạy**: Vào panel **Input** bên phải -> Add Input -> tìm dataset
    > chứa `v2_X_hindcast.npy` (build từ `main_build_dataset.py --rid {rid}` trên máy
    > có Data_Tung_Ho_Ma_Tran_Rong/, upload thư mục `datasets/{reservoir_key}/` lên
    > làm Kaggle Dataset). Nếu đặt tên dataset khác, sửa `DATA_DIR` ở Cell Setup.
    """))

    # ── Cell 1: Setup ─────────────────────────────────────────────────────────
    cells.append(code("""
    import os, json, math, random, warnings
    import numpy as np
    import pandas as pd
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.utils.data import DataLoader, Dataset, Subset
    from tqdm import tqdm
    warnings.filterwarnings("ignore")

    RID = %d
    RESERVOIR_NAME = %r
    RESERVOIR_KEY  = %r

    OUTPUT_DIR = "/kaggle/working"
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Auto-detect: tim thu muc chua v2_X_hindcast.npy
    DATA_DIR = None
    _input = "/kaggle/input"
    _target = "v2_X_hindcast.npy"
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
            "Khong tim thay dataset. Vao panel Input -> Add Input -> "
            f"attach dataset chua v2_*.npy cua {RESERVOIR_NAME}."
        )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Reservoir: {RESERVOIR_NAME} (rid={RID})")
    print(f"Device   : {device}")
    if device.type == "cuda":
        print(f"GPU      : {torch.cuda.get_device_name(0)}")
    print(f"DATA_DIR : {DATA_DIR}")
    print(f"Files    : {sorted(os.listdir(DATA_DIR))}")
    """ % (rid, reservoir_name, reservoir_key)))

    # ── Cell 2: Config ────────────────────────────────────────────────────────
    cells.append(md("## Config"))
    cells.append(code(read_source("config/settings.py")))
    cells.append(code("""
    CFG = ReservoirLSTMConfig(rid=RID, reservoir_name=RESERVOIR_NAME)
    CFG.artifacts_dir = OUTPUT_DIR
    print(CFG)
    """))

    # ── Cell 3: Station attention (optional module) ──────────────────────────
    cells.append(md("## Model — StationRainAttention (tùy chọn, tắt mặc định)"))
    cells.append(code(read_source("models/station_attention.py")))

    # ── Cell 4: Main model ────────────────────────────────────────────────────
    cells.append(md("## Model — ReservoirLSTM"))
    cells.append(code(read_source("models/flood_lstm_v2.py")))

    # ── Cell 5: Loss ──────────────────────────────────────────────────────────
    cells.append(md("## Loss — Quantile + Peak-aware + Coverage"))
    cells.append(code(read_source("models/quantile_loss_v2.py")))

    # ── Cell 6: Event metrics ─────────────────────────────────────────────────
    cells.append(md("## Metrics — NSE theo lead-time + chẩn đoán từng trận lũ"))
    cells.append(code(read_source("training/event_metrics.py")))

    # ── Cell 7: Dataset ───────────────────────────────────────────────────────
    cells.append(md("## Dataset"))
    cells.append(code(read_source("data/reservoir_dataset.py")))
    cells.append(code("""
    dataset = ReservoirDataset(
        DATA_DIR,
        inflow_cap_sqrt=(math.sqrt(INFLOW_CAPS_M3S[RID]) if RID in INFLOW_CAPS_M3S else None),
        max_stations=CFG.max_stations,
    )
    print(f"Total samples: {len(dataset):,}")
    """))

    # ── Cell 8: Train/val/test split + oversampling ──────────────────────────
    cells.append(md("## Split + Flood Oversampling"))
    cells.append(code("""
    ts = dataset.timestamps
    train_end  = np.datetime64(CFG.train_end, "s")
    val_start  = np.datetime64(CFG.val_start, "s")
    val_end    = np.datetime64(CFG.val_end, "s")
    test_start = np.datetime64(CFG.test_start, "s")

    all_idx = np.arange(len(ts))
    train_idx = all_idx[ts < val_start].tolist()
    val_idx   = all_idx[(ts >= val_start) & (ts < val_end)].tolist()
    test_idx  = all_idx[ts >= test_start].tolist()
    print(f"Train: {len(train_idx):,} | Val: {len(val_idx):,} | Test: {len(test_idx):,}")

    train_y_max = dataset.y[train_idx].max(axis=1)
    thr95 = float(np.percentile(train_y_max, 95))
    thr99 = float(np.percentile(train_y_max, 99))
    idx95 = [train_idx[i] for i in np.where(train_y_max >= thr95)[0]]
    idx99 = [train_idx[i] for i in np.where(train_y_max >= thr99)[0]]
    oversampled = train_idx + idx95 * CFG.oversample_p95_factor + idx99 * CFG.oversample_p99_factor
    print(f"Oversampling: top5%={len(idx95):,}x{CFG.oversample_p95_factor} | "
          f"top1%={len(idx99):,}x{CFG.oversample_p99_factor} | total={len(oversampled):,}")

    n_w = 2 if device.type == "cuda" else 0
    _kw = dict(num_workers=n_w, pin_memory=(device.type == "cuda"), persistent_workers=(n_w > 0))
    train_loader = DataLoader(Subset(dataset, oversampled), batch_size=CFG.batch_size, shuffle=True, **_kw)
    val_loader   = DataLoader(Subset(dataset, val_idx),    batch_size=CFG.batch_size, shuffle=False, **_kw)
    test_loader  = DataLoader(Subset(dataset, test_idx),   batch_size=CFG.batch_size, shuffle=False, num_workers=n_w)
    """))

    # ── Cell 9: Seed + metrics helper ─────────────────────────────────────────
    cells.append(md("## Seed + Metrics Helper"))
    cells.append(code("""
    SEED = 42
    random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(SEED)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


    def nse_np(obs, pred):
        ss_res = float(np.sum((obs - pred) ** 2))
        ss_tot = float(np.sum((obs - obs.mean()) ** 2))
        return float("nan") if ss_tot < 1e-8 else 1.0 - ss_res / ss_tot


    def compute_metrics(preds, targets, med_idx):
        pred_med = preds[:, :, med_idx]
        pred_raw   = (pred_med ** 2).numpy()
        target_raw = (targets ** 2).numpy()
        mae  = float(np.mean(np.abs(pred_raw - target_raw)))
        rmse = float(np.sqrt(np.mean((pred_raw - target_raw) ** 2)))
        nse  = nse_np(target_raw.flatten(), pred_raw.flatten())
        return {"mae": mae, "rmse": rmse, "nse": nse}


    print("Helpers OK")
    """))

    # ── Cell 10: Training loop ────────────────────────────────────────────────
    cells.append(md("## Training Loop"))
    cells.append(code("""
    model = ReservoirLSTM(CFG).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"ReservoirLSTM parameters: {n_params:,}")

    if CFG.use_station_attention and getattr(dataset, "station_prior_weights", None):
        model.station_attn.init_prior(dataset.station_prior_weights)
        print(f"  station_attn.init_prior({[round(w, 3) for w in dataset.station_prior_weights]})")

    optimizer = torch.optim.AdamW(model.parameters(), lr=CFG.lr, weight_decay=CFG.weight_decay)

    def lr_lambda(epoch):
        if epoch < CFG.warmup_epochs:
            return float(epoch + 1) / CFG.warmup_epochs
        progress = (epoch - CFG.warmup_epochs) / max(CFG.epochs - CFG.warmup_epochs, 1)
        return max(0.05, 0.5 * (1 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    use_amp = device.type == "cuda"
    amp_scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    print(f"AMP: {'ON' if use_amp else 'OFF'}")

    best_val = float("inf")
    patience_cnt = 0
    history = []
    ckpt_path = os.path.join(OUTPUT_DIR, "reservoir_lstm.pt")

    for epoch in range(CFG.epochs):
        tf_ratio = CFG.teacher_forcing_ratio(epoch)
        model.train()
        train_loss = 0.0
        for x_hind, x_nwp, y_b, station_rain, station_mask in tqdm(
            train_loader, desc=f"Epoch {epoch+1}/{CFG.epochs}", leave=False
        ):
            x_hind, x_nwp, y_b = x_hind.to(device), x_nwp.to(device), y_b.to(device)
            station_rain, station_mask = station_rain.to(device), station_mask.to(device)
            y_noisy = y_b + torch.randn_like(y_b) * CFG.target_noise_std if CFG.target_noise_std > 0 else y_b

            optimizer.zero_grad()
            with torch.amp.autocast("cuda", enabled=use_amp):
                preds = model(x_hind, x_nwp, teacher_forcing_ratio=tf_ratio, y_true_sqrt=y_noisy,
                              station_rain=station_rain, station_mask=station_mask)
                loss = quantile_loss_v2(preds, y_noisy, CFG.quantiles)

            amp_scaler.scale(loss).backward()
            amp_scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), CFG.grad_clip)
            amp_scaler.step(optimizer)
            amp_scaler.update()
            train_loss += loss.item()

        train_loss /= len(train_loader)

        model.eval()
        val_loss = 0.0
        all_preds, all_targets = [], []
        with torch.no_grad():
            for x_hind, x_nwp, y_b, station_rain, station_mask in val_loader:
                x_hind, x_nwp, y_b = x_hind.to(device), x_nwp.to(device), y_b.to(device)
                station_rain, station_mask = station_rain.to(device), station_mask.to(device)
                with torch.amp.autocast("cuda", enabled=use_amp):
                    preds = model(x_hind, x_nwp, teacher_forcing_ratio=0.0,
                                  station_rain=station_rain, station_mask=station_mask)
                    val_loss += quantile_loss_v2(preds, y_b, CFG.quantiles).item()
                all_preds.append(preds.cpu()); all_targets.append(y_b.cpu())

        val_loss /= len(val_loader)
        preds_cat, targets_cat = torch.cat(all_preds), torch.cat(all_targets)
        m = compute_metrics(preds_cat, targets_cat, CFG.median_idx)
        scheduler.step()
        lr_now = optimizer.param_groups[0]["lr"]

        print(f"Epoch {epoch+1:3d} | LR {lr_now:.2e} | TF {tf_ratio:.2f} | "
              f"Train {train_loss:.4f} | Val {val_loss:.4f} | "
              f"NSE {m['nse']:.3f} | MAE {m['mae']:.1f} | RMSE {m['rmse']:.1f} m3/s")
        history.append({"epoch": epoch+1, "lr": lr_now, "train_loss": train_loss, "val_loss": val_loss, **m})

        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), ckpt_path)
            patience_cnt = 0
            print("  Best model saved")
        else:
            patience_cnt += 1
        if patience_cnt >= CFG.patience:
            print("Early stopping.")
            break
    """))

    # ── Cell 11: Test evaluation ───────────────────────────────────────────────
    cells.append(md("## Đánh giá Test (Holdout) + NSE theo lead-time + chẩn đoán từng trận lũ"))
    cells.append(code("""
    model.load_state_dict(torch.load(ckpt_path, map_location=device))
    model.eval()

    all_preds, all_targets = [], []
    with torch.no_grad():
        for x_hind, x_nwp, y_b, station_rain, station_mask in test_loader:
            preds = model(x_hind.to(device), x_nwp.to(device), teacher_forcing_ratio=0.0,
                          station_rain=station_rain.to(device), station_mask=station_mask.to(device))
            all_preds.append(preds.cpu()); all_targets.append(y_b)

    preds_cat, targets_cat = torch.cat(all_preds), torch.cat(all_targets)
    m = compute_metrics(preds_cat, targets_cat, CFG.median_idx)
    print(f"TEST — NSE={m['nse']:.4f}  MAE={m['mae']:.2f} m3/s  RMSE={m['rmse']:.2f} m3/s")

    preds_np   = (preds_cat[:, :, CFG.median_idx] ** 2).numpy()
    targets_np = (targets_cat ** 2).numpy()

    horizon_rows = nse_per_horizon(preds_np, targets_np, group_hours=6)
    for h in horizon_rows:
        print(f"  lead {h['hour_range']:>8}  NSE={h['nse']}")

    obs_series, pred_series = extract_lead_time_series(preds_np, targets_np, lead_idx=CFG.forecast_len - 1)
    event_diag = {"n_events": 0}
    if len(obs_series) > 10 and obs_series.max() > 0:
        thr = float(np.percentile(obs_series, 90))
        event_diag = flood_event_diagnostics(obs_series, pred_series, threshold=thr)
        print(f"  [lead={CFG.forecast_len}h] n_events={event_diag['n_events']}  "
              f"NSE_event={event_diag.get('mean_event_nse')}  "
              f"peak_RE={event_diag.get('peak_re_mean')}  QA={event_diag.get('qa_pass_rate')}")

    pd.DataFrame(history).to_excel(f"{OUTPUT_DIR}/lich_su_training.xlsx", index=False)
    pd.DataFrame(horizon_rows).to_excel(f"{OUTPUT_DIR}/nse_theo_gio.xlsx", index=False)
    with open(f"{OUTPUT_DIR}/metrics_test.json", "w", encoding="utf-8") as f:
        json.dump({"reservoir": RESERVOIR_NAME, "rid": RID, **m,
                    "event_diagnostics": event_diag}, f, ensure_ascii=False, indent=2)

    print(f"\\nSaved to {OUTPUT_DIR}/: reservoir_lstm.pt, lich_su_training.xlsx, "
          f"nse_theo_gio.xlsx, metrics_test.json")
    """))

    notebook = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3.10.0"},
        },
        "cells": cells,
    }
    return notebook


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rid", type=int, required=True, help="reservoir id (config/reservoirs.py)")
    args = parser.parse_args()

    import sys
    sys.path.insert(0, ROOT)
    from config.reservoirs import RESERVOIRS

    if args.rid not in RESERVOIRS:
        raise SystemExit(f"rid={args.rid} không có trong config/reservoirs.py")
    info = RESERVOIRS[args.rid]
    reservoir_key = info["name"].replace(" ", "_")

    notebook = build_notebook(args.rid, info["name"], reservoir_key)

    out_path = os.path.join(HERE, f"train_reservoir_{args.rid}.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(notebook, f, ensure_ascii=True, indent=1)

    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")
    print(f"\nUpload file này lên Kaggle Notebook (nhớ attach dataset {reservoir_key}).")


if __name__ == "__main__":
    main()
