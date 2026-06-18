"""
prepare_dataset.py
------------------
Chạy từ thư mục lstm_service/:
    python train_4_lake/prepare_dataset.py

Script này lọc 4 hồ mục tiêu từ dataset gốc (22 GB) và lưu ra
các file .npy riêng biệt theo từng hồ vào train_4_lake/data/.

Upload thư mục train_4_lake/data/ lên Kaggle Dataset với tên:
    flood-lstm-4reservoirs
"""

import os
import sys
import shutil
import numpy as np
from pathlib import Path

# Hồ mục tiêu: original rid → folder name
TARGET_RESERVOIRS = {
    0: "avuong",       # HO A VUONG
    1: "dakmi4",       # HO DAK MI 4
    2: "songbung4",    # HO SONG BUNG 4
    3: "songtranh2",   # HO SONG TRANH 2
}

# Đường dẫn: script ở train_4_lake/, source ở lstm_service/
SCRIPT_DIR = Path(__file__).parent          # .../train_4_lake/
SRC_DIR    = SCRIPT_DIR.parent              # .../lstm_service/
OUT_DIR    = SCRIPT_DIR / "data"


def main():
    print("=" * 60)
    print("PREPARE DATASET - 4 MAIN RESERVOIRS")
    print("=" * 60)

    # Kiểm tra các file nguồn
    required = ["dataset_X_past.npy", "dataset_y.npy",
                "dataset_rid.npy", "dataset_timestamps.npy"]
    for fname in required:
        path = SRC_DIR / fname
        if not path.exists():
            print(f"[ERROR] Không tìm thấy: {path}")
            sys.exit(1)

    has_future = (SRC_DIR / "dataset_X_future.npy").exists()
    print(f"dataset_X_future.npy: {'CÓ' if has_future else 'KHÔNG CÓ'}")

    # Load toàn bộ (mmap để tiết kiệm RAM)
    print("\nLoading dataset (mmap mode)...")
    X_past  = np.load(SRC_DIR / "dataset_X_past.npy",     mmap_mode="r")
    y       = np.load(SRC_DIR / "dataset_y.npy",          mmap_mode="r")
    rid     = np.load(SRC_DIR / "dataset_rid.npy",        mmap_mode="r")
    ts      = np.load(SRC_DIR / "dataset_timestamps.npy", mmap_mode="r")
    X_fut   = np.load(SRC_DIR / "dataset_X_future.npy",   mmap_mode="r") if has_future else None

    print(f"Total samples: {len(X_past):,}")
    print(f"Feature shape: {X_past.shape[1:]}  (seq_len x n_features)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for rid_val, name in TARGET_RESERVOIRS.items():
        print(f"\n[{name.upper()}] rid={rid_val}")
        mask = (rid == rid_val)
        n = int(mask.sum())
        print(f"  Samples: {n:,}")

        out = OUT_DIR / name
        out.mkdir(parents=True, exist_ok=True)

        print("  Saving X_past.npy ...", end=" ")
        np.save(out / "X_past.npy",     np.array(X_past[mask]))
        print("OK")

        print("  Saving y.npy ...", end=" ")
        np.save(out / "y.npy",          np.array(y[mask]))
        print("OK")

        print("  Saving timestamps.npy ...", end=" ")
        np.save(out / "timestamps.npy", np.array(ts[mask]))
        print("OK")

        if X_fut is not None:
            print("  Saving X_future.npy ...", end=" ")
            np.save(out / "X_future.npy", np.array(X_fut[mask]))
            print("OK")
        else:
            print("  X_future.npy: SKIP (không có file nguồn)")

        print(f"  -> Saved to {out}")

    # Copy global scaler
    scaler_src = SRC_DIR / "artifacts" / "global_scaler.pkl"
    if scaler_src.exists():
        shutil.copy2(scaler_src, OUT_DIR / "global_scaler.pkl")
        print(f"\nCopied global_scaler.pkl -> {OUT_DIR / 'global_scaler.pkl'}")
    else:
        print(f"\n[WARN] global_scaler.pkl không tìm thấy tại {scaler_src}")

    print("\n" + "=" * 60)
    print("DONE! Upload thư mục train_4_lake/data/ lên Kaggle:")
    print("  Dataset name: flood-lstm-4reservoirs")
    print("  Structure sau khi upload:")
    for name in TARGET_RESERVOIRS.values():
        print(f"    /kaggle/input/flood-lstm-4reservoirs/{name}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
