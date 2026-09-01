# prepare_kaggle_datasets.py
"""
Script tự động phân loại thư mục dữ liệu theo từng hồ và theo nhánh sông:
- datasets_vu_gia/ : Chứa 11 hồ thuộc lưu vực sông Vu Gia
- datasets_thu_bon/ : Chứa 5 hồ thuộc lưu vực sông Thu Bồn
"""

import os
import sys
import shutil

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from config.reservoirs import RESERVOIRS, RIVER_BASINS


ROOT = os.path.dirname(os.path.abspath(__file__))
DATASETS_DIR = os.path.join(ROOT, "datasets")

def organize_datasets():
    print("=" * 60)
    print("TỰ ĐỘNG PHÂN LOẠI DỮ LIỆU THEO NHÁNH SÔNG VU GIA & THU BỒN")
    print("=" * 60)

    for basin_name, rids in RIVER_BASINS.items():
        clean_name = "vu_gia" if "vu" in basin_name.lower() else "thu_bon"
        basin_dir_name = f"datasets_{clean_name}"
        target_dir = os.path.join(ROOT, basin_dir_name)
        os.makedirs(target_dir, exist_ok=True)

        print(f"\n📂 Tạo thư mục lưu vực: {basin_dir_name}/ ({len(rids)} hồ)")

        for rid in rids:
            res_info = RESERVOIRS[rid]
            res_key = res_info["name"].replace(" ", "_")
            src_path = os.path.join(DATASETS_DIR, res_key)
            dst_path = os.path.join(target_dir, res_key)

            if os.path.exists(src_path):
                if not os.path.exists(dst_path):
                    # Trên Windows tạo Junction / Symlink hoặc Directory Link nếu hỗ trợ, fallback tạo folder
                    try:
                        os.symlink(src_path, dst_path, target_is_directory=True)
                        print(f"  ✓ Linked {res_key} -> {basin_dir_name}/{res_key}")
                    except Exception:
                        # Nếu không đủ quyền tạo symlink trên Windows, dùng cmd mklink /J
                        cmd = f'mklink /J "{dst_path}" "{src_path}"'
                        res = os.system(cmd)
                        if res == 0:
                            print(f"  ✓ Junction {res_key} -> {basin_dir_name}/{res_key}")
                        else:
                            print(f"  ⚠ Không tạo được link cho {res_key}, tạo thư mục trống.")
                else:
                    print(f"  ✓ Đã tồn tại: {basin_dir_name}/{res_key}")
            else:
                print(f"  ❌ Không tìm thấy thư mục nguồn: datasets/{res_key}")

    print("\n" + "=" * 60)
    print("HOÀN TẤT PHÂN LOẠI THƯ MỤC DỮ LIỆU.")
    print("=" * 60)

if __name__ == "__main__":
    organize_datasets()
