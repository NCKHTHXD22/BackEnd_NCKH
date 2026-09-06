# training/pretrain_pooled.py
"""
Pretrain 1 model "nền" trên dữ liệu GỘP cả 16 hồ (không phân biệt hồ nào),
dùng làm điểm khởi tạo (warm-start) cho fine-tune riêng từng hồ sau đó
(training/train_reservoir.py::train_reservoir(..., init_checkpoint=...)).

Vì sao cần bước này: mỗi hồ train riêng chỉ có ~35,000 giờ dữ liệu — rất ít so
với 1.1M tham số của ReservoirLSTM (NSE thực tế train-riêng thấp hơn nhiều so
với model chung 556K mẫu của lstm_service). Pretrain trên dữ liệu gộp (quy mô
giống model chung) để học pattern mưa->dòng chảy tổng quát trước, sau đó
fine-tune ngắn (LR thấp, ít epoch) riêng từng hồ để đặc hiệu hóa — vẫn giữ lợi
ích "không lẫn dữ liệu xấu giữa các hồ" ở bước fine-tune, không mất lợi ích
"nhiều dữ liệu" ở bước pretrain.

Gộp bằng torch.utils.data.ConcatDataset ("gộp ảo", KHÔNG ghi bản sao dữ liệu ra
đĩa) — mỗi ReservoirDataset con vẫn đọc trực tiếp (mmap) từ thư mục nguồn của
chính nó. Chỉ concatenate 2 mảng NHỎ trong RAM (timestamps, y — vài chục MB
cho cả 16 hồ) để tính train/val split + oversampling; X_hindcast/X_nwp (phần
nặng, ~24GB) không bao giờ bị copy/gộp. Quan trọng trên Kaggle vì
/kaggle/working thường bị giới hạn dung lượng (~20GB) — ghi hẳn bản gộp 25GB
ra đó sẽ tràn đĩa và làm kernel chết.

Chạy: python -m training.pretrain_pooled
Hoặc: from training.pretrain_pooled import pretrain_pooled; pretrain_pooled(data_dirs=[...])
"""
import os
import math
import numpy as np
import torch
from torch.utils.data import DataLoader, Subset, ConcatDataset

from config.reservoirs import RESERVOIRS
from config.settings import ReservoirLSTMConfig
from data.reservoir_dataset import ReservoirDataset
from models.flood_lstm_v2 import ReservoirLSTM
from models.quantile_loss_v2 import quantile_loss_v2
from training.train_reservoir import set_seed, compute_metrics, nse_np, SEED
from training.event_metrics import metrics_at_specific_horizons, kge_single, picp
from tqdm import tqdm










def _default_data_dirs(out_root: str = "datasets") -> list:
    dirs = []
    for info in RESERVOIRS.values():
        d = os.path.join(out_root, info["name"].replace(" ", "_"))
        if os.path.exists(os.path.join(d, "v2_X_hindcast.npy")):
            dirs.append(d)
    return dirs


def pretrain_pooled(
    data_dirs: list = None,
    cfg: ReservoirLSTMConfig = None,
    epochs: int = None,
    artifacts_dir: str = "artifacts/_POOLED_PRETRAIN",
    season: str = "all",
) -> str:
    """
    Train 1 ReservoirLSTM trên dữ liệu gộp ẢO của nhiều hồ (ConcatDataset).
    data_dirs: list thư mục datasets/<reservoir_key>/
    season: 'all' (cả năm), 'dry' (tháng 1-8), 'rainy' (tháng 9-12).
    Trả về path checkpoint tốt nhất.
    """
    set_seed(SEED)
    cfg = cfg or ReservoirLSTMConfig(rid=0, reservoir_name="POOLED_PRETRAIN")
    if epochs:
        cfg.epochs = epochs
    os.makedirs(artifacts_dir, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[PRETRAIN POOLED]  Device: {device} | Season: {season.upper()}")
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    data_dirs = data_dirs or _default_data_dirs()
    if not data_dirs:
        raise RuntimeError("Không có thư mục dữ liệu hồ nào để gộp (data_dirs rỗng).")

    per_reservoir = [ReservoirDataset(d, inflow_cap_sqrt=None, max_stations=cfg.max_stations)
                      for d in data_dirs]
    pooled = ConcatDataset(per_reservoir)
    print(f"Pooled từ {len(per_reservoir)} hồ -> {len(pooled):,} mẫu (ConcatDataset)")

    # ── Chỉ concatenate 2 mảng NHỎ (timestamps, y) trong RAM để tính split/oversample ──
    ts = np.concatenate([np.asarray(ds.timestamps) for ds in per_reservoir], axis=0)
    y_all = np.concatenate([np.asarray(ds.y) for ds in per_reservoir], axis=0)

    val_start = np.datetime64(cfg.val_start, "s")
    val_end   = np.datetime64(cfg.val_end, "s")

    all_idx = np.arange(len(ts))
    months = ts.astype("datetime64[M]").astype(int) % 12 + 1

    # Lọc theo mùa nếu được yêu cầu
    if season == "dry":
        season_mask = np.isin(months, [1, 2, 3, 4, 5, 6, 7, 8])
    elif season == "rainy":
        season_mask = np.isin(months, [9, 10, 11, 12])
    else:
        season_mask = np.ones(len(months), dtype=bool)

    train_idx = all_idx[(ts < val_start) & season_mask].tolist()
    val_idx   = all_idx[(ts >= val_start) & (ts < val_end) & season_mask].tolist()
    print(f"Pooled Train ({season}): {len(train_idx):,} | Val: {len(val_idx):,}")

    if len(train_idx) == 0:
        raise RuntimeError(f"Tập train trống khi lọc theo season={season}")

    train_y_max = y_all[train_idx].max(axis=1)
    thr95 = float(np.percentile(train_y_max, 95))
    thr99 = float(np.percentile(train_y_max, 99))
    idx95 = [train_idx[i] for i in np.where(train_y_max >= thr95)[0]]
    idx99 = [train_idx[i] for i in np.where(train_y_max >= thr99)[0]]

    # Oversampling theo mùa mưa nếu train cả năm
    if season == "all":
        train_months = months[train_idx]
        idx_rainy = [train_idx[i] for i in np.where(np.isin(train_months, [9, 10, 11, 12]))[0]]
        oversampled = (
            train_idx + idx95 * cfg.oversample_p95_factor + idx99 * cfg.oversample_p99_factor
            + idx_rainy * cfg.oversample_rainy_season_factor
        )
    else:
        oversampled = train_idx + idx95 * cfg.oversample_p95_factor + idx99 * cfg.oversample_p99_factor

    print(f"Oversampling: top5%={len(idx95):,} | top1%={len(idx99):,} | total={len(oversampled):,}")

    n_w = 2 if device.type == "cuda" else 0
    _kw = dict(num_workers=n_w, pin_memory=(device.type == "cuda"), persistent_workers=(n_w > 0))
    train_loader = DataLoader(Subset(pooled, oversampled), batch_size=cfg.batch_size, shuffle=True, **_kw)
    val_loader   = DataLoader(Subset(pooled, val_idx),    batch_size=cfg.batch_size, shuffle=False, **_kw)

    model = ReservoirLSTM(cfg).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"ReservoirLSTM parameters: {n_params:,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)

    def lr_lambda(epoch):
        if epoch < cfg.warmup_epochs:
            return float(epoch + 1) / cfg.warmup_epochs
        progress = (epoch - cfg.warmup_epochs) / max(cfg.epochs - cfg.warmup_epochs, 1)
        return max(0.05, 0.5 * (1 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    use_amp = device.type == "cuda"
    amp_scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    best_val = float("inf")
    patience_cnt = 0
    ckpt_name = f"pretrain_pooled_{season}.pt" if season != "all" else "pretrain_pooled.pt"
    ckpt_path = os.path.join(artifacts_dir, ckpt_name)

    for epoch in range(cfg.epochs):
        tf_ratio = cfg.teacher_forcing_ratio(epoch)

        model.train()
        train_loss = 0.0
        for x_hind, x_nwp, y_b, station_rain, station_mask in tqdm(
            train_loader, desc=f"[POOLED-{season.upper()}] Epoch {epoch+1}/{cfg.epochs}", leave=False
        ):
            x_hind, x_nwp, y_b = x_hind.to(device), x_nwp.to(device), y_b.to(device)
            station_rain, station_mask = station_rain.to(device), station_mask.to(device)
            y_noisy = y_b + torch.randn_like(y_b) * cfg.target_noise_std if cfg.target_noise_std > 0 else y_b

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

        model.eval()
        val_loss = 0.0
        all_preds, all_targets = [], []
        with torch.no_grad():
            for x_hind, x_nwp, y_b, station_rain, station_mask in val_loader:
                x_hind, x_nwp, y_b = x_hind.to(device), x_nwp.to(device), y_b.to(device)
                station_rain, station_mask = station_rain.to(device), station_mask.to(device)
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

        if len(val_loader) > 0:
            val_loss /= len(val_loader)
            preds_cat, targets_cat = torch.cat(all_preds), torch.cat(all_targets)
            m = compute_metrics(preds_cat, targets_cat, cfg.median_idx)
        else:
            # Val rỗng sau khi lọc mùa (cửa sổ val không có tháng nào thuộc mùa
            # đang lọc) -- dùng train_loss thay thế để early-stopping/scheduler
            # không crash chia-cho-0. Chỉ ảnh hưởng tiêu chí dừng sớm, KHÔNG
            # ảnh hưởng NSE/MAE báo cáo cuối cùng (luôn tính trên test_idx).
            val_loss = train_loss
            m = {"mae": float("nan"), "rmse": float("nan"), "nse": float("nan"), "r2": float("nan")}
        scheduler.step()
        lr_now = optimizer.param_groups[0]["lr"]

        print(
            f"[POOLED-{season.upper()}] Epoch {epoch+1:3d} | LR {lr_now:.2e} | TF {tf_ratio:.2f} | "
            f"Train {train_loss:.4f} | Val {val_loss:.4f} | "
            f"NSE {m['nse']:.3f} | MAE {m['mae']:.1f} | RMSE {m['rmse']:.1f} m3/s"
        )

        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), ckpt_path)
            patience_cnt = 0
            print("  Best model saved")
        else:
            patience_cnt += 1

        if patience_cnt >= cfg.patience:
            print("Early stopping (pooled pretrain).")
            break

    print(f"\nPretrain ({season}) xong -> {ckpt_path}")
    return ckpt_path


def evaluate_model_on_reservoir(
    ckpt_path: str,
    data_dir: str,
    cfg: ReservoirLSTMConfig = None,
    save_preds_path: str = None,
) -> dict:
    """Đánh giá 1 model checkpoint bất kỳ trên tập test của 1 hồ, kèm phân rã theo mùa khô (T1-8) và mùa mưa (T9-12)."""
    set_seed(SEED)
    cfg = cfg or ReservoirLSTMConfig()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    dataset = ReservoirDataset(data_dir, max_stations=cfg.max_stations)
    if dataset.timestamps is None:
        raise FileNotFoundError(f"{data_dir}/v2_timestamps.npy không tìm thấy.")

    ts = dataset.timestamps
    test_start = np.datetime64(cfg.test_start, "s")
    all_idx = np.arange(len(ts))
    test_idx = all_idx[ts >= test_start].tolist()

    n_w = 2 if device.type == "cuda" else 0
    test_loader = DataLoader(Subset(dataset, test_idx), batch_size=cfg.batch_size, shuffle=False, num_workers=n_w)

    model = ReservoirLSTM(cfg).to(device)
    state = torch.load(ckpt_path, map_location=device)
    own_state = model.state_dict()
    compatible = {k: v for k, v in state.items() if k in own_state and own_state[k].shape == v.shape}
    model.load_state_dict(compatible, strict=False)
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

    preds_cat = torch.cat(all_preds)
    targets_cat = torch.cat(all_targets)
    metrics = compute_metrics(preds_cat, targets_cat, cfg.median_idx)

    preds_np = (preds_cat[:, :, cfg.median_idx] ** 2).numpy()
    targets_np = (targets_cat ** 2).numpy()
    metrics["horizons"] = metrics_at_specific_horizons(preds_np, targets_np, horizons=[3, 6, 12, 24])
    metrics["kge"] = round(kge_single(targets_np.reshape(-1), preds_np.reshape(-1)), 4)

    # Đánh giá phân rã theo mùa trên tập test
    test_ts = ts[test_idx]
    test_months = test_ts.astype("datetime64[M]").astype(int) % 12 + 1

    dry_mask = np.isin(test_months, [1, 2, 3, 4, 5, 6, 7, 8])
    rainy_mask = np.isin(test_months, [9, 10, 11, 12])

    if dry_mask.any():
        p_dry, t_dry = preds_np[dry_mask].reshape(-1), targets_np[dry_mask].reshape(-1)
        metrics["nse_dry_season"] = round(nse_np(t_dry, p_dry), 4)
        metrics["rmse_dry_season"] = round(float(np.sqrt(np.mean((p_dry - t_dry) ** 2))), 2)
        metrics["kge_dry_season"] = round(kge_single(t_dry, p_dry), 4)

    if rainy_mask.any():
        p_rainy, t_rainy = preds_np[rainy_mask].reshape(-1), targets_np[rainy_mask].reshape(-1)
        metrics["nse_rainy_season"] = round(nse_np(t_rainy, p_rainy), 4)
        metrics["rmse_rainy_season"] = round(float(np.sqrt(np.mean((p_rainy - t_rainy) ** 2))), 2)
        metrics["kge_rainy_season"] = round(kge_single(t_rainy, p_rainy), 4)

    pred_low_np  = (preds_cat[:, :, 0]  ** 2).numpy()   # P5
    pred_high_np = (preds_cat[:, :, -1] ** 2).numpy()   # P95
    picp_result = picp(targets_np.reshape(-1), pred_low_np.reshape(-1), pred_high_np.reshape(-1))
    metrics["picp_p5_p95"] = picp_result["picp"]
    metrics["mean_interval_width"] = picp_result["mean_interval_width"]

    if save_preds_path:
        os.makedirs(save_preds_path, exist_ok=True)
        np.save(os.path.join(save_preds_path, "basin_preds.npy"), preds_np)
        np.save(os.path.join(save_preds_path, "basin_targets.npy"), targets_np)
    return metrics


def train_river_branch_model(
    branch_name: str,
    rids: list = None,
    epochs: int = None,
    data_dirs_map: dict = None,
    artifacts_dir: str = None,
    season: str = "all",
) -> str:
    """
    Train 1 model cho 1 nhánh sông hoặc lưu vực.
    branch_name: 'A_VUONG', 'SONG_BUNG', 'DAK_MI', 'SONG_TRANH', 'VU_GIA', 'THU_BON',
                 hoặc biến thể Sông Côn: 'A_VUONG_WITH_SONG_CON', 'SONG_BUNG_WITH_SONG_CON'.
    season: 'all', 'dry' (tháng 1-8), 'rainy' (tháng 9-12).
    """
    from config.reservoirs import (
        RESERVOIRS, RIVER_BRANCHES, SONG_CON_2_VARIANTS,
        RIVER_BASINS_EXPERIMENT, RIVER_BASINS_NATURAL
    )

    if rids is None:
        b_key = branch_name.upper()
        if b_key in RIVER_BRANCHES:
            rids = RIVER_BRANCHES[b_key]
        elif b_key == "A_VUONG_WITH_SONG_CON":
            rids = SONG_CON_2_VARIANTS["A_VUONG"]
        elif b_key == "SONG_BUNG_WITH_SONG_CON":
            rids = SONG_CON_2_VARIANTS["SONG_BUNG"]
        elif b_key in ["VU_GIA", "VU_GIA_EXP", "VU GIA"]:
            rids = RIVER_BASINS_EXPERIMENT["Vu Gia"]
        elif b_key in ["THU_BON", "THU_BON_EXP", "THU BỒN", "THU BON"]:
            rids = RIVER_BASINS_EXPERIMENT["Thu Bồn"]
        elif b_key == "VU_GIA_NATURAL":
            rids = RIVER_BASINS_NATURAL["Vu Gia"]
        elif b_key == "THU_BON_NATURAL":
            rids = RIVER_BASINS_NATURAL["Thu Bồn"]
        else:
            raise ValueError(f"branch_name={branch_name} không hợp lệ.")

    if data_dirs_map is None:
        data_dirs_map = {}
        for rid in rids:
            info = RESERVOIRS[rid]
            key = info["name"].replace(" ", "_")
            data_dirs_map[rid] = os.path.join("datasets", key)

    dirs = [data_dirs_map[rid] for rid in rids if rid in data_dirs_map and os.path.exists(data_dirs_map[rid])]
    if not dirs:
        raise RuntimeError(f"Không tìm thấy thư mục dữ liệu cho nhánh {branch_name}")

    season_suffix = f"_{season.upper()}" if season != "all" else ""
    artifacts_dir = artifacts_dir or os.path.join("artifacts", f"_BRANCH_{branch_name.upper()}{season_suffix}")
    cfg = ReservoirLSTMConfig(rid=0, reservoir_name=f"BRANCH_{branch_name.upper()}{season_suffix}")

    print(f"\n" + "=" * 60)
    print(f"TRAIN MODEL NHÁNH SÔNG / LƯU VỰC: {branch_name.upper()} ({len(dirs)} hồ) | MÙA: {season.upper()}")
    print("=" * 60)

    return pretrain_pooled(data_dirs=dirs, cfg=cfg, epochs=epochs, artifacts_dir=artifacts_dir, season=season)

