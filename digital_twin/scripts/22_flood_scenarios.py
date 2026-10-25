"""Bước 22 – Thư viện kịch bản ngập + tần suất mực nước đỉnh (lộ trình 6.4, 8.3).

Kịch bản (bản đồ độ sâu lớn nhất, phương pháp của 19_hand_stage.py với lệch mặt chuẩn đã hiệu chỉnh):
  - Lũ lịch sử: mỗi năm có Câu Lâu ≥ BĐ III hoặc Giao Thủy ≥ BĐ III – lấy mực nước đỉnh từng trạm trong ±48 giờ quanh
    đỉnh Câu Lâu (lũ 2004, 2007, 2009, 2011, 2013, 2016, 2017, 2025…). Đỉnh các trạm không cùng lúc → bản đồ là BAO
    ngập lớn nhất của trận, không phải một thời điểm.
  - Theo cấp báo động: mọi trạm cùng ở mức BĐ I / II / III → vùng ngập ứng với từng cấp (cho cảnh báo theo vị trí).
Tần suất: chuỗi đỉnh mùa lũ từng năm (giờ, 2002–2019 và 2025 – 19 năm), phân phối Gumbel → chu kỳ lặp lại của từng
mức báo động và từng trận lịch sử. Chuỗi ngắn, lẫn thời kỳ trước/sau khi có hồ lớn → chỉ để tham khảo, khoảng tin cậy rộng.

Đầu ra: web/public/data/dt/flood_scenarios/<kịch bản>/ (max.png, meta.json), …/index.json
        data/compute/flood_frequency.json
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/22_flood_scenarios.py   (sau 19)
"""
import json

import numpy as np
import pandas as pd
from scipy import stats

from config import OUT as WEB_OUT, WORK
from stage_map import COMPUTE, NODES, STATIONS, codes, depth_of, save_png, view_bounds, wse_field

shift = json.loads((COMPUTE / "hand_stage_calibration.json").read_text(encoding="utf-8"))["value"]
summary = json.loads((COMPUTE / "station_levels_summary.json").read_text(encoding="utf-8"))
ALARM = {s["station_code"]: s["alarm"] for s in summary["stations"] if s.get("alarm")}
NAME = {s["station_code"]: s["name"] for s in summary["stations"]}
OUT = WEB_OUT / "flood_scenarios"
lv = pd.read_parquet(WORK / "station_levels_hourly.parquet")
lv = lv[lv.qc_flag == "ok"]
season = lv[lv.t_vn.dt.month.isin([9, 10, 11, 12])]

# ------------------------------------------------------------------ tần suất đỉnh mùa lũ
annual = season.assign(y=season.t_vn.dt.year).groupby(["station_code", "y"]).level_m.max().unstack(0)
annual = annual[annual.index.isin(list(range(2002, 2020)) + [2025])]
freq = {}
for code in [c for c in annual if c in ALARM]:
    x = annual[code].dropna()
    loc, scale = stats.gumbel_r.fit(x)
    T = lambda h, loc=loc, scale=scale: round(float(1 / max(stats.gumbel_r.sf(h, loc, scale), 1e-6)), 1)   # gắn tham số trạm này
    freq[code] = {"name": NAME[code], "years": int(len(x)), "gumbel": [round(loc, 3), round(scale, 3)],
                  "alarm_return_period_years": {f"BĐ {k}": T(a) for k, a in zip(("I", "II", "III"), ALARM[code])},
                  "level_for_return_period_m": {f"{p} năm": round(float(stats.gumbel_r.isf(1 / p, loc, scale)), 2) for p in (2, 5, 10, 20, 50, 100)},
                  "max_observed": {"m": round(float(x.max()), 2), "year": int(x.idxmax()), "return_period_years": T(x.max())},
                  "_T": T}
(COMPUTE / "flood_frequency.json").write_text(json.dumps(
    {"note": "Đỉnh mùa lũ (9–12) từng năm, số liệu giờ 2002–2019 và 2025; Gumbel (ước lượng hợp lý cực đại). "
             "19 năm, lẫn thời kỳ trước/sau hồ chứa lớn → tham khảo.",
     "stations": {k: {a: b for a, b in v.items() if a != "_T"} for k, v in freq.items()}},
    ensure_ascii=False, indent=1), encoding="utf-8")


# ------------------------------------------------------------------ kịch bản
def render(sid, title, title_en, levels, extra):
    h = np.array([levels.get(c, np.nan) if c in STATIONS else np.nan for c in codes], float)
    depth = depth_of(wse_field(h), shift)
    d = OUT / sid
    d.mkdir(parents=True, exist_ok=True)
    save_png(depth, d / "max.png")
    meta = {"event": sid, "title": title, "title_en": title_en,
            "method": "Mặt nước nội suy từ mực nước đỉnh các trạm, trừ DEM (theo 19_hand_stage.py)",
            "bounds": view_bounds, "frames": [], "datum_shift_m": shift,
            "max": {"file": "max.png", "area_km2": round(float((depth > 0.05).sum()) * 900 / 1e6, 1),
                    "max_depth_m": round(float(depth.max()), 2)},
            "station_peaks_m": {k: round(float(v), 2) for k, v in levels.items() if k in STATIONS and pd.notna(v)},
            "return_period_years": {k: freq[k]["_T"](v) for k, v in levels.items() if k in freq and pd.notna(v)},
            "nodes": {k: {"name": NODES[v]["name"], "lon": NODES[v]["lon"], "lat": NODES[v]["lat"]} for k, v in STATIONS.items()},
            **extra}
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"id": sid, "name": title, "name_en": title_en, "area_km2": meta["max"]["area_km2"],
            "station_peaks_m": meta["station_peaks_m"], "return_period_years": meta["return_period_years"]}


index = []
cl = season[season.station_code == "CAULAU"].set_index("t_vn").level_m
gt = season[season.station_code == "GIAOTHUY"].set_index("t_vn").level_m
for y in sorted(set(cl.index.year) | set(gt.index.year)):
    a, b = cl[cl.index.year == y], gt[gt.index.year == y]
    if not ((len(a) and a.max() >= ALARM["CAULAU"][2]) or (len(b) and b.max() >= ALARM["GIAOTHUY"][2])):
        continue
    t0 = a.idxmax() if len(a) else b.idxmax()
    w = season[(season.t_vn >= t0 - pd.Timedelta(hours=48)) & (season.t_vn <= t0 + pd.Timedelta(hours=48))]
    levels = w.groupby("station_code").level_m.max().to_dict()
    missing = [NAME[c] for c in STATIONS if c not in levels]
    if len(missing) > 1:            # vd. 2001 chỉ có Câu Lâu, Hội An, Cẩm Lệ – thiếu thượng nguồn, bản đồ sai lệch
        print(f"bỏ lũ {y}: thiếu trạm {', '.join(missing)}")
        continue
    index.append(render(f"lu_{y}", f"Lũ {t0:%m/%Y} (đỉnh {t0:%d/%m})", f"Flood {t0:%b %Y} (peak {t0:%d %b})", levels,
                        {"kind": "historical", "peak_time_caulau": t0.isoformat(),
                         "note": "Bao ngập lớn nhất: mực nước đỉnh từng trạm trong ±48 giờ quanh đỉnh Câu Lâu"
                                 + (f"; thiếu trạm {', '.join(missing)}" if missing else "")}))
for k, roman in enumerate(("I", "II", "III")):
    levels = {c: a[k] for c, a in ALARM.items() if c in STATIONS}
    index.append(render(f"bao_dong_{roman}", f"Mọi trạm ở mức báo động {roman}", f"All gauges at alarm level {roman}", levels,
                        {"kind": "alarm", "note": "Giả định mọi trạm cùng đạt mức báo động – trong thực tế hiếm khi đồng thời"}))
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "index.json").write_text(json.dumps({"datum_shift_m": shift, "scenarios": index}, ensure_ascii=False, indent=1), encoding="utf-8")

print("Chu kỳ lặp lại (năm) – Gumbel trên", annual.index.min(), "–", annual.index.max())
for k, v in freq.items():
    print(f"  {v['name']:10s} BĐ I/II/III: {list(v['alarm_return_period_years'].values())}  cao nhất {v['max_observed']}")
for s in index:
    print(f"{s['id']:14s} {s['area_km2']:7.1f} km²  {s['station_peaks_m']}")
