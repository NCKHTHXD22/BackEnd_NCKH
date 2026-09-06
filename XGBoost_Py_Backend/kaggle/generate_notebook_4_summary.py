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
# Nhiều notebook Output cùng 1 tài khoản (Add Input -> Your Work) bị Kaggle
# GỘP CHUNG dưới 1 thư mục theo tên tài khoản: /kaggle/input/notebooks/
# <username>/ -- không thể giả định số cấp lồng cố định, nên quét đệ quy TOÀN
# BỘ /kaggle/input, tìm TẤT CẢ thư mục có chứa 1 thư mục con khớp tiền tố
# mong đợi (không dừng ở kết quả đầu tiên -- lỗi cũ chỉ gộp được đúng 1 trong
# 3 notebook do dừng sớm).
def _find_all_content_roots(base, dir_prefixes):
    found = []
    for r, dirs, _files in os.walk(base):
        if any(d.startswith(p) for p in dir_prefixes for d in dirs):
            found.append(r)
            dirs[:] = []  # đã khớp -- khỏi cần đi sâu thêm dưới nhánh này
    return found

# Chỉ gộp eval_json/ (file metric nhỏ) -- BỎ QUA artifacts/ (chứa booster JSON
# gốc, có thể hàng chục GB cộng dồn từ cả 3 notebook #1+#2+#3). Summary chỉ
# đọc eval_json/, không cần model gốc -- copy cả artifacts/ vào đây từng làm
# tràn quota đĩa 20GB của Kaggle ở notebook #3.
n_merged = 0
for content_root in _find_all_content_roots("/kaggle/input", ("artifacts", "eval_json")):
    eval_json_src = os.path.join(content_root, "eval_json")
    if os.path.isdir(eval_json_src):
        print(f"[bootstrap] Gộp eval_json từ: {eval_json_src} (bỏ qua artifacts/)")
        shutil.copytree(eval_json_src, "eval_json", dirs_exist_ok=True)
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
