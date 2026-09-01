# kaggle/generate_notebook_master.py
"""
Notebook Kaggle TỔNG HỢP -- chạy đủ 5 phương pháp x 3 mùa (Cả năm / Mùa Khô
T1-8 / Mùa Mưa T9-12) trong 1 lần Run All (resumable qua các Pha nếu bị ngắt
giữa chừng):

  Pha 1  Standalone      -- train riêng từng hồ (16 hồ), KHÔNG warm-start.
                            3 biến thể mùa/hồ (all/dry/rainy). Baseline gốc.
  Pha 2  Nhánh sông       -- pooled 4 nhánh (A Vương / Sông Bung / Đắk Mi /
                            Sông Tranh+Khe Diên) + 2 biến thể thử nghiệm Sông
                            Côn 2, mỗi nhóm x 3 mùa. (Kịch bản 1 + 2 + 4)
  Pha 3  Lưu vực sông     -- pooled 2 lưu vực thực nghiệm Vu Gia/Thu Bồn (đúng
                            định nghĩa người dùng: Vu Gia = nhánh Sông Tranh +
                            Khe Diên), mỗi nhóm x 3 mùa. (Kịch bản 3 + 4)
  Pha 4  Đánh giá Pha 2+3 -- evaluate_model_on_reservoir() từng hồ trên đúng
                            model nhánh/lưu vực (x mùa) nó thuộc về + 2 biến
                            thể Sông Côn 2 (đánh giá riêng trên rid=16).
  Pha 5  Fine-tune        -- warm-start init_checkpoint=model nhánh/lưu vực
                            ĐÚNG MÙA, fine-tune riêng từng hồ trên dữ liệu ĐÃ
                            LỌC THEO MÙA tương ứng (LR thấp, ít epoch). Chạy
                            SAU Pha 2+3 vì cần checkpoint dry/rainy đã có sẵn.
                            (Kịch bản 5, gộp mùa vào luôn -- không tách riêng)
  Pha 6  Tổng hợp Excel   -- main_generate_excel_summary.py::generate_summary()
                            xuất bang_so_sanh_nse_tong_hop.xlsx (4 sheet, sheet
                            "Chi_Tiet_Theo_Mua" phủ đủ cả 5 phương pháp x 3 mùa).

Mỗi bước train/eval đều tự SKIP nếu output đã tồn tại (SKIP_IF_DONE=True) --
an toàn khi Kaggle session bị ngắt giữa chừng, chỉ cần "Save Version" output
làm input cho session sau rồi Run All lại là tiếp tục đúng chỗ dở dang.

Quy ước đặt tên thư mục/file theo mùa (season in "all"/"dry"/"rainy"):
  - season="all"           -> KHÔNG hậu tố (standalone/, finetune_branch/, ...)
  - season="dry"/"rainy"   -> hậu tố "_dry"/"_rainy" (standalone_dry/, ...)
  - checkpoint nhánh/lưu vực: hậu tố "_DRY"/"_RAINY" viết hoa (khớp
    train_river_branch_model()/pretrain_pooled() -- xem training/pretrain_pooled.py)

Chạy:
    cd LSTM_Py_Backend_v2
    python kaggle/generate_notebook_master.py
Kết quả: kaggle/train_master_pipeline.ipynb

Cách dùng trên Kaggle:
    1. Nén datasets/ (16 thư mục con <Ten_Ho>/v2_*.npy) thành 1 Kaggle Dataset,
       Add Input -> attach vào notebook.
    2. Bật GPU (T4 x2 hoặc P100).
    3. Run All. Pha 1 (16 hồ x 3 mùa, tới 100 epoch/biến thể) là bước TỐN THỜI
       GIAN NHẤT -- nếu quota GPU hạn chế, có thể set FORCE_RETRAIN=False (mặc
       định) và chạy nhiều session, mỗi lần Run All sẽ resume từ chỗ chưa train.
    4. Toàn bộ output nằm ở /kaggle/working/ -- tải về, giải nén đè vào
       LSTM_Py_Backend_v2/ của project rồi chạy lại
       `python main_generate_excel_summary.py` nếu muốn tổng hợp lại ở local.
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
    """Đọc 1 file .py thật trong project, bỏ import nội bộ (đã nhúng ở cell trước)."""
    with open(os.path.join(ROOT, rel_path), "r", encoding="utf-8") as f:
        src = f.read()
    src = re.sub(r"^from \.\w+ import .*$", "", src, flags=re.MULTILINE)
    # Import nhiều dòng dạng "from x.y import (\n  a, b,\n)" phải xóa NGUYÊN
    # KHỐI trước (dấu ngoặc khiến pattern 1-dòng bên dưới chỉ xóa dòng đầu,
    # để lại phần thân + ")" mồ côi -> lỗi cú pháp khi ghép các cell lại).
    src = re.sub(r"^from (models|config|data|training)\.\w+ import \([^)]*\)\n?", "", src, flags=re.MULTILINE)
    src = re.sub(r"^from (models|config|data|training)\.\w+ import .*$", "", src, flags=re.MULTILINE)
    src = re.sub(r"^if __name__ == .__main__.:\n(?:^\s{4}.*\n?)*", "", src, flags=re.MULTILINE)
    return src.strip() + "\n"


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # ReservoirLSTM — Pipeline Tổng Hợp: Standalone / Nhánh Sông / Lưu Vực / Fine-tune × 3 Mùa

    Chạy đủ 5 phương pháp train, MỖI phương pháp có 3 biến thể mùa (Cả năm /
    Mùa Khô T1-8 / Mùa Mưa T9-12), tự động resume nếu bị ngắt giữa chừng. Xem
    chi tiết từng Pha ở docstring đầu file generator
    (`kaggle/generate_notebook_master.py`).
    """))

    cells.append(code("""
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
    """))

    cells.append(md("## Config (config/reservoirs.py + config/settings.py)"))
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

    cells.append(md("## Train (1 hồ, hỗ trợ season=) / Pooled (nhánh, lưu vực) / Fine-tune functions"))
    cells.append(code(read_source("training/train_reservoir.py")))
    cells.append(code(read_source("training/pretrain_pooled.py")))

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

    def data_dirs_for(rids):
        dirs = []
        for rid in rids:
            key = RESERVOIRS[rid]["name"].replace(" ", "_")
            if key in RESERVOIR_DATA_DIRS:
                dirs.append(RESERVOIR_DATA_DIRS[key])
        return dirs

    def dir_suffix(season):   # dùng cho tên thư mục standalone_.../finetune_...
        return "" if season == "all" else f"_{season}"

    def ckpt_suffix(season):  # dùng cho tên thư mục _BRANCH_.../_BASIN_... (khớp pretrain_pooled.py)
        return "" if season == "all" else f"_{season.upper()}"

    def ckpt_filename(season):
        return "pretrain_pooled.pt" if season == "all" else f"pretrain_pooled_{season}.pt"
    """))

    # ── Pha 1: Standalone ────────────────────────────────────────────────────
    cells.append(md("""
    ## Pha 1 — Standalone (train riêng từng hồ, baseline gốc, KHÔNG warm-start) x 3 mùa
    Dùng cấu hình mặc định (`epochs=100`, `patience=30`) -- giống hệt cách baseline
    gốc từng được train, để số liệu so sánh về sau công bằng. Đây là bước TỐN
    THỜI GIAN NHẤT trong cả pipeline (16 hồ x 3 mùa = 48 lượt train).
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
            cfg.artifacts_dir = f"{OUTPUT_ROOT}/standalone{dir_suffix(season)}/{key}"
            metrics_file = f"{cfg.artifacts_dir}/{key}/metrics_test.json"

            if SKIP_IF_DONE and os.path.exists(metrics_file):
                print(f"[SKIP/RESUME] {info['name']} ({season}) đã train standalone xong.")
                continue

            print("\\n" + "#" * 70)
            print(f"# PHA 1 - STANDALONE: [{rid}] {info['name']} | MÙA {season.upper()}")
            print("#" * 70)
            train_reservoir(rid, cfg=cfg, data_dir=data_dir, init_checkpoint=None, season=season)
    """))

    # ── Pha 2: Nhánh sông ────────────────────────────────────────────────────
    cells.append(md("""
    ## Pha 2 — Nhánh sông (4 nhánh + 2 biến thể Sông Côn 2) x 3 mùa — Kịch bản 1 + 2 + 4
    20 epochs / batch_size=256 (giống cấu hình đã kiểm chứng ở lần chạy trước).
    """))
    cells.append(code("""
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
    """))

    # ── Pha 3: Lưu vực ───────────────────────────────────────────────────────
    cells.append(md("""
    ## Pha 3 — Lưu vực sông (2 lưu vực thực nghiệm) x 3 mùa — Kịch bản 3 + 4
    Vu Gia = nhánh Sông Tranh (2/3/4) + Khe Diên. Thu Bồn = 12 hồ còn lại
    (đúng định nghĩa người dùng yêu cầu — NGƯỢC với địa lý thủy văn thật,
    xem `RIVER_BASINS_NATURAL` nếu muốn đối chiếu ranh giới lưu vực thật).
    """))
    cells.append(code("""
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
    """))

    # ── Pha 4: Đánh giá Pha 2+3 trên từng hồ ────────────────────────────────
    cells.append(md("""
    ## Pha 4 — Đánh giá model Nhánh/Lưu vực trên tập test của từng hồ thành viên, x 3 mùa
    Ghi `<Ten_Ho>_branch_eval[_dry|_rainy].json` / `<Ten_Ho>_basin_eval[_dry|_rainy].json`
    -- đúng tên file `main_generate_excel_summary.py` cần đọc. Riêng Sông Côn 2
    (rid=16) được đánh giá thêm trên cả 2 biến thể thử nghiệm (Kịch bản 2).
    """))
    cells.append(code("""
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
    """))

    # ── Pha 5: Fine-tune (transfer learning) ────────────────────────────────
    cells.append(md("""
    ## Pha 5 — Fine-tune riêng từng hồ từ checkpoint Nhánh VÀ Lưu vực, x 3 mùa (Kịch bản 5)
    Warm-start từ checkpoint ĐÚNG MÙA đã train ở Pha 2/3, fine-tune trên dữ liệu
    hồ ĐÃ LỌC THEO CÙNG MÙA đó (LR thấp 3e-4, 10 epoch). Chạy sau Pha 2+3 vì
    cần checkpoint dry/rainy sẵn có. Mỗi hồ có 2 nguồn (nhánh/lưu vực) x 3 mùa
    = tối đa 6 kết quả fine-tune để so sánh.
    """))
    cells.append(code("""
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
    """))

    # ── Pha 6: Tổng hợp Excel ────────────────────────────────────────────────
    cells.append(md("## Pha 6 — Tổng hợp toàn bộ kết quả ra 1 file Excel"))
    cells.append(code(read_source("main_generate_excel_summary.py")))
    cells.append(code("""
    generate_summary(root=OUTPUT_ROOT)
    """))

    cells.append(md("""
    ## Tải kết quả
    Toàn bộ `/kaggle/working/` (checkpoint .pt, metrics json, và
    `bang_so_sanh_nse_tong_hop.xlsx`) -- tải về, giải nén đè vào
    `LSTM_Py_Backend_v2/` của project.
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
    out_path = os.path.join(HERE, "train_master_pipeline.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(notebook, f, ensure_ascii=True, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()
