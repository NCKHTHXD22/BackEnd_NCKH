# kaggle/generate_notebook_master.py
"""
Notebook Kaggle TỔNG HỢP cho XGBoost -- chạy đủ 5 phương pháp x 3 mùa (Cả năm
/ Mùa Khô T1-8 / Mùa Mưa T9-12), song song với
LSTM_Py_Backend_v2/kaggle/generate_notebook_master.py, resumable qua từng Pha:

  Pha 1  Single          -- train riêng từng hồ (16 hồ x 72 booster), KHÔNG
                            warm-start, x 3 mùa. Baseline gốc.
  Pha 2  Nhánh sông       -- pooled 4 nhánh + 2 biến thể Sông Côn 2, x 3 mùa.
                            (Kịch bản 1 + 2 + 4)
  Pha 3  Lưu vực sông     -- pooled 2 lưu vực thực nghiệm Vu Gia/Thu Bồn, x 3
                            mùa. (Kịch bản 3 + 4)
  Pha 4  Fine-tune        -- continue-boosting (xgb.train(..., xgb_model=...))
                            từ booster nhánh/lưu vực ĐÚNG MÙA (Pha 2/3), tiếp
                            tục train thêm trên dữ liệu 1 hồ ĐÃ LỌC CÙNG MÙA.
                            Tương đương Transfer Learning bên LSTM. Chạy SAU
                            Pha 2+3 vì cần booster dry/rainy sẵn có. (Kịch bản 5)
  Pha 5  Tổng hợp Excel   -- main_generate_excel_summary.py::generate_summary()

KHÔNG cần GPU -- XGBoost tree_method="hist" chạy CPU thuần, nhanh hơn nhiều so
với LSTM nên toàn bộ pipeline thường xong trong 1 session.

Quy ước đặt tên theo mùa (season in "all"/"dry"/"rainy"), khớp với train_xgb_dataset()
season= và cách LSTM đặt tên: season="all" -> KHÔNG hậu tố, season="dry"/"rainy"
-> hậu tố "_dry"/"_rainy" (cả artifact_dir lẫn json_out_dir).

Chạy:
    cd XGBoost_Py_Backend
    python kaggle/generate_notebook_master.py
Kết quả: kaggle/train_xgb_master.ipynb

Cách dùng trên Kaggle: giống hệt kaggle/generate_notebook.py cũ (README cùng
thư mục) -- KHÔNG cần bật GPU, có thể attach dataset LSTM_Py_Backend_v2/datasets/
hoặc để tự tải từ Hugging Face.
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
    # XGBoost — Pipeline Tổng Hợp: Single / Nhánh Sông / Lưu Vực / Fine-tune × 3 Mùa

    72 booster (24 horizon x 3 quantile P10/P50/P90) mỗi nhóm. Không cần GPU.
    Xem chi tiết từng Pha ở docstring đầu file generator
    (`kaggle/generate_notebook_master.py`).
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

    SKIP_IF_DONE = True  # False = train lại từ đầu, bỏ qua toàn bộ resume-check
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

    cells.append(md("## Build dataset 1 lần duy nhất (tái dùng cho toàn bộ train + evaluate)"))
    cells.append(code("""
    X_all, y_all, rid_all, ts_all = build_tabular_dataset()
    DATA_ALL = (X_all, y_all, rid_all, ts_all)
    """))

    cells.append(md("## Helper: hồ -> nhánh sông / lưu vực nó thuộc về, tiện ích đặt tên theo mùa"))
    cells.append(code("""
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

    def season_group(base, season):
        return base if season == "all" else f"{base}_{season}"

    def is_done(art_dir):
        return os.path.exists(f"{art_dir}/h24_q90.json")
    """))

    # ── Pha 1: Single ────────────────────────────────────────────────────────
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

    # ── Pha 2: Nhánh sông ────────────────────────────────────────────────────
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

    # ── Pha 3: Lưu vực sông ──────────────────────────────────────────────────
    cells.append(md("""
    ## Pha 3 — Lưu vực sông (2 lưu vực thực nghiệm) x 3 mùa — Kịch bản 3 + 4
    Vu Gia = nhánh Sông Tranh (2/3/4) + Khe Diên. Thu Bồn = 12 hồ còn lại
    (đúng định nghĩa người dùng yêu cầu).
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

    # ── Pha 4: Fine-tune (continue-boosting) ────────────────────────────────
    cells.append(md("""
    ## Pha 4 — Fine-tune riêng từng hồ bằng CONTINUE-BOOSTING, x 3 mùa (Kịch bản 5)
    Tương đương Transfer Learning bên LSTM: nạp 72 booster ĐÚNG MÙA đã train ở
    Pha 2/3 (`xgb_model=...`), boost thêm trên dữ liệu 1 hồ ĐÃ LỌC CÙNG MÙA
    thay vì train lại từ đầu. Chạy sau Pha 2+3 vì cần booster dry/rainy sẵn có.
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

    # ── Pha 5: Tổng hợp Excel ────────────────────────────────────────────────
    cells.append(md("## Pha 5 — Tổng hợp toàn bộ kết quả ra 1 file Excel"))
    cells.append(code(read_source("main_generate_excel_summary.py")))
    cells.append(code("""
    generate_summary(root=".")
    """))

    cells.append(md("""
    ## Tải kết quả
    Toàn bộ thư mục làm việc (`artifacts/`, `eval_json/`, và
    `bang_so_sanh_nse_tong_hop_xgb.xlsx`) -- tải về, giải nén đè vào
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
    out_path = os.path.join(HERE, "train_xgb_master.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()
