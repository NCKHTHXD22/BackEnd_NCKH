# kaggle/generate_notebook_2_branch_basin.py
"""
Notebook Kaggle #2/4 (LSTM) -- Nhánh sông + Lưu vực sông: pooled 4 nhánh + 2
biến thể Sông Côn 2 + 2 lưu vực thực nghiệm, mỗi nhóm x 3 mùa (18 + 6 = 24
lượt train), rồi đánh giá từng model lên tập test của mỗi hồ thành viên.
ĐỘC LẬP hoàn toàn -- chỉ cần dataset gốc. Chạy song song được với notebook #1.

Output của notebook này là ĐẦU VÀO BẮT BUỘC cho notebook #3 (Fine-tune) --
phải "Save Version" xong rồi attach output của nó vào notebook #3 trước khi
chạy notebook #3.

Chạy:
    cd LSTM_Py_Backend_v2
    python kaggle/generate_notebook_2_branch_basin.py
Kết quả: kaggle/train_lstm_2_branch_basin.ipynb
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

def rids_for_branch(b_name):
    if b_name in RIVER_BRANCHES:
        return RIVER_BRANCHES[b_name]
    if b_name == "A_VUONG_WITH_SONG_CON":
        return SONG_CON_2_VARIANTS["A_VUONG"]
    if b_name == "SONG_BUNG_WITH_SONG_CON":
        return SONG_CON_2_VARIANTS["SONG_BUNG"]
    raise ValueError(b_name)

def data_dirs_for(rids):
    dirs = []
    for rid in rids:
        key = RESERVOIRS[rid]["name"].replace(" ", "_")
        if key in RESERVOIR_DATA_DIRS:
            dirs.append(RESERVOIR_DATA_DIRS[key])
    return dirs

def dir_suffix(season):
    return "" if season == "all" else f"_{season}"

def ckpt_suffix(season):
    return "" if season == "all" else f"_{season.upper()}"

def ckpt_filename(season):
    return "pretrain_pooled.pt" if season == "all" else f"pretrain_pooled_{season}.pt"
"""

TRAIN_BRANCH_CELL = """
BRANCH_CKPT = {}
for b_name in BRANCH_GROUPS:
    for season in SEASONS:
        artifacts_dir = f"{OUTPUT_ROOT}/_BRANCH_{b_name}{ckpt_suffix(season)}"
        ckpt_path = f"{artifacts_dir}/{ckpt_filename(season)}"
        if SKIP_IF_DONE and os.path.exists(ckpt_path):
            print(f"[SKIP/RESUME] Nhánh {b_name} ({season}) đã train.")
            BRANCH_CKPT[(b_name, season)] = ckpt_path
            continue

        dirs = data_dirs_for(rids_for_branch(b_name))
        if not dirs:
            print(f"[SKIP] Nhánh {b_name}: không có data")
            continue

        print("\\n" + "=" * 70)
        print(f"PHA 2 - TRAIN NHÁNH: {b_name} ({len(dirs)} hồ) | MÙA {season.upper()}")
        print("=" * 70)
        cfg = ReservoirLSTMConfig(rid=0, reservoir_name=f"BRANCH_{b_name}")
        cfg.epochs, cfg.patience, cfg.warmup_epochs, cfg.batch_size = 20, 6, 2, 256
        ckpt = pretrain_pooled(data_dirs=dirs, cfg=cfg, artifacts_dir=artifacts_dir, season=season)
        BRANCH_CKPT[(b_name, season)] = ckpt
"""

TRAIN_BASIN_CELL = """
BASIN_CKPT = {}
for basin_name, rids in RIVER_BASINS_EXPERIMENT.items():
    bkey = BASIN_KEY[basin_name]
    for season in SEASONS:
        artifacts_dir = f"{OUTPUT_ROOT}/_BASIN_{bkey}{ckpt_suffix(season)}"
        ckpt_path = f"{artifacts_dir}/{ckpt_filename(season)}"
        if SKIP_IF_DONE and os.path.exists(ckpt_path):
            print(f"[SKIP/RESUME] Lưu vực {basin_name} ({season}) đã train.")
            BASIN_CKPT[(basin_name, season)] = ckpt_path
            continue

        dirs = data_dirs_for(rids)
        if not dirs:
            continue

        print("\\n" + "=" * 70)
        print(f"PHA 3 - TRAIN LƯU VỰC: {basin_name} ({len(dirs)} hồ) | MÙA {season.upper()}")
        print("=" * 70)
        cfg = ReservoirLSTMConfig(rid=0, reservoir_name=f"BASIN_{bkey}")
        cfg.epochs, cfg.patience, cfg.warmup_epochs, cfg.batch_size = 20, 6, 2, 256
        ckpt = pretrain_pooled(data_dirs=dirs, cfg=cfg, artifacts_dir=artifacts_dir, season=season)
        BASIN_CKPT[(basin_name, season)] = ckpt
"""

EVAL_CELL = """
for rid, info in RESERVOIRS.items():
    key = info["name"].replace(" ", "_")
    data_dir = RESERVOIR_DATA_DIRS.get(key)
    if not data_dir:
        continue

    b_own = own_branch(rid)
    basin_own = own_basin(rid)

    for season in SEASONS:
        if b_own and (b_own, season) in BRANCH_CKPT:
            out_path = f"{OUTPUT_ROOT}/{key}_branch_eval{dir_suffix(season)}.json"
            if not (SKIP_IF_DONE and os.path.exists(out_path)):
                cfg = ReservoirLSTMConfig(rid=rid, reservoir_name=info["name"]); cfg.batch_size = 256
                m = evaluate_model_on_reservoir(BRANCH_CKPT[(b_own, season)], data_dir, cfg=cfg)
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(m, f, ensure_ascii=False, indent=2)
                print(f"[branch_eval:{season}] {info['name']} (nhánh {b_own}) NSE={m['nse']:.4f}")

        if basin_own and (basin_own, season) in BASIN_CKPT:
            out_path = f"{OUTPUT_ROOT}/{key}_basin_eval{dir_suffix(season)}.json"
            if not (SKIP_IF_DONE and os.path.exists(out_path)):
                cfg = ReservoirLSTMConfig(rid=rid, reservoir_name=info["name"]); cfg.batch_size = 256
                m = evaluate_model_on_reservoir(BASIN_CKPT[(basin_own, season)], data_dir, cfg=cfg)
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(m, f, ensure_ascii=False, indent=2)
                print(f"[basin_eval:{season}] {info['name']} (lưu vực {basin_own}) NSE={m['nse']:.4f}")

# Sông Côn 2: đánh giá riêng 2 biến thể thử nghiệm (season=all, đúng phạm vi Kịch bản 2)
sc2_info = RESERVOIRS[16]
sc2_key = sc2_info["name"].replace(" ", "_")
sc2_dir = RESERVOIR_DATA_DIRS.get(sc2_key)
if sc2_dir:
    for variant in ["A_VUONG_WITH_SONG_CON", "SONG_BUNG_WITH_SONG_CON"]:
        if (variant, "all") not in BRANCH_CKPT:
            continue
        out_path = f"{OUTPUT_ROOT}/{sc2_key}_{variant}_eval.json"
        if SKIP_IF_DONE and os.path.exists(out_path):
            continue
        cfg = ReservoirLSTMConfig(rid=16, reservoir_name=sc2_info["name"]); cfg.batch_size = 256
        m = evaluate_model_on_reservoir(BRANCH_CKPT[(variant, "all")], sc2_dir, cfg=cfg)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False, indent=2)
        print(f"[song_con_2] biến thể {variant}: NSE={m['nse']:.4f}")
"""


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # ReservoirLSTM — [2/4] Nhánh Sông + Lưu Vực Sông (x 3 mùa) + Đánh giá

    Notebook ĐỘC LẬP -- chỉ cần dataset gốc. Chạy song song được với notebook
    #1 (Standalone). Output của notebook này là ĐẦU VÀO BẮT BUỘC cho notebook
    #3 (Fine-tune) và notebook #4 (Tổng hợp Excel).
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

    cells.append(md("## Train (1 hồ) / Pooled (nhánh, lưu vực) functions"))
    cells.append(code(read_source("training/train_reservoir.py")))
    cells.append(code(read_source("training/pretrain_pooled.py")))

    cells.append(md("## Helper: hồ -> nhánh sông / lưu vực nó thuộc về"))
    cells.append(code(HELPER_CELL))

    cells.append(md("""
    ## Pha 2 — Nhánh sông (4 nhánh + 2 biến thể Sông Côn 2) x 3 mùa — Kịch bản 1 + 2 + 4
    20 epochs / batch_size=256 (đã kiểm chứng đủ hội tụ nhờ oversampling + cosine LR).
    """))
    cells.append(code(TRAIN_BRANCH_CELL))

    cells.append(md("""
    ## Pha 3 — Lưu vực sông (2 lưu vực thực nghiệm) x 3 mùa — Kịch bản 3 + 4
    Vu Gia = nhánh Sông Tranh (2/3/4) + Khe Diên. Thu Bồn = 12 hồ còn lại.
    """))
    cells.append(code(TRAIN_BASIN_CELL))

    cells.append(md("""
    ## Pha 4 — Đánh giá model Nhánh/Lưu vực trên tập test của từng hồ thành viên, x 3 mùa
    """))
    cells.append(code(EVAL_CELL))

    cells.append(md("""
    ## Xong Pha 2+3+4
    Bấm "Save Version". Ở notebook #3 (Fine-tune) và #4 (Tổng hợp Excel): Add
    Input -> chọn output của CHÍNH notebook này để nạp lại checkpoint/eval mà
    không cần train lại.
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
    out_path = os.path.join(HERE, "train_lstm_2_branch_basin.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(notebook, f, ensure_ascii=True, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()
