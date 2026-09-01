# kaggle/generate_notebook_2_branch_basin.py
"""
Notebook Kaggle #2/4 (XGBoost) -- Nhánh sông + Lưu vực sông: pooled 4 nhánh +
2 biến thể Sông Côn 2 + 2 lưu vực thực nghiệm, mỗi nhóm x 3 mùa (18 + 6 = 24
lượt train + eval). ĐỘC LẬP hoàn toàn -- chỉ cần dataset gốc. Chạy song song
được với notebook #1. Không cần GPU.

Output của notebook này là ĐẦU VÀO BẮT BUỘC cho notebook #3 (Fine-tune).

Chạy:
    cd XGBoost_Py_Backend
    python kaggle/generate_notebook_2_branch_basin.py
Kết quả: kaggle/train_xgb_2_branch_basin.ipynb
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


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # XGBoost — [2/4] Nhánh Sông + Lưu Vực Sông (x 3 mùa) + Đánh giá

    Notebook ĐỘC LẬP -- chỉ cần dataset gốc. Chạy song song được với notebook
    #1 (Single). Không cần GPU. Output của notebook này là ĐẦU VÀO BẮT BUỘC
    cho notebook #3 (Fine-tune) và notebook #4 (Tổng hợp Excel).
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

    BRANCH_GROUPS = list(RIVER_BRANCHES.keys()) + ["A_VUONG_WITH_SONG_CON", "SONG_BUNG_WITH_SONG_CON"]
    BASIN_KEY = {"Vu Gia": "VU_GIA", "Thu Bồn": "THU_BON"}

    def rids_for_branch(b_name):
        if b_name in RIVER_BRANCHES:
            return RIVER_BRANCHES[b_name]
        if b_name == "A_VUONG_WITH_SONG_CON":
            return SONG_CON_2_VARIANTS["A_VUONG"]
        if b_name == "SONG_BUNG_WITH_SONG_CON":
            return SONG_CON_2_VARIANTS["SONG_BUNG"]
        raise ValueError(b_name)

    def season_group(base, season):
        return base if season == "all" else f"{base}_{season}"

    def is_done(art_dir):
        return os.path.exists(f"{art_dir}/h24_q90.json")
    """))

    cells.append(md("## Pha 2 — Nhánh sông (4 nhánh + 2 biến thể Sông Côn 2) x 3 mùa — Kịch bản 1 + 2 + 4"))
    cells.append(code("""
    for b_name in BRANCH_GROUPS:
        for season in SEASONS:
            group = season_group(b_name, season)
            art_dir = f"artifacts/xgb_branch/{group}"
            if SKIP_IF_DONE and is_done(art_dir):
                print(f"[SKIP/RESUME] Nhánh {b_name} ({season}) đã train.")
                continue
            print(f"\\n>>> PHA 2 - TRAIN NHÁNH: {b_name} | MÙA {season.upper()}")
            X_b, y_b, _, ts_b = filter_by_rids(X_all, y_all, rid_all, ts_all, rids_for_branch(b_name))
            train_xgb_dataset(X_b, y_b, ts_b, art_dir, season=season)
    """))
    cells.append(code("""
    for b_name in BRANCH_GROUPS:
        for season in SEASONS:
            group = season_group(b_name, season)
            art_dir = f"artifacts/xgb_branch/{group}"
            json_dir = f"eval_json/branch/{group}"
            if not is_done(art_dir):
                continue
            if SKIP_IF_DONE and os.path.isdir(json_dir) and len(os.listdir(json_dir)) > 0:
                continue
            evaluate(artifact_dir=art_dir, output_prefix=f"branch_{group}", json_out_dir=json_dir, data=DATA_ALL)
    """))

    cells.append(md("""
    ## Pha 3 — Lưu vực sông (2 lưu vực thực nghiệm) x 3 mùa — Kịch bản 3 + 4
    Vu Gia = nhánh Sông Tranh (2/3/4) + Khe Diên. Thu Bồn = 12 hồ còn lại.
    """))
    cells.append(code("""
    for basin_name, rids in RIVER_BASINS_EXPERIMENT.items():
        bkey = BASIN_KEY[basin_name]
        for season in SEASONS:
            group = season_group(bkey, season)
            art_dir = f"artifacts/xgb_basin/{group}"
            if SKIP_IF_DONE and is_done(art_dir):
                print(f"[SKIP/RESUME] Lưu vực {basin_name} ({season}) đã train.")
                continue
            print(f"\\n>>> PHA 3 - TRAIN LƯU VỰC: {basin_name} | MÙA {season.upper()}")
            X_b, y_b, _, ts_b = filter_by_rids(X_all, y_all, rid_all, ts_all, rids)
            train_xgb_dataset(X_b, y_b, ts_b, art_dir, season=season)
    """))
    cells.append(code("""
    for basin_name in RIVER_BASINS_EXPERIMENT:
        bkey = BASIN_KEY[basin_name]
        for season in SEASONS:
            group = season_group(bkey, season)
            art_dir = f"artifacts/xgb_basin/{group}"
            json_dir = f"eval_json/basin/{group}"
            if not is_done(art_dir):
                continue
            if SKIP_IF_DONE and os.path.isdir(json_dir) and len(os.listdir(json_dir)) > 0:
                continue
            evaluate(artifact_dir=art_dir, output_prefix=f"basin_{group}", json_out_dir=json_dir, data=DATA_ALL)
    """))

    cells.append(md("""
    ## Xong Pha 2+3
    Bấm "Save Version". Ở notebook #3 (Fine-tune) và #4 (Tổng hợp Excel): Add
    Input -> chọn output của CHÍNH notebook này.
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
    out_path = os.path.join(HERE, "train_xgb_2_branch_basin.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()
