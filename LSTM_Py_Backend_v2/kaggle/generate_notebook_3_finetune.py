# kaggle/generate_notebook_3_finetune.py
"""
Notebook Kaggle #3/4 (LSTM) -- Fine-tune (Transfer Learning, Kịch bản 5): warm-
start từ checkpoint Nhánh/Lưu vực (notebook #2) ĐÚNG MÙA, fine-tune riêng từng
hồ trên dữ liệu ĐÃ LỌC CÙNG MÙA (16 hồ x 2 nguồn x 3 mùa = tối đa 96 lượt,
epoch nhẹ 10/hồ nên vẫn nhanh).

PHỤ THUỘC notebook #2 -- BẮT BUỘC phải "Save Version" notebook #2 xong rồi Add
Input -> chọn output của notebook #2 vào đây TRƯỚC khi Run All. Có cell
"bootstrap" tự động copy checkpoint từ input dataset đó vào /kaggle/working/
để dùng luôn (không train lại nhánh/lưu vực).

Chạy:
    cd LSTM_Py_Backend_v2
    python kaggle/generate_notebook_3_finetune.py
Kết quả: kaggle/train_lstm_3_finetune.ipynb
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
import os, json, math, random, warnings, shutil
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset, Subset, ConcatDataset
from tqdm import tqdm
warnings.filterwarnings("ignore")

OUTPUT_ROOT = "/kaggle/working"
SKIP_IF_DONE = True
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

BOOTSTRAP_CELL = """
# ── Nạp lại checkpoint Nhánh/Lưu vực từ output notebook #2 ──────────────────
# (Add Input -> chọn output của chính notebook #2 -- Kaggle mount ở
# /kaggle/input/<slug-notebook-2>/). Bất kỳ input dataset nào KHÔNG chứa
# v2_X_hindcast.npy (tức không phải dataset dữ liệu hồ gốc) sẽ được coi là kết
# quả từ 1 notebook trước và copy nguyên cây thư mục vào /kaggle/working/.
if os.path.isdir("/kaggle/input"):
    for ds_name in os.listdir("/kaggle/input"):
        ds_path = os.path.join("/kaggle/input", ds_name)
        if not os.path.isdir(ds_path):
            continue
        has_raw_data = any("v2_X_hindcast.npy" in files for _, _, files in os.walk(ds_path))
        if not has_raw_data:
            print(f"[bootstrap] Nạp lại kết quả từ input dataset: {ds_name}")
            shutil.copytree(ds_path, OUTPUT_ROOT, dirs_exist_ok=True)

n_ckpt = sum(1 for _r, _d, _f in os.walk(OUTPUT_ROOT) for fn in _f if fn.startswith("pretrain_pooled"))
print(f"Tổng số checkpoint nhánh/lưu vực tìm thấy sau bootstrap: {n_ckpt}")
if n_ckpt == 0:
    print("CẢNH BÁO: chưa thấy checkpoint nào -- kiểm tra lại đã Add Input đúng output notebook #2 chưa.")
"""

HELPER_CELL = """
BRANCH_GROUPS = list(RIVER_BRANCHES.keys()) + ["A_VUONG_WITH_SONG_CON", "SONG_BUNG_WITH_SONG_CON"]
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

def dir_suffix(season):
    return "" if season == "all" else f"_{season}"

def ckpt_suffix(season):
    return "" if season == "all" else f"_{season.upper()}"

def ckpt_filename(season):
    return "pretrain_pooled.pt" if season == "all" else f"pretrain_pooled_{season}.pt"

# Dò checkpoint đã có (do bootstrap copy từ notebook #2, hoặc tự train lại nếu
# đang chạy gộp trong cùng notebook) -- KHÔNG train lại nhánh/lưu vực ở đây.
BRANCH_CKPT, BASIN_CKPT = {}, {}
for b_name in BRANCH_GROUPS:
    for season in SEASONS:
        p = f"{OUTPUT_ROOT}/_BRANCH_{b_name}{ckpt_suffix(season)}/{ckpt_filename(season)}"
        if os.path.exists(p):
            BRANCH_CKPT[(b_name, season)] = p
for basin_name in RIVER_BASINS_EXPERIMENT:
    bkey = BASIN_KEY[basin_name]
    for season in SEASONS:
        p = f"{OUTPUT_ROOT}/_BASIN_{bkey}{ckpt_suffix(season)}/{ckpt_filename(season)}"
        if os.path.exists(p):
            BASIN_CKPT[(basin_name, season)] = p

print(f"Checkpoint nhánh tìm thấy: {len(BRANCH_CKPT)}/{len(BRANCH_GROUPS) * 3}")
print(f"Checkpoint lưu vực tìm thấy: {len(BASIN_CKPT)}/{len(RIVER_BASINS_EXPERIMENT) * 3}")
"""

FINETUNE_CELL = """
for rid, info in RESERVOIRS.items():
    key = info["name"].replace(" ", "_")
    data_dir = RESERVOIR_DATA_DIRS.get(key)
    if not data_dir:
        continue

    b_own = own_branch(rid)
    basin_own = own_basin(rid)

    for season in SEASONS:
        if b_own and (b_own, season) in BRANCH_CKPT:
            cfg = ReservoirLSTMConfig(rid=rid, reservoir_name=info["name"])
            cfg.artifacts_dir = f"{OUTPUT_ROOT}/finetune_branch{dir_suffix(season)}/{key}"
            metrics_file = f"{cfg.artifacts_dir}/{key}/metrics_test.json"
            if not (SKIP_IF_DONE and os.path.exists(metrics_file)):
                cfg.lr, cfg.epochs, cfg.patience, cfg.warmup_epochs, cfg.batch_size = 3e-4, 10, 4, 2, 256
                print(f"\\n[PHA 5] Fine-tune {info['name']} từ nhánh {b_own} | MÙA {season.upper()}")
                train_reservoir(rid, cfg=cfg, data_dir=data_dir,
                                 init_checkpoint=BRANCH_CKPT[(b_own, season)], season=season)

        if basin_own and (basin_own, season) in BASIN_CKPT:
            cfg = ReservoirLSTMConfig(rid=rid, reservoir_name=info["name"])
            cfg.artifacts_dir = f"{OUTPUT_ROOT}/finetune_basin{dir_suffix(season)}/{key}"
            metrics_file = f"{cfg.artifacts_dir}/{key}/metrics_test.json"
            if not (SKIP_IF_DONE and os.path.exists(metrics_file)):
                cfg.lr, cfg.epochs, cfg.patience, cfg.warmup_epochs, cfg.batch_size = 3e-4, 10, 4, 2, 256
                print(f"\\n[PHA 5] Fine-tune {info['name']} từ lưu vực {basin_own} | MÙA {season.upper()}")
                train_reservoir(rid, cfg=cfg, data_dir=data_dir,
                                 init_checkpoint=BASIN_CKPT[(basin_own, season)], season=season)
"""


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # ReservoirLSTM — [3/4] Fine-tune (Transfer Learning) x 3 mùa

    **PHỤ THUỘC notebook #2** -- phải Add Input output của notebook #2 TRƯỚC
    khi Run All (cell "bootstrap" bên dưới tự nạp checkpoint, không train lại
    nhánh/lưu vực). Output của notebook này là đầu vào cho notebook #4.
    """))

    cells.append(code(SETUP_CELL))
    cells.append(md("## Bootstrap: nạp checkpoint Nhánh/Lưu vực từ notebook #2"))
    cells.append(code(BOOTSTRAP_CELL))

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

    cells.append(md("## Train (1 hồ, hỗ trợ season= + init_checkpoint=)"))
    cells.append(code(read_source("training/train_reservoir.py")))

    cells.append(md("## Helper: hồ -> nhánh/lưu vực, dò checkpoint đã có"))
    cells.append(code(HELPER_CELL))

    cells.append(md("""
    ## Pha 5 — Fine-tune riêng từng hồ từ checkpoint Nhánh VÀ Lưu vực, x 3 mùa (Kịch bản 5)
    Warm-start đúng mùa, fine-tune trên dữ liệu hồ đã lọc cùng mùa (LR=3e-4, 10 epoch).
    """))
    cells.append(code(FINETUNE_CELL))

    cells.append(md("""
    ## Xong Pha 5
    Bấm "Save Version". Ở notebook #4 (Tổng hợp Excel): Add Input -> chọn
    output của notebook #1, #2, VÀ #3 (3 dataset input cùng lúc) để tổng hợp
    đầy đủ.
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
    out_path = os.path.join(HERE, "train_lstm_3_finetune.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(notebook, f, ensure_ascii=True, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()
