# kaggle/generate_notebook_1_standalone.py
"""
Notebook Kaggle #1/4 (LSTM) -- Standalone: train riêng từng hồ (16 hồ), KHÔNG
warm-start, x 3 mùa (all/dry/rainy) = 48 lượt train. ĐỘC LẬP hoàn toàn -- chỉ
cần dataset gốc, không phụ thuộc notebook nào khác. Chạy song song được với
notebook #2.

Epoch đã giảm nhẹ (epochs=30, patience=10) so với mặc định (100/30) -- vì quy
mô đã tăng từ 16 lên 48 lượt train, giữ epoch mặc định sẽ quá lâu trên Kaggle.
Pooled (nhánh/lưu vực, notebook #2) vẫn dùng epochs=20 như cũ (đã kiểm chứng
đủ hội tụ nhờ oversampling + cosine LR).

Chạy:
    cd LSTM_Py_Backend_v2
    python kaggle/generate_notebook_1_standalone.py
Kết quả: kaggle/train_lstm_1_standalone.ipynb

Cách dùng trên Kaggle:
    1. Nén datasets/ (16 thư mục con) thành 1 Kaggle Dataset, attach.
    2. Bật GPU. Run All -- an toàn chạy nhiều session (tự resume, skip hồ/mùa
       đã xong).
    3. Xong: bấm "Save Version" -- output của chính notebook này sẽ dùng làm
       input cho notebook #4 (tổng hợp Excel). Xem hướng dẫn đầy đủ trong quy
       trình đã gửi kèm.
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


SETUP_CELL = """
import os, json, math, random, warnings
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset, Subset, ConcatDataset
from tqdm import tqdm
warnings.filterwarnings("ignore")

OUTPUT_ROOT = "/kaggle/working"
SKIP_IF_DONE = True  # False = train lại từ đầu, bỏ qua toàn bộ resume-check
SEASONS = ["all", "dry", "rainy"]

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {device}")
if device.type == "cuda":
    print(f"GPU: {torch.cuda.get_device_name(0)}")

HF_REPO_ID = "Anvo2004/dataset_all_lake"
RESERVOIR_DATA_DIRS = {}

for _root, _dirs, _files in os.walk("/kaggle/input"):
    if "v2_X_hindcast.npy" in _files:
        RESERVOIR_DATA_DIRS[os.path.basename(_root)] = _root

if not RESERVOIR_DATA_DIRS:
    print(f"Không tìm thấy data ở /kaggle/input -> Đang tải từ Hugging Face '{HF_REPO_ID}'...")
    try:
        from huggingface_hub import hf_hub_download
        import zipfile
        zip_path = hf_hub_download(repo_id=HF_REPO_ID, filename="datasets_all_reservoirs.zip", repo_type="dataset")
        extract_dir = f"{OUTPUT_ROOT}/datasets"
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        for _root, _dirs, _files in os.walk(extract_dir):
            if "v2_X_hindcast.npy" in _files:
                RESERVOIR_DATA_DIRS[os.path.basename(_root)] = _root
    except Exception as e:
        print(f"Lưu ý Hugging Face: {e}. Cần Add Input Dataset thủ công trên Kaggle.")

print(f"Tìm thấy {len(RESERVOIR_DATA_DIRS)} thư mục dữ liệu hồ:")
for k, v in sorted(RESERVOIR_DATA_DIRS.items()):
    print(f"  {k} -> {v}")
"""


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # ReservoirLSTM — [1/4] Standalone (16 hồ x 3 mùa, KHÔNG warm-start)

    Notebook ĐỘC LẬP -- chỉ cần dataset gốc. Chạy song song được với notebook
    #2 (Nhánh + Lưu vực). Output của notebook này sẽ được notebook #4 (Tổng
    hợp Excel) dùng làm input.
    """))

    cells.append(code(SETUP_CELL))

    cells.append(md("## Config"))
    cells.append(code(read_source("config/reservoirs.py")))
    cells.append(code(read_source("config/settings.py")))

    cells.append(md("## Model"))
    cells.append(code(read_source("models/station_attention.py")))
    cells.append(code(read_source("models/flood_lstm_v2.py")))
    cells.append(code(read_source("models/quantile_loss_v2.py")))

    cells.append(md("## Metrics"))
    cells.append(code(read_source("training/event_metrics.py")))

    cells.append(md("## Dataset Loader"))
    cells.append(code(read_source("data/reservoir_dataset.py")))

    cells.append(md("## Train (1 hồ, hỗ trợ season=)"))
    cells.append(code(read_source("training/train_reservoir.py")))

    cells.append(md("""
    ## Pha 1 — Standalone (train riêng từng hồ, KHÔNG warm-start) x 3 mùa

    **Epoch đã giảm** so với mặc định (epochs=30, patience=10, warmup=3,
    batch_size=256) -- quy mô 48 lượt train (16 hồ x 3 mùa) cần epoch nhẹ hơn
    để chạy hết trong quỹ thời gian Kaggle hợp lý. Season "dry"/"rainy" vốn đã
    có ít mẫu hơn "all" nên hội tụ nhanh hơn, ít epoch vẫn đủ.
    """))
    cells.append(code("""
    for rid, info in RESERVOIRS.items():
        key = info["name"].replace(" ", "_")
        data_dir = RESERVOIR_DATA_DIRS.get(key)
        if not data_dir:
            print(f"[SKIP] {info['name']}: không có data")
            continue

        for season in SEASONS:
            cfg = ReservoirLSTMConfig(rid=rid, reservoir_name=info["name"])
            cfg.artifacts_dir = f"{OUTPUT_ROOT}/standalone{'' if season == 'all' else '_' + season}/{key}"
            cfg.epochs, cfg.patience, cfg.warmup_epochs, cfg.batch_size = 30, 10, 3, 256
            metrics_file = f"{cfg.artifacts_dir}/{key}/metrics_test.json"

            if SKIP_IF_DONE and os.path.exists(metrics_file):
                print(f"[SKIP/RESUME] {info['name']} ({season}) đã train standalone xong.")
                continue

            print("\\n" + "#" * 70)
            print(f"# PHA 1 - STANDALONE: [{rid}] {info['name']} | MÙA {season.upper()}")
            print("#" * 70)
            train_reservoir(rid, cfg=cfg, data_dir=data_dir, init_checkpoint=None, season=season)
    """))

    cells.append(md("""
    ## Xong Pha 1
    Bấm "Save Version" (Save & Run All). Sau đó ở notebook #4 (Tổng hợp Excel):
    Add Input -> chọn output của CHÍNH notebook này (tab "Your Work" trong hộp
    thoại Add Input) để nạp lại toàn bộ `standalone*/` mà không cần train lại.
    """))

    return {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3.10.0"},
        },
        "cells": cells,
    }


def main():
    notebook = build_notebook()
    out_path = os.path.join(HERE, "train_lstm_1_standalone.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(notebook, f, ensure_ascii=True, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()
