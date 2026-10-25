"""Bước 16b – Kiểm định bản đồ ngập HAND (bước 14) bằng độ sâu ngập đo tại tháp báo ngập/lũ VRain (lộ trình 6.3).

Với mỗi trận: lấy độ sâu lớn nhất mô hình (data/work/hand_max_<trận>.tif) tại vị trí tháp, so với độ sâu lớn
nhất đo được trong cửa sổ trận (16_tower_export.mjs). Ngưỡng "ngập" = 0,1 m (cảm biến dao động 0,01–0,09 m khi khô).
  Bảng tiếp liên: trúng (đo ngập, mô hình ngập) · sót (đo ngập, mô hình khô) · báo sai (đo khô, mô hình ngập)
  POD = trúng/(trúng+sót) · FAR = báo sai/(trúng+báo sai) · CSI = trúng/(trúng+sót+báo sai)
  Sai số độ sâu (mô hình − đo) tính trên các tháp trúng.
Tháp đặt ở đô thị/ven đường: mô hình 30 m không có cống, đê, đường nên sai lệch tại chỗ là đương nhiên – đây là
thước đo mức cơ sở để so các phiên bản (HAND → 2D), không phải kiểm định đạt chuẩn.
Do lệch vị trí (tọa độ tháp, ô 30 m) lấy thêm giá trị lớn nhất trong bán kính 1 ô (90 m × 90 m) làm phương án dung sai.

Đầu ra: data/compute/flood_towers/check_<trận>.json
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/16_tower_check.py [--model=stage]
"""
import json
import sys

import numpy as np
import rasterio
from rasterio.warp import transform as warp_xy

from config import CRS_METRIC, ROOT, WORK

TOWERS = ROOT / "data" / "compute" / "flood_towers"
WET_M = 0.1
# --model=stage: kiểm định bản đồ ngập theo mực nước trạm (19_hand_stage.py) thay cho HAND theo lưu lượng (14_hand.py)
MODEL = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--model=")), "hand")
TIF_PREFIX = {"hand": "hand_max", "stage": "stage_max"}[MODEL]
OUT_PREFIX = "check_" if MODEL == "hand" else f"check_{MODEL}_"
# Tầm đo thực tế (số liệu 2025): tháp 1,5 m dừng ở đúng 1,0 m → 1,0 nghĩa là "≥ 1 m" (bị chặn, không tính sai số
# độ sâu); giá trị vượt tầm (vd. 4,98 m ở tháp 3 m) coi là nghi lỗi, bỏ khỏi kiểm định.
CAP_M = {"flood_1m5": 1.0, "flood_3m": 3.0}


def scores(obs, mod, censored):
    o, m = obs > WET_M, mod > WET_M
    hit, miss, fa, cn = int((o & m).sum()), int((o & ~m).sum()), int((~o & m).sum()), int((~o & ~m).sum())
    err = (mod - obs)[o & m & ~censored]
    ratio = lambda a, b: round(a / b, 2) if b else None
    return {"hit": hit, "miss": miss, "false_alarm": fa, "correct_dry": cn,
            "POD": ratio(hit, hit + miss), "FAR": ratio(fa, hit + fa), "CSI": ratio(hit, hit + miss + fa),
            "depth_bias_m": round(float(err.mean()), 2) if err.size else None,
            "depth_mae_m": round(float(np.abs(err).mean()), 2) if err.size else None}


for f in sorted(TOWERS.glob("*.json")):
    if f.stem.startswith("check_"):
        continue
    ev = json.loads(f.read_text(encoding="utf-8"))
    tif = WORK / f"{TIF_PREFIX}_{f.stem}.tif"
    if not tif.exists():
        print(f"{f.stem}: thiếu {tif.name} – chạy lại 14_hand.py")
        continue
    with rasterio.open(tif) as src:
        depth = src.read(1)
        rows = []
        for t in ev["towers"]:
            if t["lat"] is None:
                continue
            x, y = warp_xy("EPSG:4326", CRS_METRIC, [t["lng"]], [t["lat"]])
            r, c = src.index(x[0], y[0])
            inside = 0 <= r < src.height and 0 <= c < src.width and depth[r, c] >= 0
            near = depth[max(r - 1, 0):r + 2, max(c - 1, 0):c + 2] if inside else np.array([])
            rows.append({**t, "inside": bool(inside),
                         "model_m": round(float(depth[r, c]), 2) if inside else None,
                         "model_near_m": round(float(near[near >= 0].max()), 2) if inside and (near >= 0).any() else None})
    for r in rows:
        cap = CAP_M.get(r["type"])
        d = r["max_depth_m"]
        r["censored"] = bool(cap and d is not None and d >= cap - 0.01)
        r["out_of_range"] = bool(cap and d is not None and d > cap + 0.05)
    use = [r for r in rows if r["inside"] and r["n_obs"] and not r["stuck"] and not r["out_of_range"]
           and r["max_depth_m"] is not None]
    obs = np.array([r["max_depth_m"] for r in use], float)
    cen = np.array([r["censored"] for r in use], bool)
    res = {
        "event": f.stem, "wet_threshold_m": WET_M, "tower_cap_m": CAP_M,
        "towers_total": len(ev["towers"]), "inside_model": sum(r["inside"] for r in rows),
        "with_data": sum(1 for r in rows if r["n_obs"]), "stuck": [r["code"] for r in rows if r["stuck"]],
        "out_of_range": [r["code"] for r in rows if r["out_of_range"]],
        "used": len(use), "censored": int(cen.sum()),
        "at_cell": scores(obs, np.array([r["model_m"] for r in use], float), cen) if use else None,
        "within_1_cell": scores(obs, np.array([r["model_near_m"] for r in use], float), cen) if use else None,
        "towers": sorted(rows, key=lambda r: -(r["max_depth_m"] or 0)),
    }
    (TOWERS / f"{OUT_PREFIX}{f.stem}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{f.stem}: {res['towers_total']} tháp, {res['inside_model']} trong vùng mô hình, {res['with_data']} có số liệu, "
          f"dùng {res['used']} (bỏ {len(res['stuck'])} cảm biến đứng yên, {len(res['out_of_range'])} vượt tầm đo; "
          f"{res['censored']} tháp chạm trần đo – không tính sai số độ sâu)")
    for k in ("at_cell", "within_1_cell"):
        print(f"  {k:14s} {res[k]}")
    print(f"  {'tháp':42s} {'đo':>7s} {'mô hình':>8s} {'±1 ô':>6s}")
    for r in [r for r in res["towers"] if r in use][:15]:
        mark = "≥" if r["censored"] else " "
        print(f"  {r['name'][:42]:42s} {mark}{r['max_depth_m']:5.2f} {r['model_m']:8.2f} {r['model_near_m']:6.2f}")
