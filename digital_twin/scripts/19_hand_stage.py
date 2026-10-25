"""Bước 19 – Bản đồ ngập theo MỰC NƯỚC TRẠM ĐO (lộ trình 6.1, phương án 2; kiểm định 6.3).

Khác bước 14 (mực nước suy từ lưu lượng diễn toán → đường quan hệ tổng hợp): ở đây mặt nước lấy trực tiếp từ mực
nước giờ đo tại trạm KTTV (17_station_levels.py) và triều dự tính ở cửa sông (18_tide_sontra.py):
  1) Ô sông vùng thấp (lưới, mạng sông của bước 14) nối thành đồ thị; khoảng cách dọc sông từ mỗi trạm/cửa sông (Dijkstra).
  2) Mặt nước tại ô sông = trung bình trọng số nghịch đảo bình phương khoảng cách dọc sông của các trạm có số liệu giờ đó.
  3) Ô bãi tràn nhận mặt nước của ô sông gần nhất, làm trơn σ = SMOOTH_CELLS ô; độ sâu = mặt nước + LỆCH MẶT CHUẨN − DEM.
LỆCH MẶT CHUẨN: trạm dùng cao độ quốc gia (Hòn Dấu), DEM Copernicus GLO-30 dùng EGM2008 và là mô hình bề mặt (có nhà,
cây) → một tham số duy nhất, HIỆU CHỈNH trên trận hiệu chỉnh bằng độ sâu tháp VRain (16_tower_export.mjs), giữ nguyên cho
trận kiểm định.
Giới hạn: chỉ vùng đồng bằng có trạm bao quanh – thượng Vu Gia trên Ái Nghĩa và Túy Loan không có trạm (mặt nước ngoại suy
phẳng → có thể thiếu); không đê, cống; ô thấp hơn mặt nước coi là ngập dù bị chắn.

Đầu ra: web/public/data/dt/flood_stage/<trận>/ (PNG mỗi 3 giờ, max.png, meta.json – cùng định dạng lớp flood_hand)
        data/work/stage_max_<trận>.tif, data/compute/hand_stage_calibration.json
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/19_hand_stage.py   (sau 14, 16_tower_export, 17, 18)
"""
import json

import numpy as np
import pandas as pd
import rasterio
from affine import Affine
from rasterio.warp import transform as warp_xy

from config import CRS_METRIC, OUT as WEB_OUT, WORK, block_mean, hoian_window
from stage_map import (COMPUTE, NODES, OUTLETS, STATIONS, FRAME_EVERY_H, GAP_H, T, c0, r0, vh, vw, valid_v, river_v,
                       dem_v, view_bounds, series, wse_field, depth_of, save_png, skipped)

EVENTS = json.loads((COMPUTE / "events.json").read_text(encoding="utf-8"))
SHIFTS = np.round(np.arange(-2.5, 1.01, 0.1), 2)
WET_M = 0.1
CAP_M = {"flood_1m5": 1.0, "flood_3m": 3.0}


def tower_cells(name):
    ev = json.loads((COMPUTE / "flood_towers" / f"{name}.json").read_text(encoding="utf-8"))
    out = []
    for t in ev["towers"]:
        if t["lat"] is None or not t["n_obs"] or t.get("stuck") or t["max_depth_m"] is None:
            continue
        cap = CAP_M.get(t["type"])
        if cap and t["max_depth_m"] > cap + 0.05:
            continue
        x, y = warp_xy("EPSG:4326", CRS_METRIC, [t["lng"]], [t["lat"]])
        c, r = ~T * (x[0], y[0])
        r, c = int(r) - r0, int(c) - c0
        if 0 <= r < vh and 0 <= c < vw and valid_v[r, c]:
            out.append((r, c, t["max_depth_m"], bool(cap and t["max_depth_m"] >= cap - 0.01)))
    return out


def tower_error(max_wse, towers, shift):
    """Sai số tuyệt đối trung bình độ sâu lớn nhất tại tháp; tháp chạm trần đo chỉ tính phần mô hình thấp hơn."""
    e = []
    for r, c, obs, cens in towers:
        m = 0.0 if river_v[r, c] or not np.isfinite(max_wse[r, c]) else max(max_wse[r, c] + shift - dem_v[r, c], 0)
        e.append(max(obs - m, 0) if cens else abs(m - obs))
    return float(np.mean(e))


# ------------------------------------------------------------------ chạy: mặt nước lớn nhất từng trận → hiệu chỉnh lệch mặt chuẩn
runs = {}
for key in ("calibration", "validation"):
    ev = EVENTS[key]
    name = f"{key}_{ev['peak_st2'][:10].replace('-', '')}"
    idx, hs = series(ev)
    cov = hs[list(STATIONS)].notna().mean().round(2).to_dict()
    wse_max = np.full((vh, vw), -np.inf)
    frames = []
    for t in range(len(idx)):
        wse = wse_field(hs.iloc[t].to_numpy(float))
        wse_max = np.fmax(wse_max, wse)
        if t % FRAME_EVERY_H == 0:
            frames.append((t, wse))
    wse_max[~np.isfinite(wse_max)] = np.nan
    runs[key] = dict(name=name, idx=idx, hs=hs, frames=frames, wse_max=wse_max, coverage=cov)
    print(f"{name}: {len(idx)} giờ, độ phủ trạm {cov}")

cal = runs["calibration"]
cal_towers = tower_cells(cal["name"])
errs = {float(s): tower_error(cal["wse_max"], cal_towers, s) for s in SHIFTS}
shift = min(errs, key=errs.get)
print(f"Lệch mặt chuẩn hiệu chỉnh trên {cal['name']} ({len(cal_towers)} tháp): {shift:+.1f} m (MAE {errs[shift]:.2f} m; "
      f"0 m → MAE {errs[0.0]:.2f} m)")
(COMPUTE / "hand_stage_calibration.json").write_text(json.dumps({
    "parameter": "datum_shift_m – cộng vào mặt nước trạm trước khi trừ DEM",
    "calibrated_on": cal["name"], "towers": len(cal_towers), "value": shift,
    "mae_by_shift": {f"{k:+.1f}": round(v, 3) for k, v in errs.items()},
    "validation_mae_at_value": round(tower_error(runs["validation"]["wse_max"], tower_cells(runs["validation"]["name"]), shift), 3),
}, ensure_ascii=False, indent=1), encoding="utf-8")

# ------------------------------------------------------------------ xuất lớp web + raster độ sâu lớn nhất
for key, rr in runs.items():
    out_dir = WEB_OUT / "flood_stage" / rr["name"]
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.png"):
        old.unlink()
    frames = []
    for t, wse in rr["frames"]:
        depth = depth_of(wse, shift)
        fn = f"t{t:03d}.png"
        save_png(depth, out_dir / fn)
        frames.append({"t": t, "time": rr["idx"][t].isoformat(), "file": fn,
                       "area_km2": round(float((depth > 0.05).sum()) * 900 / 1e6, 1), "max_depth_m": round(float(depth.max()), 2),
                       "levels_m": {k: (None if pd.isna(v) else round(float(v), 2)) for k, v in rr["hs"].iloc[t].items()}})
    dmax = depth_of(rr["wse_max"], shift)
    save_png(dmax, out_dir / "max.png")
    # cho mô phỏng 3D (23_sim_package.py): mặt nước khu Hội An mỗi khung, đã cộng lệch mặt chuẩn → cùng hệ cao độ DEM
    hw, hw_t = hoian_window(T * Affine.translation(c0, r0), (vh, vw))
    np.savez_compressed(WORK / f"wse_hoian_stage_{rr['name']}.npz",
                        wse=np.stack([(wse[hw] + shift).astype(np.float32) for _, wse in rr["frames"]]),
                        frame_t=np.array([t for t, _ in rr["frames"]]), transform=np.array(hw_t)[:6],
                        time0=rr["idx"][0].isoformat())
    np.savez_compressed(WORK / f"wse_region_stage_{rr['name']}.npz",
                        wse=np.stack([block_mean(wse + shift, 10) for _, wse in rr["frames"]]),
                        frame_t=np.array([t for t, _ in rr["frames"]]),
                        transform=np.array(T * Affine.translation(c0, r0) * Affine.scale(10))[:6],
                        time0=rr["idx"][0].isoformat())
    with rasterio.open(WORK / f"stage_max_{rr['name']}.tif", "w", driver="GTiff", height=vh, width=vw, count=1, dtype="float32",
                       crs=CRS_METRIC, transform=T * Affine.translation(c0, r0), compress="deflate", nodata=-1) as dst:
        dst.write(np.where(valid_v, dmax, -1).astype(np.float32), 1)
    peaks = {k: round(float(rr["hs"][k].max()), 2) for k in STATIONS if rr["hs"][k].notna().any()}
    meta = {
        "event": rr["name"], "method": "Mặt nước nội suy từ mực nước trạm đo + triều dự tính, trừ DEM (HAND theo mực nước)",
        "bounds": view_bounds, "frames": frames, "frame_every_h": FRAME_EVERY_H,
        "max": {"file": "max.png", "area_km2": round(float((dmax > 0.05).sum()) * 900 / 1e6, 1), "max_depth_m": round(float(dmax.max()), 2)},
        "station_peaks_m": peaks, "station_coverage": rr["coverage"], "datum_shift_m": shift,
        "nodes": {k: {"name": NODES[v]["name"], "lon": NODES[v]["lon"], "lat": NODES[v]["lat"]} for k, v in STATIONS.items()},
        "assumptions": [f"Lệch mặt chuẩn trạm–DEM {shift:+.1f} m hiệu chỉnh trên {cal['name']} bằng tháp VRain",
                        "DEM Copernicus GLO-30 (mô hình bề mặt, 30 m); không đê, cống, đường chắn",
                        "Thượng Vu Gia trên Ái Nghĩa và sông Túy Loan không có trạm – mặt nước ngoại suy",
                        f"Thiếu số liệu trạm ≤ {GAP_H} giờ được nội suy",
                        "Biên cửa sông: " + (", ".join(OUTLETS) + " theo triều Sơn Trà dự tính" if OUTLETS else
                                             "chưa đặt – mạng sông chưa ra tới cửa: " + "; ".join(skipped)
                                             + "; trạm Hội An, Cẩm Lệ là biên hạ lưu")],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{rr['name']}: ngập lớn nhất {meta['max']['area_km2']} km², {len(frames)} khung → {out_dir}")
