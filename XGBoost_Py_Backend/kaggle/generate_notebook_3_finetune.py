# kaggle/generate_notebook_3_finetune.py
"""
Notebook Kaggle #3/4 (XGBoost) -- Fine-tune (continue-boosting, tương đương
Transfer Learning bên LSTM, Kịch bản 5): nạp 72 booster Nhánh/Lưu vực ĐÚNG MÙA
(notebook #2), boost thêm trên dữ liệu 1 hồ ĐÃ LỌC CÙNG MÙA (16 hồ x 2 nguồn x
3 mùa = tối đa 96 lượt, chỉ 300 round/lượt nên vẫn nhanh). Không cần GPU.

PHỤ THUỘC notebook #2 -- BẮT BUỘC Add Input output của notebook #2 TRƯỚC khi
Run All. Cell "bootstrap" tự copy booster vào /kaggle/working/ (không train
lại nhánh/lưu vực).

Chạy:
    cd XGBoost_Py_Backend
    python kaggle/generate_notebook_3_finetune.py
Kết quả: kaggle/train_xgb_3_finetune.ipynb
"""
import json
import os
import re
import sys
import textwrap

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


def read_source(rel_path: str) -> str:
    with open(os.path.join(ROOT, rel_path), "r", encoding="utf-8") as f:
        src = f.read()
    src = re.sub(r"^from \.\w+ import .*$", "", src, flags=re.MULTILINE)
    src = re.sub(r"^from (models|config|data|training)\.\w+ import \([^)]*\)\n?", "", src, flags=re.MULTILINE)
    src = re.sub(r"^from (models|config|data|training)\.\w+ import .*$", "", src, flags=re.MULTILINE)
    src = re.sub(r"^if __name__ == .__main__.:\n(?:^\s{4}.*\n?)*", "", src, flags=re.MULTILINE)
    return src.strip() + "\n"


BOOTSTRAP_CELL = """
# ── Đọc trực tiếp booster Nhánh/Lưu vực từ output notebook #2 -- KHÔNG COPY ──
# Trước đây copy nguyên cây artifacts/ (1728 file booster JSON, XGBoost lưu
# JSON khá nặng do nhiều vòng boosting) vào /kaggle/working -- dễ tràn quota
# đĩa 20GB của Kaggle khi cộng thêm output fine-tune mới ghi ra (đã từng gặp:
# "OSError: No space left on device"). Giờ chỉ ĐỌC thẳng từ /kaggle/input
# (input là read-only, không tính vào quota ghi) -- /kaggle/working chỉ chứa
# phần MỚI (kết quả fine-tune, nhẹ hơn nhiều vì num_boost_round=300 thay vì
# 2000 lúc train nhánh/lưu vực).
# Nhiều notebook Output cùng 1 tài khoản (Add Input -> Your Work) bị Kaggle
# GỘP CHUNG dưới 1 thư mục theo tên tài khoản: /kaggle/input/notebooks/
# <username>/ -- không thể giả định số cấp lồng cố định, nên quét đệ quy TOÀN
# BỘ /kaggle/input, tìm TẤT CẢ thư mục có chứa 1 thư mục con khớp tiền tố
# mong đợi (không dừng ở kết quả đầu tiên).
def _find_all_content_roots(base, dir_prefixes):
    found = []
    for r, dirs, _files in os.walk(base):
        if any(d.startswith(p) for p in dir_prefixes for d in dirs):
            found.append(r)
            dirs[:] = []  # đã khớp -- khỏi cần đi sâu thêm dưới nhánh này
    return found

SOURCE_ROOT = None
for content_root in _find_all_content_roots("/kaggle/input", ("artifacts", "eval_json")):
    if os.path.isdir(os.path.join(content_root, "artifacts")):
        SOURCE_ROOT = content_root
        break

n_boosters = 0
if SOURCE_ROOT:
    src_artifacts = os.path.join(SOURCE_ROOT, "artifacts")
    for _r, _d, _f in os.walk(src_artifacts):
        n_boosters += sum(1 for fn in _f if fn.endswith(".json") and fn.startswith("h"))
    print(f"[bootstrap] Đọc trực tiếp (không copy) checkpoint từ: {src_artifacts}")
print(f"Tổng số file booster (.json) tìm thấy: {n_boosters}")
if n_boosters == 0:
    print("CẢNH BÁO: chưa thấy booster nào -- kiểm tra lại đã Add Input đúng output notebook #2 chưa.")
"""


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # XGBoost — [3/4] Fine-tune (continue-boosting) x 3 mùa

    **PHỤ THUỘC notebook #2** -- phải Add Input output của notebook #2 TRƯỚC
    khi Run All. Không cần GPU. Output của notebook này là đầu vào cho
    notebook #4.
    """))

    cells.append(code("""
    import subprocess, sys
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "xgboost>=2.0", "huggingface_hub"])
    """))

    cells.append(code("""
    import os, json
    import numpy as np
    import pandas as pd
    import xgboost as xgb

    SKIP_IF_DONE = True
    SEASONS = ["all", "dry", "rainy"]
    """))

    cells.append(md("## Bootstrap: nạp booster Nhánh/Lưu vực từ notebook #2"))
    cells.append(code(BOOTSTRAP_CELL))

    cells.append(md("## config/reservoirs.py + config/settings.py"))
    cells.append(code(read_source("config/reservoirs.py")))
    cells.append(code(read_source("config/settings.py")))

    cells.append(md("## data/tabular_dataset.py"))
    cells.append(code(read_source("data/tabular_dataset.py")))

    cells.append(md("## training/event_metrics.py"))
    cells.append(code(read_source("training/event_metrics.py")))

    cells.append(md("## training/train_xgb.py"))
    cells.append(code(read_source("training/train_xgb.py")))

    cells.append(md("## training/evaluate_xgb.py"))
    cells.append(code(read_source("training/evaluate_xgb.py")))

    cells.append(md("## Build dataset 1 lần duy nhất + helper"))
    cells.append(code("""
    X_all, y_all, rid_all, ts_all = build_tabular_dataset()
    DATA_ALL = (X_all, y_all, rid_all, ts_all)

    BASIN_KEY = {"Vu Gia": "VU_GIA", "Thu Bồn": "THU_BON"}

    def own_branch(rid):
        for b, rl in RIVER_BRANCHES.items():
            if rid in rl:
                return b
        return None

    def own_basin(rid):
        for b, rl in RIVER_BASINS_EXPERIMENT.items():
            if rid in rl:
                return b
        return None

    def season_group(base, season):
        return base if season == "all" else f"{base}_{season}"

    def is_done(art_dir):
        return os.path.exists(f"{art_dir}/h24_q90.json")
    """))

    cells.append(md("""
    ## Pha 4 — Fine-tune riêng từng hồ bằng CONTINUE-BOOSTING, x 3 mùa (Kịch bản 5)
    """))
    cells.append(code("""
    for rid, info in RESERVOIRS.items():
        key = info["name"].replace(" ", "_")
        b_own = own_branch(rid)
        basin_own = own_basin(rid)

        for season in SEASONS:
            X_s, y_s, _, ts_s = filter_by_rids(X_all, y_all, rid_all, ts_all, [rid])

            if b_own and SOURCE_ROOT:
                branch_art_dir = f"{SOURCE_ROOT}/artifacts/xgb_branch/{season_group(b_own, season)}"
                ft_art_dir = f"artifacts/xgb_finetune_branch/{season_group(key, season)}"
                if is_done(branch_art_dir) and not (SKIP_IF_DONE and is_done(ft_art_dir)):
                    print(f"\\n>>> PHA 4 - FINE-TUNE {info['name']} từ nhánh {b_own} | MÙA {season.upper()}")
                    init_boosters = load_boosters(branch_art_dir)
                    train_xgb_dataset(X_s, y_s, ts_s, ft_art_dir, season=season,
                                       init_boosters=init_boosters, num_boost_round=300, early_stopping_rounds=30)

            if basin_own and SOURCE_ROOT:
                bkey = BASIN_KEY[basin_own]
                basin_art_dir = f"{SOURCE_ROOT}/artifacts/xgb_basin/{season_group(bkey, season)}"
                ft_art_dir = f"artifacts/xgb_finetune_basin/{season_group(key, season)}"
                if is_done(basin_art_dir) and not (SKIP_IF_DONE and is_done(ft_art_dir)):
                    print(f"\\n>>> PHA 4 - FINE-TUNE {info['name']} từ lưu vực {basin_own} | MÙA {season.upper()}")
                    init_boosters = load_boosters(basin_art_dir)
                    train_xgb_dataset(X_s, y_s, ts_s, ft_art_dir, season=season,
                                       init_boosters=init_boosters, num_boost_round=300, early_stopping_rounds=30)
    """))
    cells.append(code("""
    for rid, info in RESERVOIRS.items():
        key = info["name"].replace(" ", "_")
        for method in ["finetune_branch", "finetune_basin"]:
            for season in SEASONS:
                group = season_group(key, season)
                art_dir = f"artifacts/xgb_{method}/{group}"
                json_dir = f"eval_json/{method}/{group}"
                if not is_done(art_dir):
                    continue
                if SKIP_IF_DONE and os.path.exists(f"{json_dir}/{key}.json"):
                    continue
                evaluate(artifact_dir=art_dir, output_prefix=f"{method}_{group}", json_out_dir=json_dir, data=DATA_ALL)
    """))

    cells.append(md("""
    ## Xong Pha 4
    Bấm "Save Version". Ở notebook #4 (Tổng hợp Excel): Add Input -> chọn
    output của notebook #1, #2, VÀ #3 (3 dataset input cùng lúc).
    """))

    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3.10"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def main():
    nb = build_notebook()
    out_path = os.path.join(HERE, "train_xgb_3_finetune.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()
