"""
Tạo 1 notebook Kaggle train LIÊN TIẾP cả 16 hồ trong 1 lần chạy (thay vì 16
notebook riêng lẻ như generate_notebook.py --rid <id>) — đỡ phải upload/chạy
16 lần thủ công. Đọc source thật từ .py trong project (giống generate_notebook.py)
nên không bị lệch code.

Chạy:
    cd LSTM_Py_Backend_v2
    python kaggle/generate_notebook_all.py
Kết quả: kaggle/train_all_reservoirs.ipynb

Cách dùng trên Kaggle:
    1. Nén cả thư mục datasets/ (chứa 16 thư mục con <Ten_Ho>/v2_*.npy) thành
       1 Kaggle Dataset duy nhất (giữ nguyên cấu trúc thư mục con).
    2. Upload notebook này, Add Input -> attach dataset vừa tạo.
    3. Bật GPU (Settings -> Accelerator -> GPU T4 x2 hoặc P100).
    4. Run All -> mỗi hồ train xong sẽ lưu vào /kaggle/working/<Ten_Ho>/
       (reservoir_lstm.pt, lich_su_training.xlsx, nse_theo_gio.xlsx,
       metrics_test.json) + bảng tổng hợp NSE toàn bộ 16 hồ ở
       /kaggle/working/summary_all_reservoirs.xlsx.
    5. Tải nguyên /kaggle/working/ về, copy đè vào artifacts/ của project.
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
    src = re.sub(r"^from (models|config|data|training)\.\w+ import .*$", "", src, flags=re.MULTILINE)
    src = re.sub(r"^if __name__ == .__main__.:\n(?:^\s{4}.*\n?)*", "", src, flags=re.MULTILINE)
    return src.strip() + "\n"


def build_notebook() -> dict:
    cells = []

    cells.append(md("""
    # ReservoirLSTM — Train Theo Nhánh Sông (Vu Gia & Thu Bồn) & Train Từng Hồ
    **Kiến trúc**: Hindcast Bi-LSTM + Cross-Attention + NWP Embedding + Quantile Head (7 mức)

    Notebook này tự động phân loại 16 hồ thủy điện thành 2 Nhánh Sông chính:
    - **Nhánh Sông Vu Gia (11 hồ)**: `HO DAK MI 2`, `HO DAK MI 3`, `HO DAK MI 4`, `HO SONG BUNG 2`, `HO SONG BUNG 4`, `HO SONG BUNG 4A`, `HO SONG BUNG 5`, `HO SONG BUNG 6`, `HO A VUONG`, `HO SONG CON 2`, `HO ZA HUNG`.
    - **Nhánh Sông Thu Bồn (5 hồ)**: `HO SONG TRANH 2`, `HO SONG TRANH 3`, `HO SONG TRANH 4`, `HO KHE DIEN`, `HO DAK MI 4C`.

    **Các bước thực hiện**:
    1. **Pha 1**: Train 2 model riêng biệt theo 2 nhánh sông (Model Vu Gia & Model Thu Bồn).
    2. **Pha 2**: Đánh giá chỉ số của model Nhánh sông trên tập test từng hồ.
    3. **Pha 3**: Train model độc lập cho từng hồ riêng lẻ (Single Reservoir Model).
    4. **Pha 4**: Tổng hợp và xuất **Bảng so sánh chỉ số NSE, RMSE, MAE, R²** khớp đúng định dạng bảng yêu cầu.
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
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # Tự động quét /kaggle/input hoặc tải từ Hugging Face (Anvo2004/dataset_all_lake)
    HF_REPO_ID = "Anvo2004/dataset_all_lake"
    RESERVOIR_DATA_DIRS = {}

    for _root, _dirs, _files in os.walk("/kaggle/input"):
        if "v2_X_hindcast.npy" in _files:
            RESERVOIR_DATA_DIRS[os.path.basename(_root)] = _root

    if not RESERVOIR_DATA_DIRS:
        print(f"Không tìm thấy data ở /kaggle/input -> Đang tự động tải từ Hugging Face Dataset: '{HF_REPO_ID}'...")
        try:
            from huggingface_hub import hf_hub_download
            import zipfile
            zip_path = hf_hub_download(repo_id=HF_REPO_ID, filename="datasets_all_reservoirs.zip", repo_type="dataset")
            print(f"Tải thành công từ Hugging Face: {zip_path}, đang giải nén...")
            extract_dir = f"{OUTPUT_ROOT}/datasets"
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            for _root, _dirs, _files in os.walk(extract_dir):
                if "v2_X_hindcast.npy" in _files:
                    RESERVOIR_DATA_DIRS[os.path.basename(_root)] = _root
        except Exception as e:
            print(f"Lưu ý Hugging Face: {e}. Vui lòng đảm bảo file 'datasets_all_reservoirs.zip' đã được upload lên repo '{HF_REPO_ID}'.")

    print(f"Tìm thấy {len(RESERVOIR_DATA_DIRS)} thư mục dữ liệu hồ:")
    for k, v in sorted(RESERVOIR_DATA_DIRS.items()):
        print(f"  {k} -> {v}")
    """))


    cells.append(md("## Config (config/reservoirs.py + config/settings.py)"))
    cells.append(code(read_source("config/reservoirs.py")))
    cells.append(code(read_source("config/settings.py")))

    cells.append(md("## Model — StationRainAttention"))
    cells.append(code(read_source("models/station_attention.py")))

    cells.append(md("## Model — ReservoirLSTM"))
    cells.append(code(read_source("models/flood_lstm_v2.py")))

    cells.append(md("## Loss — Quantile + Peak-aware + Coverage"))
    cells.append(code(read_source("models/quantile_loss_v2.py")))

    cells.append(md("## Metrics — NSE, RMSE, MAE, R2 + Event Diagnostics"))
    cells.append(code(read_source("training/event_metrics.py")))

    cells.append(md("## Dataset Loader"))
    cells.append(code(read_source("data/reservoir_dataset.py")))

    cells.append(md("## Single Reservoir Training Function"))
    cells.append(code(read_source("training/train_reservoir.py")))

    cells.append(md("## Pooled & River Branch Training Functions"))
    cells.append(code(read_source("training/pretrain_pooled.py")))

    cells.append(md("""
    ## Pha 1 — Train Model cho 2 Nhánh Sông (Vu Gia & Thu Bồn)
    Pooled Data từ 11 hồ Vu Gia và 5 hồ Thu Bồn, train trong 20 epochs với batch_size=256.
    """))
    cells.append(code("""
    BRANCH_CHECKPOINTS = {}
    FORCE_RETRAIN = True

    for basin_name, rids in RIVER_BASINS.items():
        basin_key = basin_name.upper().replace(" ", "_")
        artifacts_dir = f"{OUTPUT_ROOT}/_BRANCH_{basin_key}"
        ckpt_path = f"{artifacts_dir}/pretrain_pooled.pt"

        # TỰ ĐỘNG PHÁT HIỆN RESUME: Nếu model nhánh sông đã train trước đó -> SKIP train lại
        if not FORCE_RETRAIN and os.path.exists(ckpt_path):
            print(f"[SKIP TRAIN] Model nhánh sông '{basin_name}' đã tồn tại: {ckpt_path}. Bỏ qua train lại!")
            BRANCH_CHECKPOINTS[basin_name] = ckpt_path
            continue

        print("\\n" + "=" * 70)
        print(f"TRAIN MODEL CHO NHÁNH SÔNG: {basin_name.upper()} ({len(rids)} HỒ) - 20 EPOCHS")
        print("=" * 70)

        data_dirs = []
        for rid in rids:
            key = RESERVOIRS[rid]["name"].replace(" ", "_")
            if key in RESERVOIR_DATA_DIRS:
                data_dirs.append(RESERVOIR_DATA_DIRS[key])

        if not data_dirs:
            print(f"Không tìm thấy thư mục data cho nhánh {basin_name}")
            continue

        cfg = ReservoirLSTMConfig(rid=0, reservoir_name=f"BRANCH_{basin_key}")
        cfg.epochs = 20
        cfg.patience = 6
        cfg.warmup_epochs = 2
        cfg.batch_size = 256

        # Train model lưu vực
        ckpt = pretrain_pooled(
            data_dirs=data_dirs,
            cfg=cfg,
            artifacts_dir=artifacts_dir,
        )
        BRANCH_CHECKPOINTS[basin_name] = ckpt
        print(f"Checkpoint {basin_name}: {ckpt}")
    """))

    cells.append(md("""
    ## Pha 2 — Đánh giá Model Nhánh Sông trên từng hồ
    Dùng model nhánh sông (Vu Gia / Thu Bồn) đã train ở Pha 1 để đánh giá độ chính xác trên tập test của từng hồ thuộc nhánh đó.
    """))
    cells.append(code("""
    basin_eval_results = {}

    for rid, info in RESERVOIRS.items():
        basin = info["river_basin"]
        ckpt = BRANCH_CHECKPOINTS.get(basin)
        key = info["name"].replace(" ", "_")
        data_dir = RESERVOIR_DATA_DIRS.get(key)

        if not ckpt or not data_dir:
            print(f"[SKIP] Bỏ qua {info['name']} vì thiếu model/data lưu vực")
            continue

        cfg = ReservoirLSTMConfig(rid=rid, reservoir_name=info["name"])
        cfg.batch_size = 256
        m_basin = evaluate_model_on_reservoir(ckpt, data_dir, cfg=cfg)
        basin_eval_results[rid] = m_basin

        # Lưu file json đánh giá mô hình nhánh sông ra ổ đĩa
        os.makedirs(f"{OUTPUT_ROOT}/{key}", exist_ok=True)
        with open(f"{OUTPUT_ROOT}/{key}_basin_eval.json", "w", encoding="utf-8") as f:
            json.dump(m_basin, f, ensure_ascii=False, indent=2)
        with open(f"{OUTPUT_ROOT}/{key}/metrics_basin.json", "w", encoding="utf-8") as f:
            json.dump(m_basin, f, ensure_ascii=False, indent=2)

        print(f"[{basin}] {info['name']} | NSE_basin: {m_basin['nse']:.4f} | RMSE: {m_basin['rmse']:.1f} m3/s | MAE: {m_basin['mae']:.1f} m3/s")
    """))


    cells.append(md("""
    ## Pha 3 — Fine-tune siêu tốc riêng từng hồ (Single Reservoir Training)
    Warm-start từ model nhánh sông đã train ở Pha 1, fine-tune trong 20 epochs với batch_size=256 (~12-15 giây/hồ).
    """))
    cells.append(code("""
    single_eval_results = {}

    for rid, info in RESERVOIRS.items():
        key = info["name"].replace(" ", "_")
        data_dir = RESERVOIR_DATA_DIRS.get(key)
        if not data_dir:
            continue

        basin = info["river_basin"]
        branch_ckpt = BRANCH_CHECKPOINTS.get(basin)
        cfg = ReservoirLSTMConfig(rid=rid, reservoir_name=info["name"])
        cfg.artifacts_dir = f"{OUTPUT_ROOT}/{key}"
        cfg.batch_size = 256

        metrics_file = f"{cfg.artifacts_dir}/metrics_test.json"
        ckpt_single = f"{cfg.artifacts_dir}/reservoir_lstm.pt"

        # TỰ ĐỘNG PHÁT HIỆN HỒ ĐÃ TRAIN XONG: Nếu có kết quả rồi -> Bỏ qua train lại, load luôn kết quả!
        if not FORCE_RETRAIN and os.path.exists(metrics_file):
            print(f"[SKIP / RESUME] Hồ {info['name']} đã train hoàn tất trước đó. Bỏ qua train lại!")
            with open(metrics_file, "r", encoding="utf-8") as f:
                single_eval_results[rid] = json.load(f)
            continue
        elif not FORCE_RETRAIN and os.path.exists(ckpt_single):
            print(f"[SKIP / RESUME] Tìm thấy checkpoint {ckpt_single}, load lại và đánh giá...")
            single_eval_results[rid] = evaluate_model_on_reservoir(ckpt_single, data_dir, cfg=cfg)
            continue

        print("\\n" + "#" * 70)
        print(f"# FINE-TUNE HỒ ĐỘC LẬP: [{rid}] {info['name']} (Lưu vực {basin}) - 20 EPOCHS")
        print("#" * 70)

        # Fine-tune chớp nhoáng với LR 3e-4, batch_size=256 & 10 epochs (chỉ mất ~5-8 giây/hồ)
        if branch_ckpt is not None:
            cfg.lr = 3e-4
            cfg.epochs = 10
            cfg.patience = 4
            cfg.warmup_epochs = 2
            cfg.batch_size = 256

        m_single = train_reservoir(rid, cfg=cfg, data_dir=data_dir, init_checkpoint=branch_ckpt)
        single_eval_results[rid] = m_single

    """))

    cells.append(md("""
    ## Pha 4 — Tổng hợp & Tạo Bảng So Sánh Theo Dạng Yêu Cầu
    Tổng hợp chỉ số từ cả 2 cách train và trình bày bảng kết quả theo đúng cấu trúc ảnh.
    """))
    cells.append(code("""
    table_rows = []

    # Danh sách thứ tự hiển thị ưu tiên theo ảnh yêu cầu
    custom_order = [
        "HO ZA HUNG", "HO DAK MI 3", "HO SONG BUNG 4", "HO DAK MI 2", "HO DAK MI 4",
        "HO SONG TRANH 4", "HO A VUONG", "HO SONG TRANH 3", "HO SONG TRANH 2",
        "HO SONG BUNG 2", "HO SONG CON 2", "HO KHE DIEN", "HO SONG BUNG 5",
        "HO SONG BUNG 6", "HO SONG BUNG 4A", "HO DAK MI 4C"
    ]

    # Map name -> rid
    name_to_rid = {info["name"]: rid for rid, info in RESERVOIRS.items()}

    for res_name in custom_order:
        rid = name_to_rid.get(res_name)
        if not rid:
            continue

        info = RESERVOIRS[rid]
        basin = info["river_basin"]

        m_single = single_eval_results.get(rid, {})
        m_basin  = basin_eval_results.get(rid, {})

        nse_single_val = m_single.get("nse", float("nan"))
        nse_basin_val  = m_basin.get("nse", float("nan"))

        rmse_single = m_single.get("rmse", float("nan"))
        rmse_basin  = m_basin.get("rmse", float("nan"))
        mae_single  = m_single.get("mae", float("nan"))
        mae_basin   = m_basin.get("mae", float("nan"))

        # Lấy chỉ số theo từng mốc thời gian 3h, 6h, 12h, 24h, 3d, 7d
        h_single = m_single.get("horizons", {})
        h_basin  = m_basin.get("horizons", {})

        # Đánh giá so sánh
        if np.isnan(nse_single_val) and np.isnan(nse_basin_val):
            verdict = "Chưa đủ dữ liệu để so sánh"
            improvement = "Kiểm tra lại dữ liệu đầu vào và các năm quan trắc."
        elif np.isnan(nse_basin_val):
            verdict = f"Train riêng hồ đạt NSE={nse_single_val:.3f}, RMSE={rmse_single:.1f} m3/s."
            improvement = "Hồ có đặc trưng dòng chảy riêng biệt; mô hình hội tụ tốt."
        elif nse_single_val > nse_basin_val + 0.03:
            verdict = f"Train riêng tốt hơn (NSE {nse_single_val:.3f} vs {nse_basin_val:.3f}). RMSE: {rmse_single:.1f} vs {rmse_basin:.1f} m3/s."
            improvement = "Hồ có đặc trưng dòng chảy riêng biệt; ưu tiên fine-tune sâu hơn trên dữ liệu hồ này."
        elif nse_basin_val > nse_single_val + 0.03:
            verdict = f"Train theo nhánh tốt hơn (NSE {nse_basin_val:.3f} vs {nse_single_val:.3f}). RMSE: {rmse_basin:.1f} vs {rmse_single:.1f} m3/s."
            improvement = "Dữ liệu riêng của hồ ít; học chuyển giao (transfer learning) từ nhánh sông giúp mô hình tổng quát hóa tốt hơn."
        else:
            verdict = f"Tương đương nhau (NSE từng hồ: {nse_single_val:.3f}, NSE nhánh: {nse_basin_val:.3f})."
            improvement = "Có thể kết hợp Ensemble (trung bình trọng số) giữa model từng hồ và model nhánh sông."

        row = {
            "Hồ": info["name"],
            "Lưu vực sông": basin,
            "NSE theo train từng hồ": round(nse_single_val, 4) if not np.isnan(nse_single_val) else "N/A",
            "NSE train theo lưu vực sông ( train dữ liệu cho toàn bộ theo nhánh sông Vu Gia-Thu Bồn )": round(nse_basin_val, 4) if not np.isnan(nse_basin_val) else "N/A",
            "Đánh giá kết quả ( train theo cách nào cho chỉ số tốt hơn), thêm các chỉ số cần thiết": verdict,
            "Nếu có cải tiến thì cải tiến những gì để đạt kết quả tốt hơn": improvement,
        }

        # Thêm chỉ số chi tiết từng mốc 3h, 6h, 12h, 24h, 3d, 7d
        for horizon_key in ["3h", "6h", "12h", "24h", "3d", "7d"]:
            hs = h_single.get(horizon_key, {})
            hb = h_basin.get(horizon_key, {})
            row[f"NSE_TừngHồ_{horizon_key}"] = hs.get("nse", "N/A")
            row[f"RSE_TừngHồ_{horizon_key}"] = hs.get("rse", "N/A")
            row[f"RMSE_TừngHồ_{horizon_key}"] = hs.get("rmse", "N/A")

            row[f"NSE_Nhánh_{horizon_key}"] = hb.get("nse", "N/A")
            row[f"RSE_Nhánh_{horizon_key}"] = hb.get("rse", "N/A")
            row[f"RMSE_Nhánh_{horizon_key}"] = hb.get("rmse", "N/A")

        table_rows.append(row)

    result_df = pd.DataFrame(table_rows)


    # In ra bảng Markdown thu gọn
    main_cols = [
        "Hồ", "Lưu vực sông", "NSE theo train từng hồ",
        "NSE train theo lưu vực sông ( train dữ liệu cho toàn bộ theo nhánh sông Vu Gia-Thu Bồn )",
        "Đánh giá kết quả ( train theo cách nào cho chỉ số tốt hơn), thêm các chỉ số cần thiết",
        "Nếu có cải tiến thì cải tiến những gì để đạt kết quả tốt hơn"
    ]
    print("=" * 80)
    print("BẢNG TỔNG HỢP KẾT QUẢ DANH NGHĨA CHÍNH:")
    print("=" * 80)
    print(result_df[main_cols].to_string(index=False))

    # In ra bảng chi tiết theo mốc dự báo 3h, 6h, 12h, 24h
    horizon_cols = ["Hồ", "Lưu vực sông"] + [c for c in result_df.columns if "_" in c]
    print("\n" + "=" * 80)
    print("BẢNG CHI TIẾT THEO TỪNG MỐC DỰ BÁO (3H, 6H, 12H, 24H):")
    print("=" * 80)
    print(result_df[horizon_cols].to_string(index=False))

    # Lưu file Excel với 2 sheet
    excel_path = f"{OUTPUT_ROOT}/bang_so_sanh_nse_nhanh_song.xlsx"
    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        result_df[main_cols].to_excel(writer, sheet_name="Tong_Hop", index=False)
        result_df[horizon_cols].to_excel(writer, sheet_name="Chi_Tiet_Moc_Thoi_Gian", index=False)
        result_df.to_excel(writer, sheet_name="Day_Du_Toan_Bo", index=False)

    print(f"\\nĐã xuất kết quả so sánh ra file Excel (chứa cả sheet Tổng hợp và Chi tiết mốc 3h-24h): {excel_path}")
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
    out_path = os.path.join(HERE, "train_all_reservoirs.ipynb")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(notebook, f, ensure_ascii=True, indent=1)
    print(f"Created: {out_path}")
    print(f"Size   : {os.path.getsize(out_path)/1024:.1f} KB")


if __name__ == "__main__":
    main()

