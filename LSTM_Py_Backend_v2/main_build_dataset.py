# main_build_dataset.py
"""
Entry point: build dataset cho 1 hồ hoặc toàn bộ 16 hồ.

Cách dùng:
    python main_build_dataset.py --rid 2                  # 1 hồ (Dak Mi 4)
    python main_build_dataset.py --all                    # toàn bộ 16 hồ
    python main_build_dataset.py --rid 2 --no-nwp          # bỏ qua Open-Meteo (test nhanh, offline)

Yêu cầu: chạy trong thư mục có Data_Tung_Ho_Ma_Tran_Rong/ (giống lstm_service) —
xem lstm_service/data/rain_matrix_loader.py::_resolve_base_dir() cho các
đường dẫn được thử.
"""

import argparse
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from config.reservoirs import RESERVOIRS
from data.dataset_builder import build_reservoir_dataset, build_all_reservoirs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rid", type=int, default=None, help="reservoir id (config/reservoirs.py)")
    parser.add_argument("--all", action="store_true", help="build toàn bộ 16 hồ")
    parser.add_argument("--start", type=str, default="2022-01-01")
    parser.add_argument("--end",   type=str, default="2025-12-31")
    parser.add_argument("--no-nwp", action="store_true", help="bỏ qua Open-Meteo (offline test)")
    parser.add_argument("--legacy-v1", action="store_true",
                         help="khôi phục rain/inflow/water_level/outflow từ "
                              "LSTM_Py_Backend/lstm_service/dataset_*.npy thay vì đọc Excel "
                              "Data_Tung_Ho_Ma_Tran_Rong/ (dùng khi Excel gốc không còn)")
    args = parser.parse_args()

    if not args.all and args.rid is None:
        parser.error("Cần --rid <id> hoặc --all")

    if args.all:
        build_all_reservoirs(args.start, args.end, fetch_nwp=not args.no_nwp,
                              use_legacy_v1=args.legacy_v1)
    else:
        if args.rid not in RESERVOIRS:
            raise SystemExit(f"rid={args.rid} không có trong config/reservoirs.py. "
                              f"Các rid hợp lệ: {sorted(RESERVOIRS.keys())}")
        raw_df = None
        if args.legacy_v1:
            from data.legacy_v1_recover import recover_raw_dataframe
            raw_df = recover_raw_dataframe(RESERVOIRS[args.rid]["idx"])
        build_reservoir_dataset(args.rid, args.start, args.end, fetch_nwp=not args.no_nwp,
                                 raw_df=raw_df)


if __name__ == "__main__":
    main()
