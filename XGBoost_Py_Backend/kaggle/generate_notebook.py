# kaggle/generate_notebook.py
"""
[Bản đơn giản, chỉ train 1 model global gộp 16 hồ] Tao 1 notebook Kaggle train
XGBoost (global model 16 ho, direct multi-horizon quantile) tu chinh source
.py that trong project (cung pattern voi LSTM_Py_Backend_v2/kaggle/ va
RF_Py_Backend/kaggle/).

Neu can so sanh du 5 phuong phap (Single/Nhanh/Luu vuc/Fine-tune x 3 mua) thi
dung 4 notebook trong kaggle/generate_notebook_1_single.py ... _4_summary.py
thay vi file nay -- file nay chi con la ban rut gon 1-model-global de tham
khao/kiem tra nhanh.

Chay:
    cd XGBoost_Py_Backend
    python kaggle/generate_notebook.py
Ket qua: kaggle/train_xgb.ipynb

Cach dung tren Kaggle:
    1. (Tuy chon) Attach dataset chua LSTM_Py_Backend_v2/datasets/. Neu KHONG
       attach, notebook tu dong tai tu Hugging Face 'Anvo2004/dataset_all_lake'.
    2. KHONG can bat GPU -- XGBoost tree_method="hist" chay CPU thuan.
    3. Run All -> ket qua luu vao /kaggle/working/artifacts/xgb/ (72 file
       .json) + ket_qua_danh_gia_2025_xgb.xlsx + ket_qua_nse_theo_gio_xgb.xlsx.
    4. Tai ve, copy artifacts/xgb/ vao XGBoost_Py_Backend/artifacts/xgb/.
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
    src = re.sub(r"^from (models|config|data|training)\.\w+ import \([^)]*\)\n?", "", src, flags=re.MULTILINE)
    src = re.sub(r"^from (models|config|data|training)\.\w+ import .*$", "", src, flags=re.MULTILINE)
    src = re.sub(r"^from \.\w+ import .*$", "", src, flags=re.MULTILINE)
    src = re.sub(r"^if __name__ == .__main__.:\n(?:^\s{4}.*\n?)*", "", src, flags=re.MULTILINE)
    return src.strip() + "\n"


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # XGBoost — Dự báo lưu lượng đến (Qvào)

    Global model — 72 booster (24 horizon × 3 quantile P10/P50/P90, direct
    multi-horizon 1..24h) dùng chung cho cả 16 hồ (reservoir index là 1
    feature one-hot) — cùng contract với LSTM/RF.

    Dữ liệu: tabular hoá từ dataset `LSTM_Py_Backend_v2` đã build sẵn — không
    cần Excel gốc, không dùng mưa dự báo oracle (xem `data/tabular_dataset.py`).

    **Không cần GPU** — `tree_method="hist"` chạy CPU thuần.
    """))

    cells.append(code("""
    import subprocess, sys
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "xgboost>=2.0", "huggingface_hub"])
    """))

    cells.append(code("""
    import os, sys, time
    import numpy as np
    import pandas as pd
    import xgboost as xgb
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

    cells.append(md("## Chạy train + evaluate (model global, gộp cả 16 hồ, mùa cả năm)"))
    cells.append(code("""
    X_all, y_all, rid_all, ts_all = build_tabular_dataset()
    train_xgb_dataset(X_all, y_all, ts_all, "artifacts/xgb", season="all")
    """))
    cells.append(code("""
    evaluate(artifact_dir="artifacts/xgb", output_prefix="xgb")
    """))

    cells.append(md("""
    ## Tải kết quả
    Sau khi Run All xong: `/kaggle/working/artifacts/xgb/` (72 file `.json`) +
    `ket_qua_danh_gia_2025_xgb.xlsx` + `ket_qua_nse_theo_gio_xgb.xlsx` — tải cả
    3 về, copy `artifacts/xgb/` đè vào `XGBoost_Py_Backend/artifacts/xgb/` của
    project (đồng thời copy sang `LSTM_Py_Backend/lstm_service/artifacts/xgb/`
    nếu muốn endpoint `/predict-xgb` đang chạy trên VPS dùng bộ trọng số mới).
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


if __name__ == "__main__":
    nb = build_notebook()
    out_path = os.path.join(HERE, "train_xgb.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    print(f"Da tao: {out_path}")
