"""
Training script cho FloodLSTM v2 — 7-day probabilistic flood forecasting.

Chạy: python main_train_v2.py  (từ lstm_service/)
Hoặc: cd lstm_service && python -m training.train_v2

Thay đổi so với train_global.py:
  1. HindcastDataset (v2_*.npy) thay vì FloodDataset
  2. Teacher forcing ratio giảm tuyến tính theo epoch
  3. NWP input 2 source (src0=Open-Meteo, src1=zeros nếu chưa có backup)
  4. 7 quantiles → quantile_loss_v2
  5. Metrics bổ sung: CRPS (xác suất coverage), Winkler score
"""

import os
import math
import random
import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader, Subset
from tqdm import tqdm

from config.settings_v2 import FloodLSTMv2Config
from models.flood_lstm_v2 import FloodLSTMv2
from models.quantile_loss_v2 import quantile_loss_v2
from data.hindcast_dataset import HindcastDataset
from training.event_metrics import nse_per_horizon, flood_event_diagnostics, extract_lead_time_series


SEED = 42


def set_seed(seed: int = SEED):
    """Cố định seed torch/numpy/random — đảm bảo kết quả train lặp lại được."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


# ═══════════════════════════════════════════════════════════════════════════════
# Metrics
# ═══════════════════════════════════════════════════════════════════════════════

def compute_metrics_v2(
    preds: torch.Tensor,   # (N, 168, 7) sqrt space
    targets: torch.Tensor, # (N, 168) sqrt space
    rids: torch.Tensor,    # (N,)
    quantiles: list,
) -> dict:
    """
    Tính MAE, RMSE, NSE (trên P50, sau inverse sqrt),
    CRPS (xác suất bao phủ), Winkler score (90% interval).
    """
    med_idx = len(quantiles) // 2
    med_pred = preds[:, :, med_idx]  # (N, 168)

    # Inverse sqrt: Q = x²
    pred_raw   = med_pred ** 2
    target_raw = targets ** 2

    mae  = torch.mean(torch.abs(pred_raw - target_raw)).item()
    rmse = torch.sqrt(torch.mean((pred_raw - target_raw) ** 2)).item()

    # NSE per reservoir
    nse_dict = {}
    for rid_val in torch.unique(rids).tolist():
        mask = (rids == rid_val)
        if mask.sum() < 2:
            continue
        p_r = pred_raw[mask]
        t_r = target_raw[mask]
        mean_t = t_r.mean()
        ss_res = ((t_r - p_r) ** 2).sum()
        ss_tot = ((t_r - mean_t) ** 2).sum()
        if ss_tot > 0:
            nse_dict[rid_val] = (1.0 - ss_res / ss_tot).item()

    avg_nse = sum(nse_dict.values()) / max(len(nse_dict), 1)

    # CRPS approximation: mean pinball loss trên tất cả quantiles
    qs = torch.tensor(quantiles, device=preds.device)
    err = targets.unsqueeze(-1) - preds  # (N, 168, 7)
    crps = torch.max(qs * err, (qs - 1) * err).mean().item()

    # Winkler score — 90% interval [P5, P95], alpha=0.1
    alpha = 0.10
    lower = preds[:, :, 0] ** 2   # P5
    upper = preds[:, :, -1] ** 2  # P95
    width = (upper - lower)
    below = torch.clamp(lower - target_raw, min=0)
    above = torch.clamp(target_raw - upper, min=0)
    winkler = (width + (2 / alpha) * (below + above)).mean().item()

    return {
        "mae": mae,
        "rmse": rmse,
        "nse": avg_nse,
        "crps": crps,
        "winkler90": winkler,
        "nse_per_reservoir": {int(k): round(v, 4) for k, v in nse_dict.items()},
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Training Loop
# ═══════════════════════════════════════════════════════════════════════════════

def train_v2(cfg: FloodLSTMv2Config = None, data_dir: str = "."):

    set_seed(SEED)

    if cfg is None:
        cfg = FloodLSTMv2Config()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # ── Dataset ────────────────────────────────────────────────────────────────
    dataset = HindcastDataset(data_dir, max_stations=cfg.max_stations)
    N_total = len(dataset)
    if cfg.use_station_attention and not dataset.has_station_data:
        print(
            "  WARNING: use_station_attention=True nhưng không tìm thấy "
            "v2_station_rain.npy/v2_station_mask.npy — model sẽ chạy với "
            "station_rain=0 (không học được gì thêm)."
        )

    if dataset.timestamps is None:
        raise FileNotFoundError(
            "v2_timestamps.npy không tìm thấy. "
            "Chạy HindcastDatasetV2Builder.save() trước."
        )

    timestamps = dataset.timestamps

    # Fixed-date split — giống train_global.py
    VAL_START  = np.datetime64("2024-09-01", "s")
    VAL_END    = np.datetime64("2025-01-01", "s")
    TEST_START = np.datetime64("2025-09-01", "s")

    all_idx = np.arange(N_total)
    train_idx = all_idx[timestamps < VAL_START].tolist()
    val_idx   = all_idx[(timestamps >= VAL_START) & (timestamps < VAL_END)].tolist()
    test_idx  = all_idx[timestamps >= TEST_START].tolist()

    print(f"Train: {len(train_idx):,} | Val: {len(val_idx):,} | Test: {len(test_idx):,}")

    # Flood oversampling: top 5% × 2, top 1% × 3
    train_y_max = dataset.y[train_idx].max(axis=1)
    thr95 = float(np.percentile(train_y_max, 95))
    thr99 = float(np.percentile(train_y_max, 99))
    idx95 = [train_idx[i] for i in np.where(train_y_max >= thr95)[0]]
    idx99 = [train_idx[i] for i in np.where(train_y_max >= thr99)[0]]
    oversampled = (
        train_idx
        + idx95 * cfg.oversample_p95_factor
        + idx99 * cfg.oversample_p99_factor
    )
    print(f"Oversampling: top5%={len(idx95):,}x{cfg.oversample_p95_factor} | "
          f"top1%={len(idx99):,}x{cfg.oversample_p99_factor} | "
          f"train total={len(oversampled):,}")

    n_workers = 2 if device.type == "cuda" else 0
    _kw = dict(num_workers=n_workers, pin_memory=(device.type == "cuda"),
               persistent_workers=(n_workers > 0))

    train_loader = DataLoader(
        Subset(dataset, oversampled), batch_size=cfg.batch_size, shuffle=True, **_kw
    )
    val_loader = DataLoader(
        Subset(dataset, val_idx), batch_size=cfg.batch_size, shuffle=False, **_kw
    )
    test_loader = DataLoader(
        Subset(dataset, test_idx), batch_size=cfg.batch_size, shuffle=False,
        num_workers=n_workers,
    )

    # ── Model ──────────────────────────────────────────────────────────────────
    model = FloodLSTMv2(cfg).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"FloodLSTMv2 parameters: {n_params:,}")

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay
    )

    def lr_lambda(epoch):
        if epoch < cfg.warmup_epochs:
            return float(epoch + 1) / float(cfg.warmup_epochs)
        progress = (epoch - cfg.warmup_epochs) / max(cfg.epochs - cfg.warmup_epochs, 1)
        return max(0.05, 0.5 * (1.0 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

    use_amp = device.type == "cuda"
    scaler  = torch.amp.GradScaler("cuda", enabled=use_amp)
    print(f"AMP fp16: {'ON' if use_amp else 'OFF'}")

    os.makedirs("artifacts", exist_ok=True)
    best_val = float("inf")
    patience_cnt = 0
    patience = 20
    history = []

    # ── Training Loop ──────────────────────────────────────────────────────────
    for epoch in range(cfg.epochs):
        tf_ratio = cfg.teacher_forcing_ratio(epoch)

        model.train()
        train_loss = 0.0

        for x_hind, x_nwp0, x_nwp1, avail, y_b, rid_b, station_rain, station_mask in tqdm(
            train_loader, desc=f"Epoch {epoch+1}/{cfg.epochs} [Train]", leave=False
        ):
            x_hind  = x_hind.to(device)
            x_nwp0  = x_nwp0.to(device)
            x_nwp1  = x_nwp1.to(device)
            avail   = avail.to(device)
            y_b     = y_b.to(device)
            rid_b   = rid_b.to(device)
            station_rain = station_rain.to(device)
            station_mask = station_mask.to(device)

            optimizer.zero_grad()
            with torch.amp.autocast("cuda", enabled=use_amp):
                preds = model(
                    x_hindcast=x_hind,
                    reservoir_idx=rid_b,
                    nwp_sources=[x_nwp0, x_nwp1],
                    nwp_availability=avail,
                    teacher_forcing_ratio=tf_ratio,
                    y_true_sqrt=y_b,
                    station_rain=station_rain,
                    station_mask=station_mask,
                )
                # Nhỏ jitter để tránh overfitting trên training peaks
                y_noisy = y_b + torch.randn_like(y_b) * 0.005
                loss = quantile_loss_v2(preds, y_noisy, cfg.quantiles)

            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
            scaler.step(optimizer)
            scaler.update()
            train_loss += loss.item()

        train_loss /= len(train_loader)

        # ── Validation ─────────────────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        all_preds, all_targets, all_rids = [], [], []

        with torch.no_grad():
            for x_hind, x_nwp0, x_nwp1, avail, y_b, rid_b, station_rain, station_mask in val_loader:
                x_hind  = x_hind.to(device)
                x_nwp0  = x_nwp0.to(device)
                x_nwp1  = x_nwp1.to(device)
                avail   = avail.to(device)
                y_b     = y_b.to(device)
                rid_b   = rid_b.to(device)
                station_rain = station_rain.to(device)
                station_mask = station_mask.to(device)

                with torch.amp.autocast("cuda", enabled=use_amp):
                    preds = model(
                        x_hind, rid_b, [x_nwp0, x_nwp1], avail,
                        teacher_forcing_ratio=0.0,
                        station_rain=station_rain, station_mask=station_mask,
                    )
                    val_loss += quantile_loss_v2(preds, y_b, cfg.quantiles).item()

                all_preds.append(preds.cpu())
                all_targets.append(y_b.cpu())
                all_rids.append(rid_b.cpu())

        val_loss /= len(val_loader)
        all_preds   = torch.cat(all_preds)
        all_targets = torch.cat(all_targets)
        all_rids    = torch.cat(all_rids)

        metrics = compute_metrics_v2(all_preds, all_targets, all_rids, cfg.quantiles)
        scheduler.step()

        lr_now = optimizer.param_groups[0]["lr"]
        print(
            f"Epoch {epoch+1:3d} | LR {lr_now:.2e} | TF {tf_ratio:.2f} | "
            f"Train {train_loss:.4f} | Val {val_loss:.4f} | "
            f"NSE {metrics['nse']:.3f} | CRPS {metrics['crps']:.4f} | "
            f"Winkler90 {metrics['winkler90']:.2f}"
        )

        row = {"epoch": epoch + 1, "train_loss": train_loss, "val_loss": val_loss,
               **{k: v for k, v in metrics.items() if k != "nse_per_reservoir"}}
        history.append(row)

        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), "artifacts/flood_model_v2.pt")
            torch.save(cfg, "artifacts/flood_model_v2_config.pt")
            patience_cnt = 0
            print("  ✔ Best model saved")
        else:
            patience_cnt += 1

        if patience_cnt >= patience:
            print("Early stopping.")
            break

    # ── Test Evaluation (2025 Holdout) ─────────────────────────────────────────
    print("\n" + "=" * 70)
    print("ĐÁNH GIÁ TRÊN TẬP TEST 2025 (HOLDOUT)")
    print("=" * 70)

    model.load_state_dict(
        torch.load("artifacts/flood_model_v2.pt", map_location=device)
    )
    model.eval()

    all_preds, all_targets, all_rids = [], [], []
    with torch.no_grad():
        for x_hind, x_nwp0, x_nwp1, avail, y_b, rid_b, station_rain, station_mask in test_loader:
            preds = model(
                x_hind.to(device), rid_b.to(device),
                [x_nwp0.to(device), x_nwp1.to(device)], avail.to(device),
                station_rain=station_rain.to(device), station_mask=station_mask.to(device),
            )
            all_preds.append(preds.cpu())
            all_targets.append(y_b)
            all_rids.append(rid_b)

    all_preds   = torch.cat(all_preds)
    all_targets = torch.cat(all_targets)
    all_rids    = torch.cat(all_rids)

    metrics = compute_metrics_v2(all_preds, all_targets, all_rids, cfg.quantiles)

    try:
        from config.reservoirs import RESERVOIRS
        idx_to_name = {info["idx"]: info["name"] for _, info in RESERVOIRS.items()}
    except Exception:
        idx_to_name = {}

    rows = []
    for rid_i, nse_v in sorted(metrics["nse_per_reservoir"].items()):
        name = idx_to_name.get(rid_i, f"rid={rid_i}")
        mask = (all_rids == rid_i)
        p_r = all_preds[mask][:, :, cfg.median_idx] ** 2
        t_r = all_targets[mask] ** 2
        r_mae  = torch.abs(p_r - t_r).mean().item()
        r_rmse = torch.sqrt(((p_r - t_r) ** 2).mean()).item()
        rows.append({"Reservoir": name, "NSE": nse_v,
                     "MAE (m³/s)": round(r_mae, 2), "RMSE (m³/s)": round(r_rmse, 2)})
        print(f"  {name:.<30} NSE={nse_v:.3f}  MAE={r_mae:.2f}  RMSE={r_rmse:.2f}")

    rows.append({"Reservoir": "--- AVERAGE ---",
                 "NSE": round(metrics["nse"], 4),
                 "MAE (m³/s)": round(metrics["mae"], 2),
                 "RMSE (m³/s)": round(metrics["rmse"], 2)})
    print(f"\n  NSE={metrics['nse']:.3f} | MAE={metrics['mae']:.2f} | "
          f"RMSE={metrics['rmse']:.2f} | CRPS={metrics['crps']:.4f} | "
          f"Winkler90={metrics['winkler90']:.2f}")

    pd.DataFrame(rows).to_excel("ket_qua_v2_2025.xlsx", index=False)
    pd.DataFrame(history).to_excel("lich_su_training_v2.xlsx", index=False)
    print("\nSaved: ket_qua_v2_2025.xlsx | lich_su_training_v2.xlsx")

    # ------- NSE theo lead-time (ngày 1..7) + chẩn đoán từng trận lũ -------
    print("\n" + "=" * 70)
    print("CHẨN ĐOÁN BỔ SUNG: NSE THEO NGÀY DỰ BÁO & TỪNG TRẬN LŨ")
    print("=" * 70)

    preds_np   = (all_preds[:, :, cfg.median_idx] ** 2).numpy()
    targets_np = (all_targets ** 2).numpy()
    rids_np    = all_rids.numpy()

    horizon_rows = []
    for rid_i in sorted(metrics["nse_per_reservoir"].keys()):
        name = idx_to_name.get(rid_i, f"rid={rid_i}")
        mask = (rids_np == rid_i)
        p_r, t_r = preds_np[mask], targets_np[mask]

        for h in nse_per_horizon(p_r, t_r, group_hours=24):
            horizon_rows.append({"Reservoir": name, **h})

        # Event-based peak diagnostics tại lead-time xa nhất (ngày 7 = giờ 168)
        obs_series, pred_series = extract_lead_time_series(p_r, t_r, lead_idx=cfg.forecast_len - 1)
        if len(obs_series) > 10 and obs_series.max() > 0:
            thr = float(np.percentile(obs_series, 90))
            diag = flood_event_diagnostics(obs_series, pred_series, threshold=thr)
            print(f"  {name:.<30} [lead=168h] n_events={diag['n_events']:>3}  "
                  f"NSE_event={diag['mean_event_nse']}  peak_RE={diag['peak_re_mean']}  "
                  f"QA={diag['qa_pass_rate']}")

    pd.DataFrame(horizon_rows).to_excel("ket_qua_v2_nse_theo_ngay.xlsx", index=False)
    print("\nSaved: ket_qua_v2_nse_theo_ngay.xlsx")


if __name__ == "__main__":
    train_v2()
