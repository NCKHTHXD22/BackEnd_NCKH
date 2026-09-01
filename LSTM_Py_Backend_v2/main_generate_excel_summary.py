# main_generate_excel_summary.py
"""
Tổng hợp kết quả train theo ĐÚNG 5 phương pháp đã thống nhất, MỖI phương pháp
đều có biến thể Cả năm / Mùa Khô (T1-8) / Mùa Mưa (T9-12) (xem
kaggle/generate_notebook_master.py):
  A. Standalone      -- train riêng từng hồ, không warm-start
  B1. Nhánh sông      -- pooled 4 nhánh (+ 2 biến thể Sông Côn 2), CHƯA fine-tune
  B2. Lưu vực sông    -- pooled 2 lưu vực thực nghiệm (Vu Gia/Thu Bồn), CHƯA fine-tune
  C1. Fine-tune Nhánh -- warm-start từ B1, fine-tune riêng từng hồ (Transfer Learning)
  C2. Fine-tune Lưu vực -- warm-start từ B2, fine-tune riêng từng hồ (Transfer Learning)
  + bảng riêng cho thử nghiệm Sông Côn 2 (Kịch bản 2)

Đọc đúng layout do kaggle/generate_notebook_master.py ghi ra (xem docstring ở
đó cho cấu trúc thư mục đầy đủ). Gọi generate_summary(root=...) -- root mặc
định là thư mục chứa chính file này (chạy local sau khi tải kết quả Kaggle về
và giải nén đè vào đây), nhưng có thể truyền root=OUTPUT_ROOT ("/kaggle/working")
để chạy thẳng trong notebook, xuất Excel luôn trên Kaggle không cần tải về rồi
chạy lại.

Chạy: python main_generate_excel_summary.py
"""

import os
import sys
import json
import numpy as np
import pandas as pd

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    ROOT_DEFAULT = os.path.dirname(os.path.abspath(__file__))
except NameError:
    # __file__ không tồn tại khi source này bị inject thẳng vào 1 cell notebook
    # (xem kaggle/generate_notebook_master.py) -- không sao vì notebook luôn
    # gọi generate_summary(root=OUTPUT_ROOT) tường minh, không dùng ROOT_DEFAULT.
    ROOT_DEFAULT = os.getcwd()

from config.reservoirs import RESERVOIRS, RIVER_BRANCHES, RIVER_BASINS_EXPERIMENT

CUSTOM_ORDER = [
    "HO ZA HUNG", "HO DAK MI 3", "HO SONG BUNG 4", "HO DAK MI 2", "HO DAK MI 4",
    "HO SONG TRANH 4", "HO A VUONG", "HO SONG TRANH 3", "HO SONG TRANH 2",
    "HO SONG BUNG 2", "HO SONG CON 2", "HO KHE DIEN", "HO SONG BUNG 5",
    "HO SONG BUNG 6", "HO SONG BUNG 4A", "HO DAK MI 4C",
]

SEASON_LABEL = {"all": "Cả năm", "dry": "Mùa Khô (model chuyên mùa)", "rainy": "Mùa Mưa (model chuyên mùa)"}


def get_branch_for_reservoir(rid: int) -> str:
    for b_name, r_list in RIVER_BRANCHES.items():
        if rid in r_list:
            return b_name
    if rid == 16:
        return "SONG_CON_2 (A_VUONG/SONG_BUNG)"
    return "KHAC"


def get_basin_for_reservoir(rid: int) -> str:
    for b_name, r_list in RIVER_BASINS_EXPERIMENT.items():
        if rid in r_list:
            return b_name
    return "KHAC"


def _load_json(path: str) -> dict:
    if path and os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _nested_metrics_path(root: str, subdir: str, key: str, season: str = "all") -> str:
    """<root>/<subdir>[_dry|_rainy]/<key>/<key>/metrics_test.json -- train_reservoir()
    tự nối thêm 1 lớp <key> nữa vào cfg.artifacts_dir đã truyền (xem
    training/train_reservoir.py). Dùng cho Standalone và Fine-tune (season="all"
    -> không hậu tố, khớp quy ước đã có từ trước khi thêm biến thể mùa)."""
    suffix = "" if season == "all" else f"_{season}"
    return os.path.join(root, f"{subdir}{suffix}", key, key, "metrics_test.json")


def _flat_eval_path(root: str, key: str, kind: str, season: str) -> str:
    """<root>/<key>_<branch|basin>_eval[_dry|_rainy].json -- xem
    evaluate_model_on_reservoir() gọi trong Pha 4 của notebook master."""
    suffix = f"_{season}" if season != "all" else ""
    return os.path.join(root, f"{key}_{kind}_eval{suffix}.json")


def _fnum(m: dict, field: str = "nse"):
    v = m.get(field, float("nan")) if m else float("nan")
    return float("nan") if v is None else v


def _season_field(m: dict, season: str, base: str = "nse"):
    """season='all' -> field <base> (tổng, model train cả năm).
    season='dry'/'rainy' -> field <base>_dry_season/<base>_rainy_season (model
    CHUYÊN train riêng mùa đó, đo đúng trên lát mùa nó được train)."""
    if season == "all":
        return _fnum(m, base)
    return _fnum(m, f"{base}_{season}_season")


def _fmt(v):
    return round(v, 4) if isinstance(v, (int, float)) and not np.isnan(v) else "N/A"


def generate_summary(root: str = None) -> str:
    root = root or ROOT_DEFAULT
    print("=" * 90)
    print("TỔNG HỢP SO SÁNH 5 PHƯƠNG PHÁP TRAIN x 3 MÙA (CẢ NĂM / KHÔ / MƯA)")
    print(f"Đọc dữ liệu từ: {root}")
    print("=" * 90)

    name_to_rid = {info["name"]: rid for rid, info in RESERVOIRS.items()}
    main_rows, detail_rows, horizon_rows = [], [], []

    for res_name in CUSTOM_ORDER:
        rid = name_to_rid.get(res_name)
        if not rid:
            continue
        info = RESERVOIRS[rid]
        key = info["name"].replace(" ", "_")
        branch_name = get_branch_for_reservoir(rid)
        basin_name = get_basin_for_reservoir(rid)

        # ── Bảng đầu: chỉ số Cả năm của 5 phương pháp (headline so sánh) ──────
        m_standalone = _load_json(_nested_metrics_path(root, "standalone", key, "all"))
        m_branch = _load_json(_flat_eval_path(root, key, "branch", "all"))
        m_basin = _load_json(_flat_eval_path(root, key, "basin", "all"))
        m_ft_branch = _load_json(_nested_metrics_path(root, "finetune_branch", key, "all"))
        m_ft_basin = _load_json(_nested_metrics_path(root, "finetune_basin", key, "all"))

        method_nse = {
            "Standalone": _fnum(m_standalone),
            "Nhánh (pooled)": _fnum(m_branch),
            "Lưu vực (pooled)": _fnum(m_basin),
            "Fine-tune Nhánh": _fnum(m_ft_branch),
            "Fine-tune Lưu vực": _fnum(m_ft_basin),
        }
        available = {k: v for k, v in method_nse.items() if not np.isnan(v)}
        if available:
            best_method = max(available, key=available.get)
            verdict = f"Tốt nhất: {best_method} (NSE={available[best_method]:.3f})"
        else:
            best_method, verdict = "N/A", "Chưa có đủ kết quả (chưa train/eval xong)"

        main_rows.append({
            "Hồ Chứa": info["name"],
            "Nhánh Sông": branch_name,
            "Lưu Vực (thực nghiệm)": basin_name,
            "NSE Standalone": _fmt(method_nse["Standalone"]),
            "NSE Nhánh (pooled, chưa FT)": _fmt(method_nse["Nhánh (pooled)"]),
            "NSE Lưu vực (pooled, chưa FT)": _fmt(method_nse["Lưu vực (pooled)"]),
            "NSE Fine-tune từ Nhánh": _fmt(method_nse["Fine-tune Nhánh"]),
            "NSE Fine-tune từ Lưu vực": _fmt(method_nse["Fine-tune Lưu vực"]),
            "RMSE Standalone": _fmt(_fnum(m_standalone, "rmse")),
            "RMSE Fine-tune Nhánh": _fmt(_fnum(m_ft_branch, "rmse")),
            "RMSE Fine-tune Lưu vực": _fmt(_fnum(m_ft_basin, "rmse")),
            "KGE Fine-tune Nhánh": _fmt(_fnum(m_ft_branch, "kge")),
            "KGE Fine-tune Lưu vực": _fmt(_fnum(m_ft_basin, "kge")),
            "Phương Pháp Tốt Nhất": best_method,
            "Nhận Định": verdict,
        })

        # ── Bảng chi tiết: 5 phương pháp x 3 mùa (dạng dài, dễ pivot trong Excel) ──
        method_loaders = {
            "Standalone": lambda s: _load_json(_nested_metrics_path(root, "standalone", key, s)),
            "Nhánh (pooled)": lambda s: _load_json(_flat_eval_path(root, key, "branch", s)),
            "Lưu vực (pooled)": lambda s: _load_json(_flat_eval_path(root, key, "basin", s)),
            "Fine-tune Nhánh": lambda s: _load_json(_nested_metrics_path(root, "finetune_branch", key, s)),
            "Fine-tune Lưu vực": lambda s: _load_json(_nested_metrics_path(root, "finetune_basin", key, s)),
        }
        for method_name, loader in method_loaders.items():
            for season in ("all", "dry", "rainy"):
                m = loader(season)
                nse_val = _season_field(m, season, "nse")
                rmse_val = _season_field(m, season, "rmse")
                detail_rows.append({
                    "Hồ Chứa": info["name"],
                    "Nhánh Sông": branch_name,
                    "Phương Pháp": method_name,
                    "Mùa": SEASON_LABEL[season],
                    "NSE": _fmt(nse_val),
                    "RMSE (m³/s)": _fmt(rmse_val),
                })

        h_standalone = m_standalone.get("horizons", {}) if m_standalone else {}
        h_ft_branch = m_ft_branch.get("horizons", {}) if m_ft_branch else {}
        h_ft_basin = m_ft_basin.get("horizons", {}) if m_ft_basin else {}
        h_row = {"Hồ Chứa": info["name"]}
        for hz in ["3h", "6h", "12h", "24h"]:
            h_row[f"NSE_Standalone_{hz}"] = h_standalone.get(hz, {}).get("nse", "N/A")
            h_row[f"NSE_FT_Nhanh_{hz}"] = h_ft_branch.get(hz, {}).get("nse", "N/A")
            h_row[f"NSE_FT_LuuVuc_{hz}"] = h_ft_basin.get(hz, {}).get("nse", "N/A")
        horizon_rows.append(h_row)

    # ── Sông Côn 2: A Vương vs Sông Bung vs riêng (Kịch bản 2) ──────────────────
    key_sc2 = "HO_SONG_CON_2"
    m_sc2_standalone = _load_json(_nested_metrics_path(root, "standalone", key_sc2, "all"))
    m_sc2_a_vuong_variant = _load_json(os.path.join(root, f"{key_sc2}_A_VUONG_WITH_SONG_CON_eval.json"))
    m_sc2_song_bung_variant = _load_json(os.path.join(root, f"{key_sc2}_SONG_BUNG_WITH_SONG_CON_eval.json"))

    song_con_rows = [
        {"Biến Thể": "Standalone (baseline)", "Các Hồ Cùng Train": "Chỉ Sông Côn 2",
         "NSE": _fmt(_fnum(m_sc2_standalone))},
        {"Biến Thể": "Thuộc Nhánh A Vương", "Các Hồ Cùng Train": "A Vương, Za Hưng, Sông Côn 2",
         "NSE": _fmt(_fnum(m_sc2_a_vuong_variant))},
        {"Biến Thể": "Thuộc Nhánh Sông Bung", "Các Hồ Cùng Train": "Sông Bung 2/4/4A/5/6, Sông Côn 2",
         "NSE": _fmt(_fnum(m_sc2_song_bung_variant))},
    ]

    df_main = pd.DataFrame(main_rows)
    df_detail = pd.DataFrame(detail_rows)
    df_horizon = pd.DataFrame(horizon_rows)
    df_song_con = pd.DataFrame(song_con_rows)

    excel_path = os.path.join(root, "bang_so_sanh_nse_tong_hop.xlsx")
    try:
        with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
            df_main.to_excel(writer, sheet_name="Tong_Hop_Phuong_Phap", index=False)
            df_detail.to_excel(writer, sheet_name="Chi_Tiet_Theo_Mua", index=False)
            df_song_con.to_excel(writer, sheet_name="Thu_Nghiem_Song_Con_2", index=False)
            df_horizon.to_excel(writer, sheet_name="Chi_Tiet_Moc_Thoi_Gian", index=False)
    except PermissionError:
        excel_path = os.path.join(root, "bang_so_sanh_nse_tong_hop_v2.xlsx")
        with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
            df_main.to_excel(writer, sheet_name="Tong_Hop_Phuong_Phap", index=False)
            df_detail.to_excel(writer, sheet_name="Chi_Tiet_Theo_Mua", index=False)
            df_song_con.to_excel(writer, sheet_name="Thu_Nghiem_Song_Con_2", index=False)
            df_horizon.to_excel(writer, sheet_name="Chi_Tiet_Moc_Thoi_Gian", index=False)

    print("\n" + "=" * 90)
    print("BẢNG TỔNG HỢP (CẢ NĂM):")
    print("=" * 90)
    cols = ["Hồ Chứa", "Nhánh Sông", "NSE Standalone", "NSE Nhánh (pooled, chưa FT)",
            "NSE Lưu vực (pooled, chưa FT)", "NSE Fine-tune từ Nhánh",
            "NSE Fine-tune từ Lưu vực", "Phương Pháp Tốt Nhất"]
    print(df_main[cols].to_string(index=False))
    print(f"\n✅ ĐÃ XUẤT FILE EXCEL: {excel_path}")
    print("=" * 90)
    return excel_path


if __name__ == "__main__":
    generate_summary()
