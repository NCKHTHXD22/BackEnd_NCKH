# kaggle/generate_notebook.py
"""
Tao 1 notebook Kaggle train Random Forest (Quantile Regression Forest, global
model 16 ho) tu chinh source .py that trong project -- khong bi lech code voi
repo (cung pattern voi LSTM_Py_Backend_v2/kaggle/generate_notebook_all.py).

Chay:
    cd RF_Py_Backend
    python kaggle/generate_notebook.py
Ket qua: kaggle/train_rf.ipynb

Cach dung tren Kaggle:
    1. (Tuy chon) Attach dataset chua LSTM_Py_Backend_v2/datasets/ (16 thu muc
       con <Ten_Ho>/v2_*.npy). Neu KHONG attach, notebook tu dong tai tu
       Hugging Face 'Anvo2004/dataset_all_lake' (khong can Kaggle Dataset).
    2. KHONG can bat GPU -- Random Forest chi dung CPU (Settings -> Accelerator
       -> None la du, tiet kiem quota GPU cho LSTM).
    3. Run All -> ket qua luu vao /kaggle/working/artifacts/rf/ (24 file
       .joblib) + ket_qua_danh_gia_2025_rf.xlsx + ket_qua_nse_theo_gio_rf.xlsx.
    4. Tai ve, copy artifacts/rf/ vao RF_Py_Backend/artifacts/rf/ cua project.
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
    """Doc 1 file .py that trong project, bo import noi bo (da nhung o cell truoc)."""
    with open(os.path.join(ROOT, rel_path), "r", encoding="utf-8") as f:
        src = f.read()
    src = re.sub(r"^from (models|config|data|training)\.\w+ import .*$", "", src, flags=re.MULTILINE)
    src = re.sub(r"^from \.\w+ import .*$", "", src, flags=re.MULTILINE)
    src = re.sub(r"^if __name__ == .__main__.:\n(?:^\s{4}.*\n?)*", "", src, flags=re.MULTILINE)
    return src.strip() + "\n"


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # Random Forest (Quantile Regression Forest) — Dự báo lưu lượng đến (Qvào)

    Global model — 1 bộ 24 Quantile Regression Forest (1/horizon, direct
    multi-horizon 1..24h) dùng chung cho cả 16 hồ (reservoir index là 1 feature
    one-hot), quantile P10/P50/P90 — cùng contract với LSTM/XGBoost.

    Dữ liệu: tabular hoá từ dataset `LSTM_Py_Backend_v2` đã build sẵn (dòng cuối
    của mỗi hindcast window = "hiện tại", đã chứa lag/rolling feature nén 240h
    quá khứ) — không cần Excel gốc, không dùng mưa dự báo oracle (tránh
    train/serve mismatch, xem `data/tabular_dataset.py`).

    **Không cần GPU** — Random Forest chạy CPU thuần.
    """))

    cells.append(code("""
    import subprocess, sys
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "quantile-forest", "huggingface_hub"])
    """))

    cells.append(code("""
    import os, sys, time
    import numpy as np
    import pandas as pd
    import joblib
    from quantile_forest import RandomForestQuantileRegressor
    """))

    cells.append(md("## config/reservoirs.py + config/settings.py"))
    cells.append(code(read_source("config/reservoirs.py")))
    cells.append(code(read_source("config/settings.py")))

    cells.append(md("## data/tabular_dataset.py"))
    cells.append(code(read_source("data/tabular_dataset.py")))

    cells.append(md("## training/event_metrics.py"))
    cells.append(code(read_source("training/event_metrics.py")))

    cells.append(md("## training/train_rf.py"))
    cells.append(code(read_source("training/train_rf.py")))

    cells.append(md("## training/evaluate_rf.py"))
    cells.append(code(read_source("training/evaluate_rf.py")))

    cells.append(md("## Chạy train + evaluate"))
    cells.append(code("""
    train()
    """))
    cells.append(code("""
    evaluate()
    """))

    cells.append(md("""
    ## Tải kết quả
    Sau khi Run All xong: `/kaggle/working/artifacts/rf/` (24 file `.joblib`) +
    `ket_qua_danh_gia_2025_rf.xlsx` + `ket_qua_nse_theo_gio_rf.xlsx` — tải cả 3
    về, copy `artifacts/rf/` đè vào `RF_Py_Backend/artifacts/rf/` của project.
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
    out_path = os.path.join(HERE, "train_rf.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    print(f"Da tao: {out_path}")
