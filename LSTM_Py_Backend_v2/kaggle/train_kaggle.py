"""
Training script thuần Python cho 1 hồ — dùng khi upload cả source code
LSTM_Py_Backend_v2/ lên Kaggle (thay vì dùng notebook tự-chứa của
generate_notebook.py). Phù hợp nếu bạn muốn chạy nhiều hồ liên tiếp bằng 1
script thay vì mở notebook từng lần.

Cách dùng trên Kaggle:
  1. Attach dataset chứa datasets/<reservoir_key>/v2_*.npy (từ main_build_dataset.py)
  2. Attach dataset/code chứa toàn bộ LSTM_Py_Backend_v2/ (Kaggle Notebook -> Add
     Utility Script, hoặc upload cả folder làm Dataset rồi symlink)
  3. Run: python kaggle/train_kaggle.py --rid 2

Để chạy LOCAL (có Data_Tung_Ho_Ma_Tran_Rong/ + GPU riêng):
  cd LSTM_Py_Backend_v2
  python kaggle/train_kaggle.py --rid 2
"""

import argparse
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, ROOT)

ON_KAGGLE = os.path.exists("/kaggle")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rid", type=int, required=True, help="reservoir id (config/reservoirs.py)")
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--data-dir", type=str, default=None,
                         help="mặc định: /kaggle/input/<...>/ nếu ON_KAGGLE, "
                              "ngược lại datasets/<reservoir_key>/")
    args = parser.parse_args()

    from config.reservoirs import RESERVOIRS
    from config.settings import ReservoirLSTMConfig
    from training.train_reservoir import train_reservoir

    if args.rid not in RESERVOIRS:
        raise SystemExit(f"rid={args.rid} không có trong config/reservoirs.py")
    reservoir_key = RESERVOIRS[args.rid]["name"].replace(" ", "_")

    data_dir = args.data_dir
    if data_dir is None:
        if ON_KAGGLE:
            # Auto-detect thư mục chứa v2_X_hindcast.npy dưới /kaggle/input
            target = "v2_X_hindcast.npy"
            for root, _dirs, files in os.walk("/kaggle/input"):
                if target in files:
                    data_dir = root
                    break
            if data_dir is None:
                raise FileNotFoundError(
                    f"Không tìm thấy {target} dưới /kaggle/input — "
                    f"attach dataset chứa datasets/{reservoir_key}/ trước."
                )
        else:
            data_dir = os.path.join(ROOT, "datasets", reservoir_key)

    cfg = ReservoirLSTMConfig(rid=args.rid)
    if args.epochs:
        cfg.epochs = args.epochs
    if ON_KAGGLE:
        cfg.artifacts_dir = "/kaggle/working"

    print(f"ON_KAGGLE={ON_KAGGLE}  data_dir={data_dir}  artifacts_dir={cfg.artifacts_dir}")
    train_reservoir(args.rid, cfg=cfg, data_dir=data_dir)


if __name__ == "__main__":
    main()
