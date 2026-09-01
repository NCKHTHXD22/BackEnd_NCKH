# training/train_xgb.py
"""
Huan luyen mo hinh XGBoost theo cac cap do:
  1. Global (16 ho)
  2. Theo Nhanh song (A Vuong, Song Bung, Dak Mi, Song Tranh, Song Con 2 variants)
  3. Theo Luu vuc song (Vu Gia, Thu Bon)
  4. Theo Tung ho rieng le
  5. Theo Mua (Mua kho: T1-8, Mua mua: T9-12, Ca nam: all)

Chay:
    python training/train_xgb.py --mode branch --branch A_VUONG
    python training/train_xgb.py --mode branch --branch SONG_BUNG --season rainy
    python training/train_xgb.py --mode basin --basin "Vu Gia"
    python training/train_xgb.py --mode all-branches
    python training/train_xgb.py --mode all-basins
    python training/train_xgb.py --mode single --rid 2
"""
import os
import sys
import time
import argparse
import numpy as np
import xgboost as xgb

if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from config.settings import QUANTILES, HORIZON, RAINY_SEASON_WEIGHT
from config.reservoirs import (
    RESERVOIRS, RIVER_BRANCHES, SONG_CON_2_VARIANTS,
    RIVER_BASINS_EXPERIMENT, SEASON_MONTHS
)
from data.tabular_dataset import build_tabular_dataset, split_60_20_20, RAINY_SEASON_MONTHS

ARTIFACT_DIR = "artifacts/xgb"


def flood_sample_weight(y_train: np.ndarray, ts_train: np.ndarray, season: str = "all") -> np.ndarray:
    """Trong so mau theo bien do dinh lu va theo mua."""
    peak = y_train.max(axis=1)
    w = np.ones(len(y_train), dtype=np.float32)
    thr_95 = np.percentile(peak, 95)
    thr_99 = np.percentile(peak, 99)
    w[peak >= thr_95] = 2.0
    w[peak >= thr_99] = 3.0

    if season == "all":
        months = ts_train.astype("datetime64[M]").astype(int) % 12 + 1
        is_rainy = np.isin(months, [9, 10, 11, 12])
        w[is_rainy] *= RAINY_SEASON_WEIGHT
    return w


def train_xgb_dataset(X: np.ndarray, y: np.ndarray, ts: np.ndarray,
                      artifact_dir: str, season: str = "all",
                      init_boosters: dict = None,
                      num_boost_round: int = 2000,
                      early_stopping_rounds: int = 50):
    """Huấn luyện 72 booster cho 1 tập dữ liệu cụ thể.

    init_boosters: dict {(h, q): xgb.Booster} đã train sẵn (vd model nhánh/lưu
    vực) -- nếu truyền vào, mỗi booster (h,q) sẽ CONTINUE boosting (xgb.train
    xgb_model=...) trên dữ liệu X/y/ts của hàm này thay vì train từ đầu. Đây là
    kịch bản 5 (transfer learning) áp dụng cho XGBoost: pretrain trên nhánh/lưu
    vực (init_boosters=None, num_boost_round lớn) rồi fine-tune riêng từng hồ
    (init_boosters=<72 booster nhánh>, num_boost_round nhỏ hơn -- ví dụ 300).
    """
    train_idx, val_idx, test_idx = split_60_20_20(ts)
    months = ts.astype("datetime64[M]").astype(int) % 12 + 1

    if season == "dry":
        season_mask = np.isin(months, [1, 2, 3, 4, 5, 6, 7, 8])
        train_idx = [i for i in train_idx if season_mask[i]]
        val_idx   = [i for i in val_idx if season_mask[i]]
    elif season == "rainy":
        season_mask = np.isin(months, [9, 10, 11, 12])
        train_idx = [i for i in train_idx if season_mask[i]]
        val_idx   = [i for i in val_idx if season_mask[i]]

    print(f"Dataset: Total={len(X):,} | Train={len(train_idx):,} | Val={len(val_idx):,} | Season={season.upper()}")
    if len(train_idx) == 0 or len(val_idx) == 0:
        print("  WARNING: Train/Val rong, bo qua.")
        return

    sample_weight = flood_sample_weight(y[train_idx], ts[train_idx], season=season)
    os.makedirs(artifact_dir, exist_ok=True)

    params_base = dict(
        tree_method="hist",
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_lambda=1.0,
    )

    t0 = time.time()
    n_trained = 0
    for h in range(HORIZON):
        dtrain = xgb.DMatrix(X[train_idx], label=y[train_idx, h], weight=sample_weight)
        dval = xgb.DMatrix(X[val_idx], label=y[val_idx, h])

        for q in QUANTILES:
            params = {**params_base, "objective": "reg:quantileerror", "quantile_alpha": q}
            xgb_model = init_boosters.get((h, q)) if init_boosters else None
            bst = xgb.train(
                params, dtrain,
                num_boost_round=num_boost_round,
                evals=[(dval, "val")],
                early_stopping_rounds=early_stopping_rounds,
                verbose_eval=False,
                xgb_model=xgb_model,
            )
            bst.save_model(f"{artifact_dir}/h{h + 1:02d}_q{int(q * 100):02d}.json")
            n_trained += 1

    elapsed = time.time() - t0
    print(f"  [OK] Da train {n_trained} boosters trong {elapsed:.1f}s -> {artifact_dir}/\n")


def filter_by_rids(X: np.ndarray, y: np.ndarray, rid_arr: np.ndarray, ts_arr: np.ndarray, target_rids: list):
    """Lọc dữ liệu theo danh sách reservoir IDs."""
    idx_map = {info["idx"]: rid for rid, info in RESERVOIRS.items()}
    actual_rids = np.array([idx_map.get(r, -1) for r in rid_arr])
    mask = np.isin(actual_rids, target_rids)
    return X[mask], y[mask], rid_arr[mask], ts_arr[mask]


def main():
    parser = argparse.ArgumentParser(description="Huấn luyện XGBoost theo Cấp độ và Mùa")
    parser.add_argument("--mode", type=str, default="global",
                        choices=["global", "branch", "basin", "single", "all-branches", "all-basins", "all-single"],
                        help="Che do train")
    parser.add_argument("--branch", type=str, default=None,
                        help="Tên nhánh: A_VUONG, SONG_BUNG, DAK_MI, SONG_TRANH, A_VUONG_WITH_SONG_CON, SONG_BUNG_WITH_SONG_CON")
    parser.add_argument("--basin", type=str, default=None,
                        help="Tên lưu vực: 'Vu Gia' hoặc 'Thu Bồn'")
    parser.add_argument("--rid", type=int, default=None, help="Reservoir ID (vd: 1, 2, 3...)")
    parser.add_argument("--season", type=str, default="all", choices=["all", "dry", "rainy"],
                        help="Mùa: all, dry (T1-8), rainy (T9-12)")
    args = parser.parse_args()

    print("=" * 70)
    print(f"HUẤN LUYỆN XGBOOST | MODE: {args.mode.upper()} | MÙA: {args.season.upper()}")
    print("=" * 70)

    X_all, y_all, rid_all, ts_all = build_tabular_dataset()
    season_suffix = f"_{args.season}" if args.season != "all" else ""

    if args.mode == "global":
        art_dir = f"artifacts/xgb{season_suffix}"
        train_xgb_dataset(X_all, y_all, ts_all, art_dir, season=args.season)

    elif args.mode == "branch" and args.branch:
        b_key = args.branch.upper()
        if b_key in RIVER_BRANCHES:
            rids = RIVER_BRANCHES[b_key]
        elif b_key == "A_VUONG_WITH_SONG_CON":
            rids = SONG_CON_2_VARIANTS["A_VUONG"]
        elif b_key == "SONG_BUNG_WITH_SONG_CON":
            rids = SONG_CON_2_VARIANTS["SONG_BUNG"]
        else:
            raise ValueError(f"branch={args.branch} không hợp lệ.")
        X_b, y_b, _, ts_b = filter_by_rids(X_all, y_all, rid_all, ts_all, rids)
        art_dir = f"artifacts/xgb_branch/{b_key}{season_suffix}"
        train_xgb_dataset(X_b, y_b, ts_b, art_dir, season=args.season)

    elif args.mode == "all-branches":
        branch_list = list(RIVER_BRANCHES.keys()) + ["A_VUONG_WITH_SONG_CON", "SONG_BUNG_WITH_SONG_CON"]
        for b_name in branch_list:
            if b_name in RIVER_BRANCHES:
                rids = RIVER_BRANCHES[b_name]
            elif b_name == "A_VUONG_WITH_SONG_CON":
                rids = SONG_CON_2_VARIANTS["A_VUONG"]
            else:
                rids = SONG_CON_2_VARIANTS["SONG_BUNG"]
            print(f"\n>>> TRAIN NHÁNH: {b_name} ({len(rids)} hồ)")
            X_b, y_b, _, ts_b = filter_by_rids(X_all, y_all, rid_all, ts_all, rids)
            art_dir = f"artifacts/xgb_branch/{b_name}{season_suffix}"
            train_xgb_dataset(X_b, y_b, ts_b, art_dir, season=args.season)

    elif args.mode == "basin" and args.basin:
        rids = RIVER_BASINS_EXPERIMENT.get(args.basin)
        if not rids:
            raise ValueError(f"basin={args.basin} không hợp lệ.")
        b_clean = args.basin.upper().replace(" ", "_")
        X_b, y_b, _, ts_b = filter_by_rids(X_all, y_all, rid_all, ts_all, rids)
        art_dir = f"artifacts/xgb_basin/{b_clean}{season_suffix}"
        train_xgb_dataset(X_b, y_b, ts_b, art_dir, season=args.season)

    elif args.mode == "all-basins":
        for basin_name, rids in RIVER_BASINS_EXPERIMENT.items():
            b_clean = basin_name.upper().replace(" ", "_")
            print(f"\n>>> TRAIN LƯU VỰC: {basin_name} ({len(rids)} hồ)")
            X_b, y_b, _, ts_b = filter_by_rids(X_all, y_all, rid_all, ts_all, rids)
            art_dir = f"artifacts/xgb_basin/{b_clean}{season_suffix}"
            train_xgb_dataset(X_b, y_b, ts_b, art_dir, season=args.season)

    elif args.mode == "single" and args.rid is not None:
        info = RESERVOIRS[args.rid]
        res_key = info["name"].replace(" ", "_")
        X_s, y_s, _, ts_s = filter_by_rids(X_all, y_all, rid_all, ts_all, [args.rid])
        art_dir = f"artifacts/xgb_single/{res_key}{season_suffix}"
        train_xgb_dataset(X_s, y_s, ts_s, art_dir, season=args.season)

    elif args.mode == "all-single":
        for rid, info in RESERVOIRS.items():
            res_key = info["name"].replace(" ", "_")
            print(f"\n>>> TRAIN TỪNG HỒ: {info['name']} (RID={rid})")
            X_s, y_s, _, ts_s = filter_by_rids(X_all, y_all, rid_all, ts_all, [rid])
            art_dir = f"artifacts/xgb_single/{res_key}{season_suffix}"
            train_xgb_dataset(X_s, y_s, ts_s, art_dir, season=args.season)


if __name__ == "__main__":
    main()

