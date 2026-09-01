# kaggle/generate_notebook_1_single.py
"""
Notebook Kaggle #1/4 (XGBoost) -- Single: train riêng từng hồ (16 hồ x 72
booster), KHÔNG warm-start, x 3 mùa (all/dry/rainy) = 48 lượt train. ĐỘC LẬP
hoàn toàn -- chỉ cần dataset gốc. Chạy song song được với notebook #2. Không
cần GPU.

Chạy:
    cd XGBoost_Py_Backend
    python kaggle/generate_notebook_1_single.py
Kết quả: kaggle/train_xgb_1_single.ipynb
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
    # XGBoost — [1/4] Single (16 hồ x 3 mùa, KHÔNG warm-start)

    Notebook ĐỘC LẬP -- chỉ cần dataset gốc. Chạy song song được với notebook
    #2 (Nhánh + Lưu vực). Không cần GPU. Output của notebook này là đầu vào
    cho notebook #4 (Tổng hợp Excel).
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

    cells.append(md("## Build dataset 1 lần duy nhất"))
    cells.append(code("""
    X_all, y_all, rid_all, ts_all = build_tabular_dataset()
    DATA_ALL = (X_all, y_all, rid_all, ts_all)

    def season_group(base, season):
        return base if season == "all" else f"{base}_{season}"

    def is_done(art_dir):
        return os.path.exists(f"{art_dir}/h24_q90.json")
    """))

    cells.append(md("## Pha 1 — Single (train riêng từng hồ, baseline gốc, KHÔNG warm-start) x 3 mùa"))
    cells.append(code("""
    for rid, info in RESERVOIRS.items():
        key = info["name"].replace(" ", "_")
        for season in SEASONS:
            art_dir = f"artifacts/xgb_single/{season_group(key, season)}"
            if SKIP_IF_DONE and is_done(art_dir):
                print(f"[SKIP/RESUME] Single {info['name']} ({season}) đã train.")
                continue
            print(f"\\n>>> PHA 1 - TRAIN SINGLE: {info['name']} | MÙA {season.upper()}")
            X_s, y_s, _, ts_s = filter_by_rids(X_all, y_all, rid_all, ts_all, [rid])
            train_xgb_dataset(X_s, y_s, ts_s, art_dir, season=season)
    """))
    cells.append(code("""
    for rid, info in RESERVOIRS.items():
        key = info["name"].replace(" ", "_")
        for season in SEASONS:
            group = season_group(key, season)
            art_dir = f"artifacts/xgb_single/{group}"
            json_dir = f"eval_json/single/{group}"
            if not is_done(art_dir):
                continue
            if SKIP_IF_DONE and os.path.exists(f"{json_dir}/{key}.json"):
                continue
            evaluate(artifact_dir=art_dir, output_prefix=f"single_{group}", json_out_dir=json_dir, data=DATA_ALL)
    """))

    cells.append(md("""
    ## Xong Pha 1
    Bấm "Save Version". Ở notebook #4 (Tổng hợp Excel): Add Input -> chọn
    output của CHÍNH notebook này.
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
    out_path = os.path.join(HERE, "train_xgb_1_single.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()
