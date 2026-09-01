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
import shutil
# ── Nạp lại 72 booster Nhánh/Lưu vực từ output notebook #2 ─────────────────
# Bất kỳ input dataset nào KHÔNG chứa v2_X_hindcast.npy (không phải dataset dữ
# liệu hồ gốc) được coi là kết quả từ notebook trước, copy nguyên cây thư mục
# vào thư mục làm việc hiện tại (mặc định /kaggle/working trên Kaggle).
n_merged = 0
if os.path.isdir("/kaggle/input"):
    for ds_name in os.listdir("/kaggle/input"):
        ds_path = os.path.join("/kaggle/input", ds_name)
        if not os.path.isdir(ds_path):
            continue
        has_raw_data = any("v2_X_hindcast.npy" in files for _, _, files in os.walk(ds_path))
        if not has_raw_data:
            print(f"[bootstrap] Nạp lại kết quả từ input dataset: {ds_name}")
            shutil.copytree(ds_path, ".", dirs_exist_ok=True)
            n_merged += 1

n_boosters = 0
if os.path.isdir("artifacts"):
    for _r, _d, _f in os.walk("artifacts"):
        n_boosters += sum(1 for fn in _f if fn.endswith(".json") and fn.startswith("h"))
print(f"Đã gộp {n_merged} input dataset | Tổng số file booster (.json) tìm thấy: {n_boosters}")
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

            if b_own:
                branch_art_dir = f"artifacts/xgb_branch/{season_group(b_own, season)}"
                ft_art_dir = f"artifacts/xgb_finetune_branch/{season_group(key, season)}"
                if is_done(branch_art_dir) and not (SKIP_IF_DONE and is_done(ft_art_dir)):
                    print(f"\\n>>> PHA 4 - FINE-TUNE {info['name']} từ nhánh {b_own} | MÙA {season.upper()}")
                    init_boosters = load_boosters(branch_art_dir)
                    train_xgb_dataset(X_s, y_s, ts_s, ft_art_dir, season=season,
                                       init_boosters=init_boosters, num_boost_round=300, early_stopping_rounds=30)

            if basin_own:
                bkey = BASIN_KEY[basin_own]
                basin_art_dir = f"artifacts/xgb_basin/{season_group(bkey, season)}"
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
