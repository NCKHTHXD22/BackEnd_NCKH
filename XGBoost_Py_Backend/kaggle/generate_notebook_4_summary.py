# kaggle/generate_notebook_4_summary.py
"""
Notebook Kaggle #4/4 (XGBoost) -- Tổng hợp toàn bộ kết quả (notebook #1 + #2 +
#3) ra 1 file Excel. Nhẹ, không cần GPU, không cần train gì -- chỉ đọc JSON đã
có sẵn và ghép bảng.

PHỤ THUỘC notebook #1, #2, #3 -- Add Input CẢ 3 output trước khi Run All.

Chạy:
    cd XGBoost_Py_Backend
    python kaggle/generate_notebook_4_summary.py
Kết quả: kaggle/train_xgb_4_summary.ipynb
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
n_merged = 0
if os.path.isdir("/kaggle/input"):
    for ds_name in os.listdir("/kaggle/input"):
        ds_path = os.path.join("/kaggle/input", ds_name)
        if not os.path.isdir(ds_path):
            continue
        has_raw_data = any("v2_X_hindcast.npy" in files for _, _, files in os.walk(ds_path))
        if not has_raw_data:
            print(f"[bootstrap] Gộp kết quả từ input dataset: {ds_name}")
            shutil.copytree(ds_path, ".", dirs_exist_ok=True)
            n_merged += 1

print(f"Đã gộp {n_merged} input dataset vào thư mục làm việc")
if n_merged < 3:
    print("LƯU Ý: nên có đủ 3 input (output notebook #1, #2, #3) để bảng so sánh đầy đủ nhất.")
"""


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # XGBoost — [4/4] Tổng hợp Excel

    **PHỤ THUỘC notebook #1, #2, #3** -- Add Input cả 3 output trước khi Run
    All. Không cần GPU.
    """))

    cells.append(code("import os, json\nimport numpy as np\nimport pandas as pd\n"))

    cells.append(md("## Bootstrap: gộp kết quả từ notebook #1 + #2 + #3"))
    cells.append(code(BOOTSTRAP_CELL))

    cells.append(md("## config/reservoirs.py"))
    cells.append(code(read_source("config/reservoirs.py")))

    cells.append(md("## Pha 5 — Tổng hợp toàn bộ kết quả ra 1 file Excel"))
    cells.append(code(read_source("main_generate_excel_summary.py")))
    cells.append(code("""
    generate_summary(root=".")
    """))

    cells.append(md("""
    ## Tải kết quả
    `bang_so_sanh_nse_tong_hop_xgb.xlsx` -- tải về, copy vào
    `XGBoost_Py_Backend/` của project.
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
    out_path = os.path.join(HERE, "train_xgb_4_summary.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()
