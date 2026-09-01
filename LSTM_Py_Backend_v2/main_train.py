# main_train.py
"""
Entry point: train 1 hồ, train theo nhánh sông, train theo lưu vực sông,
hoặc train theo mùa (khô / mưa / cả năm).

Cách dùng:
    python main_train.py --rid 2                                # train Đắk Mi 4
    python main_train.py --branch A_VUONG                       # train nhánh A Vương
    python main_train.py --branch SONG_BUNG --season rainy      # train nhánh Sông Bung mùa mưa (T9-12)
    python main_train.py --basin "Vu Gia"                       # train lưu vực Vu Gia
    python main_train.py --all-branches                         # train toàn bộ 4 nhánh sông
    python main_train.py --all-basins                           # train cả 2 nhóm lưu vực
"""

import argparse
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from config.settings import ReservoirLSTMConfig
from config.reservoirs import (
    RESERVOIRS, RIVER_BRANCHES, RIVER_BASINS_EXPERIMENT,
    SONG_CON_2_VARIANTS, SEASON_MONTHS
)
from training.train_reservoir import train_reservoir
from training.pretrain_pooled import train_river_branch_model, pretrain_pooled


def main():
    parser = argparse.ArgumentParser(description="Huấn luyện mô hình LSTM theo Hồ / Nhánh / Lưu vực / Mùa")
    parser.add_argument("--rid", type=int, default=None, help="Reservoir ID (vd: 1, 2, 3...)")
    parser.add_argument("--branch", type=str, default=None,
                        help="Tên nhánh: A_VUONG, SONG_BUNG, DAK_MI, SONG_TRANH, A_VUONG_WITH_SONG_CON, SONG_BUNG_WITH_SONG_CON")
    parser.add_argument("--basin", type=str, default=None,
                        help="Tên lưu vực: 'Vu Gia' hoặc 'Thu Bồn'")
    parser.add_argument("--season", type=str, default="all", choices=["all", "dry", "rainy"],
                        help="Mùa huấn luyện: all (cả năm), dry (tháng 1-8), rainy (tháng 9-12)")
    parser.add_argument("--all-branches", action="store_true",
                        help="Train toàn bộ 4 nhánh sông + 2 biến thể Sông Côn 2")
    parser.add_argument("--all-basins", action="store_true",
                        help="Train cả 2 lưu vực lớn")
    parser.add_argument("--all", action="store_true", help="Train lần lượt toàn bộ 16 hồ riêng lẻ")
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--data-dir", type=str, default=None,
                         help="Mặc định: datasets/<reservoir_key>/")
    parser.add_argument("--init-checkpoint", type=str, default=None,
                         help="Checkpoint để fine-tune (Transfer Learning)")
    parser.add_argument("--lr", type=float, default=None,
                         help="Learning rate override")
    args = parser.parse_args()

    if args.all_branches:
        print("\n==================================================")
        print(f"BẮT ĐẦU HUẤN LUYỆN TOÀN BỘ CÁC NHÁNH SÔNG (MÙA: {args.season.upper()})")
        print("==================================================")
        for b_name in list(RIVER_BRANCHES.keys()) + ["A_VUONG_WITH_SONG_CON", "SONG_BUNG_WITH_SONG_CON"]:
            train_river_branch_model(b_name, epochs=args.epochs, season=args.season)

    elif args.all_basins:
        print("\n==================================================")
        print(f"BẮT ĐẦU HUẤN LUYỆN CÁC LƯU VỰC SÔNG (MÙA: {args.season.upper()})")
        print("==================================================")
        for basin_name in RIVER_BASINS_EXPERIMENT.keys():
            train_river_branch_model(basin_name, epochs=args.epochs, season=args.season)

    elif args.branch:
        train_river_branch_model(args.branch, epochs=args.epochs, season=args.season)

    elif args.basin:
        train_river_branch_model(args.basin, epochs=args.epochs, season=args.season)

    elif args.all:
        for rid, info in RESERVOIRS.items():
            print(f"\n======== TRAIN [{rid}] {info['name']} ========")
            cfg = ReservoirLSTMConfig(rid=rid)
            if args.epochs:
                cfg.epochs = args.epochs
            if args.lr:
                cfg.lr = args.lr
            train_reservoir(rid, cfg=cfg, data_dir=args.data_dir, init_checkpoint=args.init_checkpoint)

    elif args.rid is not None:
        cfg = ReservoirLSTMConfig(rid=args.rid)
        if args.epochs:
            cfg.epochs = args.epochs
        if args.lr:
            cfg.lr = args.lr
        train_reservoir(args.rid, cfg=cfg, data_dir=args.data_dir, init_checkpoint=args.init_checkpoint)

    else:
        parser.error("Vui lòng truyền tham số: --rid, --branch, --basin, --all-branches, --all-basins, hoặc --all")


if __name__ == "__main__":
    main()

