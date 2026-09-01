# main_generate_excel_summary.py
"""
Tổng hợp kết quả XGBoost theo ĐÚNG 5 phương pháp x 3 mùa (song song với bản
LSTM ở LSTM_Py_Backend_v2/main_generate_excel_summary.py, cùng layout khái
niệm):
  A. Single       -- train riêng từng hồ (72 booster/hồ), không warm-start
  B1. Nhánh sông   -- 72 booster pooled 4 nhánh (+ 2 biến thể Sông Côn 2)
  B2. Lưu vực sông -- 72 booster pooled 2 lưu vực thực nghiệm
  C1. Fine-tune Nhánh -- continue-boosting (xgb_model=...) từ B1, tiếp tục train
      thêm trên riêng dữ liệu 1 hồ (tương đương Transfer Learning bên LSTM)
  C2. Fine-tune Lưu vực -- continue-boosting từ B2
  Mỗi phương pháp đều có 3 biến thể mùa: Cả năm / Mùa Khô (T1-8) / Mùa Mưa
  (T9-12) -- xem kaggle/generate_notebook_master.py cho toàn bộ pipeline.

Đọc từ eval_json/<method>/<group>[_dry|_rainy]/<Ten_Ho>.json do
training/evaluate_xgb.py::evaluate(..., json_out_dir=...) ghi ra.

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
    ROOT_DEFAULT = os.getcwd()

from config.reservoirs import RESERVOIRS, RIVER_BRANCHES, RIVER_BASINS_EXPERIMENT

CUSTOM_ORDER = [
    "HO ZA HUNG", "HO DAK MI 3", "HO SONG BUNG 4", "HO DAK MI 2", "HO DAK MI 4",
    "HO SONG TRANH 4", "HO A VUONG", "HO SONG TRANH 3", "HO SONG TRANH 2",
    "HO SONG BUNG 2", "HO SONG CON 2", "HO KHE DIEN", "HO SONG BUNG 5",
    "HO SONG BUNG 6", "HO SONG BUNG 4A", "HO DAK MI 4C",
]

BASIN_KEY = {"Vu Gia": "VU_GIA", "Thu Bồn": "THU_BON"}
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


def _season_group(base: str, season: str) -> str:
    return base if season == "all" else f"{base}_{season}"


def _eval_path(root: str, method: str, group: str, key: str) -> str:
    """<root>/eval_json/<method>/<group>/<key>.json"""
    return os.path.join(root, "eval_json", method, group, f"{key}.json")


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
    print("XGBOOST — TỔNG HỢP SO SÁNH 5 PHƯƠNG PHÁP x 3 MÙA (CẢ NĂM / KHÔ / MƯA)")
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
        bkey = BASIN_KEY.get(basin_name, basin_name)

        # ── Bảng đầu: chỉ số Cả năm của 5 phương pháp (headline so sánh) ──────
        m_single = _load_json(_eval_path(root, "single", key, key))
        m_branch = _load_json(_eval_path(root, "branch", branch_name, key))
        m_basin = _load_json(_eval_path(root, "basin", bkey, key))
        m_ft_branch = _load_json(_eval_path(root, "finetune_branch", key, key))
        m_ft_basin = _load_json(_eval_path(root, "finetune_basin", key, key))

        method_nse = {
            "Single": _fnum(m_single),
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
            "NSE Single": _fmt(method_nse["Single"]),
            "NSE Nhánh (pooled, chưa FT)": _fmt(method_nse["Nhánh (pooled)"]),
            "NSE Lưu vực (pooled, chưa FT)": _fmt(method_nse["Lưu vực (pooled)"]),
            "NSE Fine-tune từ Nhánh": _fmt(method_nse["Fine-tune Nhánh"]),
            "NSE Fine-tune từ Lưu vực": _fmt(method_nse["Fine-tune Lưu vực"]),
            "RMSE Single": _fmt(_fnum(m_single, "rmse")),
            "RMSE Fine-tune Nhánh": _fmt(_fnum(m_ft_branch, "rmse")),
            "RMSE Fine-tune Lưu vực": _fmt(_fnum(m_ft_basin, "rmse")),
            "KGE Fine-tune Nhánh": _fmt(_fnum(m_ft_branch, "kge")),
            "KGE Fine-tune Lưu vực": _fmt(_fnum(m_ft_basin, "kge")),
            "Phương Pháp Tốt Nhất": best_method,
            "Nhận Định": verdict,
        })

        # ── Bảng chi tiết: 5 phương pháp x 3 mùa (dạng dài, dễ pivot trong Excel) ──
        method_loaders = {
            "Single": lambda s: _load_json(_eval_path(root, "single", _season_group(key, s), key)),
            "Nhánh (pooled)": lambda s: _load_json(_eval_path(root, "branch", _season_group(branch_name, s), key)),
            "Lưu vực (pooled)": lambda s: _load_json(_eval_path(root, "basin", _season_group(bkey, s), key)),
            "Fine-tune Nhánh": lambda s: _load_json(_eval_path(root, "finetune_branch", _season_group(key, s), key)),
            "Fine-tune Lưu vực": lambda s: _load_json(_eval_path(root, "finetune_basin", _season_group(key, s), key)),
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

        h_single = m_single.get("horizons", {}) if m_single else {}
        h_ft_branch = m_ft_branch.get("horizons", {}) if m_ft_branch else {}
        h_ft_basin = m_ft_basin.get("horizons", {}) if m_ft_basin else {}
        h_row = {"Hồ Chứa": info["name"]}
        for hz in ["3h", "6h", "12h", "24h"]:
            h_row[f"NSE_Single_{hz}"] = h_single.get(hz, {}).get("nse", "N/A")
            h_row[f"NSE_FT_Nhanh_{hz}"] = h_ft_branch.get(hz, {}).get("nse", "N/A")
            h_row[f"NSE_FT_LuuVuc_{hz}"] = h_ft_basin.get(hz, {}).get("nse", "N/A")
        horizon_rows.append(h_row)

    # ── Sông Côn 2: A Vương vs Sông Bung vs riêng (Kịch bản 2) ──────────────────
    key_sc2 = "HO_SONG_CON_2"
    m_sc2_single = _load_json(_eval_path(root, "single", key_sc2, key_sc2))
    m_sc2_a_vuong_variant = _load_json(_eval_path(root, "branch", "A_VUONG_WITH_SONG_CON", key_sc2))
    m_sc2_song_bung_variant = _load_json(_eval_path(root, "branch", "SONG_BUNG_WITH_SONG_CON", key_sc2))

    song_con_rows = [
        {"Biến Thể": "Single (baseline)", "Các Hồ Cùng Train": "Chỉ Sông Côn 2",
         "NSE": _fmt(_fnum(m_sc2_single))},
        {"Biến Thể": "Thuộc Nhánh A Vương", "Các Hồ Cùng Train": "A Vương, Za Hưng, Sông Côn 2",
         "NSE": _fmt(_fnum(m_sc2_a_vuong_variant))},
        {"Biến Thể": "Thuộc Nhánh Sông Bung", "Các Hồ Cùng Train": "Sông Bung 2/4/4A/5/6, Sông Côn 2",
         "NSE": _fmt(_fnum(m_sc2_song_bung_variant))},
    ]

    df_main = pd.DataFrame(main_rows)
    df_detail = pd.DataFrame(detail_rows)
    df_horizon = pd.DataFrame(horizon_rows)
    df_song_con = pd.DataFrame(song_con_rows)

    excel_path = os.path.join(root, "bang_so_sanh_nse_tong_hop_xgb.xlsx")
    try:
        with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
            df_main.to_excel(writer, sheet_name="Tong_Hop_Phuong_Phap", index=False)
            df_detail.to_excel(writer, sheet_name="Chi_Tiet_Theo_Mua", index=False)
            df_song_con.to_excel(writer, sheet_name="Thu_Nghiem_Song_Con_2", index=False)
            df_horizon.to_excel(writer, sheet_name="Chi_Tiet_Moc_Thoi_Gian", index=False)
    except PermissionError:
        excel_path = os.path.join(root, "bang_so_sanh_nse_tong_hop_xgb_v2.xlsx")
        with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
            df_main.to_excel(writer, sheet_name="Tong_Hop_Phuong_Phap", index=False)
            df_detail.to_excel(writer, sheet_name="Chi_Tiet_Theo_Mua", index=False)
            df_song_con.to_excel(writer, sheet_name="Thu_Nghiem_Song_Con_2", index=False)
            df_horizon.to_excel(writer, sheet_name="Chi_Tiet_Moc_Thoi_Gian", index=False)

    print("\n" + "=" * 90)
    print("BẢNG TỔNG HỢP (CẢ NĂM):")
    print("=" * 90)
    cols = ["Hồ Chứa", "Nhánh Sông", "NSE Single", "NSE Nhánh (pooled, chưa FT)",
            "NSE Lưu vực (pooled, chưa FT)", "NSE Fine-tune từ Nhánh",
            "NSE Fine-tune từ Lưu vực", "Phương Pháp Tốt Nhất"]
    print(df_main[cols].to_string(index=False))
    print(f"\n✅ ĐÃ XUẤT FILE EXCEL: {excel_path}")
    print("=" * 90)
    return excel_path


if __name__ == "__main__":
    generate_summary()
