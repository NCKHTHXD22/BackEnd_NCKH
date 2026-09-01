# training/train_reservoir.py
"""
Training script cho 1 hồ — adapt từ lstm_service/training/train_v2.py, bỏ
reservoir_idx/embedding, chỉ 1 nguồn NWP.

Chạy: python main_train.py --rid <id>   (từ LSTM_Py_Backend_v2/)
Hoặc: python -m training.train_reservoir --rid <id>

Giữ nguyên các cải tiến đã làm ở phiên trước (áp dụng cho lstm_service):
  - Seed cố định (torch/numpy/random + cudnn.deterministic)
  - Flood event oversampling (top 5%/1%)
  - NSE theo lead-time (nse_per_horizon) + chẩn đoán từng trận lũ
    (flood_event_diagnostics) ở bước đánh giá test cuối
  - Teacher forcing annealing, AMP fp16, cosine LR + warmup
"""

import os
import math
import json
import random

from config.reservoirs import RESERVOIRS
from config.settings import ReservoirLSTMConfig, INFLOW_CAPS_M3S
from data.reservoir_dataset import ReservoirDataset
from models.flood_lstm_v2 import ReservoirLSTM
from models.quantile_loss_v2 import quantile_loss_v2
from training.event_metrics import (
    nse_per_horizon, flood_event_diagnostics, extract_lead_time_series,
    metrics_at_specific_horizons, kge_single, picp,
)
import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader, Subset
from tqdm import tqdm









SEED = 42


def set_seed(seed: int = SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def nse_np(obs: np.ndarray, pred: np.ndarray) -> float:
    ss_res = float(np.sum((obs - pred) ** 2))
    ss_tot = float(np.sum((obs - obs.mean()) ** 2))
    return float("nan") if ss_tot < 1e-8 else 1.0 - ss_res / ss_tot


def compute_metrics(preds: torch.Tensor, targets: torch.Tensor, med_idx: int) -> dict:
    """preds: (N,T,Q) sqrt space, targets: (N,T) sqrt space -> metrics trên m3/s."""
    pred_med = preds[:, :, med_idx]
    pred_raw   = (pred_med ** 2).numpy()
    target_raw = (targets ** 2).numpy()

    mae  = float(np.mean(np.abs(pred_raw - target_raw)))
    rmse = float(np.sqrt(np.mean((pred_raw - target_raw) ** 2)))
    nse  = nse_np(target_raw.flatten(), pred_raw.flatten())
    r2   = nse  # R2 coefficient of determination is equal to NSE in hydrology evaluation
    return {"mae": mae, "rmse": rmse, "nse": nse, "r2": r2}



def train_reservoir(rid: int, cfg: ReservoirLSTMConfig = None, data_dir: str = None,
                     init_checkpoint: str = None, season: str = "all"):
    """season: 'all' (mặc định, cả năm) | 'dry' (chỉ train trên tháng 1-8) |
    'rainy' (chỉ train trên tháng 9-12). CHỈ lọc train/val theo mùa -- tập test
    (test_idx) LUÔN giữ nguyên đầy đủ 12 tháng để vẫn tính được cả nse tổng lẫn
    nse_dry_season/nse_rainy_season (biết model chuyên mùa áp ra ngoài mùa nó
    học có tệ đi không). Dùng cho cả Standalone (init_checkpoint=None) lẫn
    Fine-tune (init_checkpoint=<nhánh/lưu vực checkpoint chuyên mùa tương ứng>)."""
    if rid not in RESERVOIRS:
        raise ValueError(f"rid={rid} không có trong config/reservoirs.py")
    info = RESERVOIRS[rid]
    reservoir_key = info["name"].replace(" ", "_")

    set_seed(SEED)

    cfg = cfg or ReservoirLSTMConfig(rid=rid, reservoir_name=info["name"])
    cfg.artifacts_dir = os.path.join(cfg.artifacts_dir, reservoir_key)
    os.makedirs(cfg.artifacts_dir, exist_ok=True)

    data_dir = data_dir or os.path.join("datasets", reservoir_key)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[{rid}] {info['name']}  |  Device: {device}")
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # ── Dataset ────────────────────────────────────────────────────────────────
    cap_m3s = INFLOW_CAPS_M3S.get(rid)
    cap_sqrt = math.sqrt(cap_m3s) if cap_m3s else None
    dataset = ReservoirDataset(data_dir, inflow_cap_sqrt=cap_sqrt, max_stations=cfg.max_stations)
    if cfg.use_station_attention and not dataset.has_station_data:
        print(
            "  WARNING: use_station_attention=True nhưng không tìm thấy "
            "v2_station_rain.npy/v2_station_mask.npy — model sẽ chạy với "
            "station_rain=0 (không học được gì thêm)."
        )

    if dataset.timestamps is None:
        raise FileNotFoundError(f"{data_dir}/v2_timestamps.npy không tìm thấy.")

    ts = dataset.timestamps
    train_end  = np.datetime64(cfg.train_end, "s")
    val_start  = np.datetime64(cfg.val_start, "s")
    val_end    = np.datetime64(cfg.val_end, "s")
    test_start = np.datetime64(cfg.test_start, "s")

    all_idx = np.arange(len(ts))
    train_idx = all_idx[ts < val_start].tolist()
    val_idx   = all_idx[(ts >= val_start) & (ts < val_end)].tolist()
    test_idx  = all_idx[ts >= test_start].tolist()  # LUÔN đủ 12 tháng, không lọc theo mùa

    if season != "all":
        months = ts.astype("datetime64[M]").astype(int) % 12 + 1
        season_months = [1, 2, 3, 4, 5, 6, 7, 8] if season == "dry" else [9, 10, 11, 12]
        season_mask = np.isin(months, season_months)
        train_idx = [i for i in train_idx if season_mask[i]]
        val_idx = [i for i in val_idx if season_mask[i]]

    print(f"Train: {len(train_idx):,} | Val: {len(val_idx):,} | Test: {len(test_idx):,} | Season={season.upper()}")
    if len(train_idx) < 100 or len(val_idx) < 10 or len(test_idx) < 10:
        print("  WARNING: Rất ít sample ở 1 trong các tập — kiểm tra lại coverage dữ liệu của hồ này.")

    # Flood oversampling (theo % gia tri cuc tri -- chi bat diem dinh rieng le)
    train_y_max = dataset.y[train_idx].max(axis=1)
    thr95 = float(np.percentile(train_y_max, 95))
    thr99 = float(np.percentile(train_y_max, 99))
    idx95 = [train_idx[i] for i in np.where(train_y_max >= thr95)[0]]
    idx99 = [train_idx[i] for i in np.where(train_y_max >= thr99)[0]]

    # Oversampling theo MUA MUA (thang 8-12): bo sung cho oversample theo %
    # cuc tri o tren -- day nhan ban CA giai doan mua mua (khong chi diem dinh
    # rieng le) de model hoc ky hon dang tang/giam cua tran lu.
    train_months = dataset.timestamps[train_idx].astype("datetime64[M]").astype(int) % 12 + 1
    idx_rainy = [train_idx[i] for i in np.where(np.isin(train_months, cfg.rainy_season_months))[0]]

    oversampled = (
        train_idx + idx95 * cfg.oversample_p95_factor + idx99 * cfg.oversample_p99_factor
        + idx_rainy * cfg.oversample_rainy_season_factor
    )
    print(f"Oversampling: top5%={len(idx95):,}x{cfg.oversample_p95_factor} | "
          f"top1%={len(idx99):,}x{cfg.oversample_p99_factor} | "
          f"mua_mua(T8-12)={len(idx_rainy):,}x{cfg.oversample_rainy_season_factor} | "
          f"total={len(oversampled):,}")

    n_w = 2 if device.type == "cuda" else 0
    _kw = dict(num_workers=n_w, pin_memory=(device.type == "cuda"), persistent_workers=(n_w > 0))
    train_loader = DataLoader(Subset(dataset, oversampled), batch_size=cfg.batch_size, shuffle=True, **_kw)
    val_loader   = DataLoader(Subset(dataset, val_idx),    batch_size=cfg.batch_size, shuffle=False, **_kw)
    test_loader  = DataLoader(Subset(dataset, test_idx),   batch_size=cfg.batch_size, shuffle=False, num_workers=n_w)

    # ── Model ──────────────────────────────────────────────────────────────────
    model = ReservoirLSTM(cfg).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"ReservoirLSTM parameters: {n_params:,}")

    if init_checkpoint:
        state = torch.load(init_checkpoint, map_location=device)
        # Checkpoint tu Phase 1 (pretrain pooled) co the KHAC kien truc voi model
        # hien tai theo 2 kieu: (a) key hoan toan moi (station_attn.* -- Phase 1
        # khong bao gio bat use_station_attention), (b) key TON TAI o ca 2 ben
        # nhung LECH SHAPE (hindcast_proj.0.* -- input dim +1 vi noi them
        # station_extra). strict=False CHI xu ly truong hop (a), van raise loi
        # cho truong hop (b) -- phai loc thu cong truoc khi load.
        own_state = model.state_dict()
        compatible, skipped_shape = {}, []
        for k, v in state.items():
            if k in own_state and own_state[k].shape == v.shape:
                compatible[k] = v
            elif k in own_state:
                skipped_shape.append((k, tuple(v.shape), tuple(own_state[k].shape)))
        missing, unexpected = model.load_state_dict(compatible, strict=False)
        print(f"  Warm-start: loaded pretrained weights from {init_checkpoint}")
        if skipped_shape:
            print(f"    (bo qua -- lech shape, khoi tao moi): {skipped_shape}")
        if missing:
            print(f"    (khoi tao moi -- khong co trong checkpoint): {missing}")
        if unexpected:
            print(f"    (bo qua -- co trong checkpoint nhung model khong dung): {unexpected}")

    if cfg.use_station_attention and getattr(dataset, "station_prior_weights", None):
        model.station_attn.init_prior(dataset.station_prior_weights)
        print(f"  station_attn.init_prior({[round(w, 3) for w in dataset.station_prior_weights]})")

    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)

    def lr_lambda(epoch):
        if epoch < cfg.warmup_epochs:
            return float(epoch + 1) / cfg.warmup_epochs
        progress = (epoch - cfg.warmup_epochs) / max(cfg.epochs - cfg.warmup_epochs, 1)
        return max(0.05, 0.5 * (1 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    use_amp = device.type == "cuda"
    amp_scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    print(f"AMP: {'ON' if use_amp else 'OFF'}")

    best_val = float("inf")
    patience_cnt = 0
    history = []
    ckpt_path = os.path.join(cfg.artifacts_dir, "reservoir_lstm.pt")

    for epoch in range(cfg.epochs):
        tf_ratio = cfg.teacher_forcing_ratio(epoch)

        model.train()
        train_loss = 0.0
        for x_hind, x_nwp, y_b, station_rain, station_mask in tqdm(
            train_loader, desc=f"[{reservoir_key}] Epoch {epoch+1}/{cfg.epochs}", leave=False
        ):
            x_hind = x_hind.to(device)
            x_nwp  = x_nwp.to(device)
            y_b    = y_b.to(device)
            station_rain = station_rain.to(device)
            station_mask = station_mask.to(device)

            if cfg.target_noise_std > 0:
                y_noisy = y_b + torch.randn_like(y_b) * cfg.target_noise_std
            else:
                y_noisy = y_b

            optimizer.zero_grad()
            with torch.amp.autocast("cuda", enabled=use_amp):
                preds = model(
                    x_hind, x_nwp, teacher_forcing_ratio=tf_ratio, y_true_sqrt=y_noisy,
                    station_rain=station_rain, station_mask=station_mask,
                )
                loss = quantile_loss_v2(preds, y_noisy, cfg.quantiles,
                                         horizon_decay=cfg.horizon_decay,
                                         coverage_weight=cfg.coverage_weight,
                                         peak_weight=cfg.peak_weight)

            amp_scaler.scale(loss).backward()
            amp_scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
            amp_scaler.step(optimizer)
            amp_scaler.update()
            train_loss += loss.item()

        train_loss /= len(train_loader)

        # ── Validation ─────────────────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        all_preds, all_targets = [], []
        with torch.no_grad():
            for x_hind, x_nwp, y_b, station_rain, station_mask in val_loader:
                x_hind = x_hind.to(device)
                x_nwp  = x_nwp.to(device)
                y_b    = y_b.to(device)
                station_rain = station_rain.to(device)
                station_mask = station_mask.to(device)

                with torch.amp.autocast("cuda", enabled=use_amp):
                    preds = model(
                        x_hind, x_nwp, teacher_forcing_ratio=0.0,
                        station_rain=station_rain, station_mask=station_mask,
                    )
                    val_loss += quantile_loss_v2(preds, y_b, cfg.quantiles,
                                                  horizon_decay=cfg.horizon_decay,
                                                  coverage_weight=cfg.coverage_weight,
                                                  peak_weight=cfg.peak_weight).item()

                all_preds.append(preds.cpu())
                all_targets.append(y_b.cpu())

        val_loss /= len(val_loader)
        preds_cat   = torch.cat(all_preds)
        targets_cat = torch.cat(all_targets)
        m = compute_metrics(preds_cat, targets_cat, cfg.median_idx)
        scheduler.step()
        lr_now = optimizer.param_groups[0]["lr"]

        print(
            f"[{reservoir_key}] Epoch {epoch+1:3d} | LR {lr_now:.2e} | TF {tf_ratio:.2f} | "
            f"Train {train_loss:.4f} | Val {val_loss:.4f} | "
            f"NSE {m['nse']:.3f} | MAE {m['mae']:.1f} | RMSE {m['rmse']:.1f} m3/s"
        )

        history.append({"epoch": epoch + 1, "lr": lr_now, "train_loss": train_loss,
                         "val_loss": val_loss, **m})

        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), ckpt_path)
            torch.save(cfg, os.path.join(cfg.artifacts_dir, "config.pt"))
            patience_cnt = 0
            print("  Best model saved")
        else:
            patience_cnt += 1

        if patience_cnt >= cfg.patience:
            print("Early stopping.")
            break

    # ── Test Evaluation ─────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"ĐÁNH GIÁ TẬP TEST (HOLDOUT) — {info['name']}")
    print("=" * 70)

    model.load_state_dict(torch.load(ckpt_path, map_location=device))
    model.eval()

    all_preds, all_targets = [], []
    with torch.no_grad():
        for x_hind, x_nwp, y_b, station_rain, station_mask in test_loader:
            preds = model(
                x_hind.to(device), x_nwp.to(device), teacher_forcing_ratio=0.0,
                station_rain=station_rain.to(device), station_mask=station_mask.to(device),
            )
            all_preds.append(preds.cpu())
            all_targets.append(y_b)

    preds_cat   = torch.cat(all_preds)
    targets_cat = torch.cat(all_targets)
    m = compute_metrics(preds_cat, targets_cat, cfg.median_idx)

    # NSE theo lead-time + chẩn đoán từng trận lũ
    preds_np   = (preds_cat[:, :, cfg.median_idx] ** 2).numpy()
    targets_np = (targets_cat ** 2).numpy()
    np.save(os.path.join(cfg.artifacts_dir, "test_preds.npy"), preds_np)
    np.save(os.path.join(cfg.artifacts_dir, "test_targets.npy"), targets_np)
    m["kge"] = round(kge_single(targets_np.reshape(-1), preds_np.reshape(-1)), 4)

    pred_low_np  = (preds_cat[:, :, 0]  ** 2).numpy()   # P5
    pred_high_np = (preds_cat[:, :, -1] ** 2).numpy()   # P95
    picp_result = picp(targets_np.reshape(-1), pred_low_np.reshape(-1), pred_high_np.reshape(-1))
    m["picp_p5_p95"] = picp_result["picp"]
    m["mean_interval_width"] = picp_result["mean_interval_width"]

    # Phân rã theo mùa khô (T1-8) / mùa mưa (T9-12) trên tập test (LUÔN đủ 12
    # tháng bất kể season train là gì -- xem evaluate_model_on_reservoir() bên
    # pretrain_pooled.py, cùng logic, để 2 hàm cho ra field JSON giống nhau).
    test_ts = ts[test_idx]
    test_months = test_ts.astype("datetime64[M]").astype(int) % 12 + 1
    dry_mask = np.isin(test_months, [1, 2, 3, 4, 5, 6, 7, 8])
    rainy_mask = np.isin(test_months, [9, 10, 11, 12])

    if dry_mask.any():
        p_dry, t_dry = preds_np[dry_mask].reshape(-1), targets_np[dry_mask].reshape(-1)
        m["nse_dry_season"] = round(nse_np(t_dry, p_dry), 4)
        m["rmse_dry_season"] = round(float(np.sqrt(np.mean((p_dry - t_dry) ** 2))), 2)
        m["kge_dry_season"] = round(kge_single(t_dry, p_dry), 4)

    if rainy_mask.any():
        p_rainy, t_rainy = preds_np[rainy_mask].reshape(-1), targets_np[rainy_mask].reshape(-1)
        m["nse_rainy_season"] = round(nse_np(t_rainy, p_rainy), 4)
        m["rmse_rainy_season"] = round(float(np.sqrt(np.mean((p_rainy - t_rainy) ** 2))), 2)
        m["kge_rainy_season"] = round(kge_single(t_rainy, p_rainy), 4)

    m["season_trained"] = season

    print(f"NSE={m['nse']:.4f}  KGE={m['kge']:.4f}  MAE={m['mae']:.2f} m3/s  RMSE={m['rmse']:.2f} m3/s")
    print(f"PICP(P5-P95)={m['picp_p5_p95']:.4f} (ly tuong ~0.90)  "
          f"Do rong dai trung binh={m['mean_interval_width']:.1f} m3/s")

    horizon_metrics = metrics_at_specific_horizons(preds_np, targets_np, horizons=[3, 6, 12, 24])
    m["horizons"] = horizon_metrics

    horizon_rows = nse_per_horizon(preds_np, targets_np, group_hours=6)
    for h in horizon_rows:
        print(f"  lead {h['hour_range']:>8}  NSE={h['nse']}")
    for h_str, h_vals in horizon_metrics.items():
        print(f"  [Mốc {h_str:>3}] NSE={h_vals['nse']:.4f}  RMSE={h_vals['rmse']:.1f} m3/s  RSE={h_vals['rse']:.4f}")


    obs_series, pred_series = extract_lead_time_series(preds_np, targets_np, lead_idx=cfg.forecast_len - 1)
    event_diag = {"n_events": 0}
    if len(obs_series) > 10 and obs_series.max() > 0:
        thr = float(np.percentile(obs_series, 90))
        event_diag = flood_event_diagnostics(obs_series, pred_series, threshold=thr)
        print(f"  [lead={cfg.forecast_len}h] n_events={event_diag['n_events']}  "
              f"NSE_event={event_diag.get('mean_event_nse')}  "
              f"peak_RE={event_diag.get('peak_re_mean')}  QA={event_diag.get('qa_pass_rate')}")

    # ── Save kết quả ───────────────────────────────────────────────────────────
    pd.DataFrame(history).to_excel(os.path.join(cfg.artifacts_dir, "lich_su_training.xlsx"), index=False)
    pd.DataFrame(horizon_rows).to_excel(os.path.join(cfg.artifacts_dir, "nse_theo_gio.xlsx"), index=False)

    with open(os.path.join(cfg.artifacts_dir, "metrics_test.json"), "w", encoding="utf-8") as f:
        json.dump({"reservoir": info["name"], "rid": rid, **m,
                    "event_diagnostics": event_diag}, f, ensure_ascii=False, indent=2)

    print(f"\nSaved: {cfg.artifacts_dir}/reservoir_lstm.pt | lich_su_training.xlsx | "
          f"nse_theo_gio.xlsx | metrics_test.json")
    return m
