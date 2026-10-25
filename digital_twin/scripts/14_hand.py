"""Bước 14 – Bản đồ ngập nhanh HAND + đường quan hệ tổng hợp (lộ trình mục 6.1).

Phương pháp (kiểu bản đồ ngập quốc gia NOAA/OWP – Zheng và cs. 2018):
  1) HAND: độ cao của mỗi ô so với ô sông mà nó thoát nước tới (theo D8). "Sông" = các đoạn của mạng kết nối
     (bước 10): đoạn D8 thượng nguồn + các nhánh OSM vùng đồng bằng. Mỗi ô mang mã đoạn sông nó thoát vào.
  2) Đường quan hệ tổng hợp (SRC) cho từng đoạn: với mực nước h, từ HAND tính diện tích mặt nước, thể tích →
     mặt cắt ướt A = V/L, chu vi ướt P ≈ diện tích đáy/L → Q = (1/n)·A·R^(2/3)·S^(1/2).
  3) Lưu lượng từng đoạn theo giờ: thượng nguồn lấy từ diễn toán (bước 13); đồng bằng chia theo tỷ lệ GIẢ ĐỊNH
     (SPLIT bên dưới – chưa có số liệu đo). Q → h theo SRC → độ sâu = h − HAND.
Giới hạn: DEM 30 m (mặt nước sông trên DEM coi là đáy), không tính triều, đê, dòng chảy 2D, vận tốc → kết quả là
MỨC CƠ SỞ (minh họa có cơ sở vật lý), sẽ thay bằng mô hình 2D (6.2).

Đầu ra: web/public/data/dt/flood_hand/<trận>/  – ảnh độ sâu theo khung giờ (PNG), max.png, meta.json
        data/compute/hand_src.json             – đường quan hệ tổng hợp từng đoạn
        data/work/hand_max_<trận>.tif          – độ sâu lớn nhất (m, 30 m) cho bước 16
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/14_hand.py
"""
import json
from collections import defaultdict

import geopandas as gpd
import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.features import rasterize
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from scipy import ndimage
from shapely.geometry import shape

from config import CRS_METRIC, OUT as WEB_OUT, ROOT, WORK, block_mean, hoian_window

COMPUTE = ROOT / "data" / "compute"
# Vùng tính: từ Nông Sơn – Thành Mỹ xuống biển (WGS84)
REGION = (107.95, 15.66, 108.42, 16.12)
# Vùng xuất ảnh (đồng bằng Vu Gia – Thu Bồn, Hội An, Đà Nẵng)
VIEW = (108.02, 15.76, 108.42, 16.10)
N_MANNING, S_MIN_DELTA, H_MAX, H_STEP = 0.05, 1e-4, 25.0, 0.1
LOWLAND_M = 12.0      # ô thấp hơn mức này (đồng bằng): gán vào nhánh sông GẦN NHẤT thay vì theo D8 (D8 nhiễu trên đất phẳng)
CHANNEL_DEPTH_M = 4.0 # độ sâu lòng sông dưới mặt nước DEM – GIẢ ĐỊNH (DEM coi mặt nước lúc chụp là đáy)
SMOOTH_CELLS = 10     # làm trơn mặt nước đồng bằng (σ = 10 ô = 300 m) – tránh nhảy bậc giữa các nhánh
OUT_SCALE = 2         # ảnh xuất 60 m/điểm ảnh cho nhẹ
FRAME_EVERY_H = 3
KEY_NODES = ["ST-NONGSON", "ST-GIAOTHUY", "ST-THANHMY", "J-VUGIA-END"]   # lưu lượng ghi kèm mỗi khung
# Tỷ lệ chia nước tại phân lưu – GIẢ ĐỊNH, cần hiệu chỉnh bằng số liệu đo/mô hình 1D
SPLIT = {
    "J-VUGIA-END": {"Sông Quảng Huế": 0.5, "Sông Ái Nghĩa": 0.5},
    "D01": {"Sông Yên": 0.6, "Sông Quá Giáng": 0.4},
    "D10": {"Sông La Thọ": 0.5, "Sông Quá Giáng": 0.5},
    "D12": {"Sông Vĩnh Điện": 0.15, "Sông Thu Bồn": 0.85},
}

net = json.loads((COMPUTE / "network.json").read_text(encoding="utf-8"))
nodes = {n["id"]: n for n in net["nodes"]}
gj = json.loads((COMPUTE / "network.geojson").read_text(encoding="utf-8"))
edge_geom = {(f["properties"]["from"], f["properties"]["to"]): shape(f["geometry"])
             for f in gj["features"] if f["properties"]["kind"] == "edge"}
edges = [e for e in net["edges"] if e["source"] in ("d8", "osm")]

# ------------------------------------------------------------------ raster vùng tính
# Cao độ lấy từ DEM GỐC: dem_breach.tif bị khoét trũng tới hàng trăm mét ở đồng bằng phẳng – chỉ dùng cho hướng D8
src = rasterio.open(WORK / "dem_utm.tif")
win = from_bounds(*transform_bounds("EPSG:4326", CRS_METRIC, *REGION), transform=src.transform).round_offsets().round_lengths()
dem = src.read(1, window=win).astype(np.float64)
dem = np.where(dem > -1000, np.maximum(dem, -5.0), dem)
d8 = rasterio.open(WORK / "d8.tif").read(1, window=win)
T = src.window_transform(win)
H, W = dem.shape
cell = abs(T.a)
valid = dem > -1000
print(f"Vùng tính {W}×{H} ô ({cell:.0f} m)")

# đoạn sông trong vùng → raster mã đoạn
reach = []
for i, e in enumerate(edges):
    g = gpd.GeoSeries([edge_geom[(e["from"], e["to"])]], crs=4326).to_crs(CRS_METRIC).iloc[0]
    reach.append(dict(idx=i + 1, edge=e, geom=g))
streams = rasterize([(r["geom"], r["idx"]) for r in reach], out_shape=(H, W), transform=T, fill=0,
                    all_touched=True, dtype="int32")
in_region = [r for r in reach if (streams == r["idx"]).any()]
print(f"{len(in_region)} đoạn sông trong vùng")

# ------------------------------------------------------------------ HAND + mã đoạn bằng nhảy con trỏ theo D8
D8 = {1: (-1, 1), 2: (0, 1), 4: (1, 1), 8: (1, 0), 16: (1, -1), 32: (0, -1), 64: (-1, -1), 128: (-1, 0)}
idx = np.arange(H * W).reshape(H, W)
nxt = np.full(H * W, -1, dtype=np.int64)
rr, cc = np.mgrid[0:H, 0:W]
for code, (dr, dc) in D8.items():
    m = (d8 == code)
    r2, c2 = rr[m] + dr, cc[m] + dc
    ok = (r2 >= 0) & (r2 < H) & (c2 >= 0) & (c2 < W)
    src_i = idx[m][ok]
    nxt[src_i] = r2[ok] * W + c2[ok]
is_stream = (streams > 0).ravel()
nxt[is_stream] = np.flatnonzero(is_stream)           # ô sông trỏ về chính nó
target = nxt.copy()
for it in range(40):                                 # nhảy con trỏ: mỗi vòng gấp đôi quãng đường
    t2 = np.where(target >= 0, target[np.clip(target, 0, None)], -1)
    if np.array_equal(t2, target):
        break
    target = t2
reached = (target >= 0) & is_stream[np.clip(target, 0, None)]
label = np.where(reached, streams.ravel()[np.clip(target, 0, None)], 0).reshape(H, W)
hand = np.where(reached, dem.ravel() - dem.ravel()[np.clip(target, 0, None)], np.nan).reshape(H, W)
hand[~valid] = np.nan
# Đồng bằng: theo nhánh sông gần nhất (khoảng cách thẳng)
# chỉ xét ô sông thấp (< 2×LOWLAND_M): tránh gán ô đồng bằng vào suối vùng núi ở gần theo đường chim bay
low_stream = (streams > 0) & valid & (dem < 2 * LOWLAND_M)
_, (ni, nj) = ndimage.distance_transform_edt(~low_stream, return_indices=True)
near_lab = streams[ni, nj]
near_hand = dem - dem[ni, nj]
low = valid & ((dem < LOWLAND_M) | ~np.isfinite(hand))
label = np.where(low, near_lab, label)
hand = np.where(low, near_hand, hand)
hand[~valid] = np.nan
hand = np.where(hand < 0, 0, hand)
print(f"HAND: {np.isfinite(hand).mean() * 100:.0f}% ô có giá trị (vòng lặp {it})")

# ------------------------------------------------------------------ đường quan hệ tổng hợp từng đoạn
stages = np.arange(0, H_MAX + 1e-9, H_STEP)
src_tab = {}
for r in in_region:
    e = r["edge"]
    hv = hand[label == r["idx"]]
    hv = hv[np.isfinite(hv)]
    L = max(r["geom"].length, cell)
    S = max(e.get("slope") or 0, S_MIN_DELTA)
    if e["source"] == "osm":                          # độ dốc đồng bằng: theo DEM hai đầu đoạn, tối thiểu 1e-4
        S = S_MIN_DELTA
    river_cells = int((streams == r["idx"]).sum())
    b_ch = river_cells * cell * cell / L                     # bề rộng lòng sông theo số ô sông
    a0, p0 = b_ch * CHANNEL_DEPTH_M, b_ch + 2 * CHANNEL_DEPTH_M
    q = []
    for h in stages:
        w = hv[hv < h]
        area_s = w.size * cell * cell
        vol = float(np.sum(h - w)) * cell * cell if w.size else 0.0
        a = vol / L + a0 + b_ch * h                              # phần trên DEM + lòng sông dưới mặt nước DEM
        p = area_s / L + p0
        rh = a / max(p, 1e-6)
        q.append((1 / N_MANNING) * a * rh ** (2 / 3) * S ** 0.5)
    r["src_q"] = np.maximum.accumulate(np.array(q))
    src_tab[f"{e['from']}→{e['to']}"] = {"length_m": round(L), "slope": S, "cells": int(hv.size),
                                         "q_at_stage": {f"{h:.1f}": round(float(v), 1) for h, v in zip(stages[::10], r["src_q"][::10])}}
(COMPUTE / "hand_src.json").write_text(json.dumps({"n": N_MANNING, "stages_m": [0, H_MAX, H_STEP], "reaches": src_tab},
                                                  ensure_ascii=False, indent=1), encoding="utf-8")


def stage_of(r, qv):
    return np.interp(qv, r["src_q"], stages)


# ------------------------------------------------------------------ lưu lượng từng đoạn theo giờ
def reach_flows(flow_nodes, n):
    """Thượng nguồn: Q của nút hạ lưu đoạn (hoặc thượng lưu nếu hạ lưu là đập). Đồng bằng: chia theo SPLIT."""
    q = {}
    for r in in_region:
        e = r["edge"]
        if e["source"] == "d8":
            key = e["to"] if (e["to"] in flow_nodes and not e["to"].startswith("HO-")) else e["from"]
            q[r["idx"]] = np.array(flow_nodes.get(key, np.zeros(n)))
    # đồng bằng: duyệt theo thứ tự dòng chảy
    out_of = defaultdict(list)
    for r in in_region:
        if r["edge"]["source"] == "osm":
            out_of[r["edge"]["from"]].append(r)
    node_q = {k: np.array(v) for k, v in flow_nodes.items() if k in ("ST-GIAOTHUY", "J-VUGIA-END")}
    vg_spec = None
    if "ST-THANHMY" in flow_nodes:                                    # nguồn sông nhánh (Túy Loan): mô-đun dòng chảy Thành Mỹ
        vg_spec = np.array(flow_nodes["ST-THANHMY"]) / nodes["ST-THANHMY"]["area_km2"]
    for nid, n_ in nodes.items():
        if n_["type"] == "source" and vg_spec is not None:
            node_q[nid] = vg_spec * (n_.get("area_km2") or 0)
    pending = set(r["idx"] for r in in_region if r["edge"]["source"] == "osm")
    inflow = defaultdict(lambda: np.zeros(n))
    for _ in range(50):
        progressed = False
        for nid in list(out_of):
            ins = [r for r in in_region if r["edge"]["source"] == "osm" and r["edge"]["to"] == nid]
            if any(r["idx"] in pending for r in ins):
                continue
            total = node_q.get(nid, np.zeros(n)) + inflow[nid]
            outs = [r for r in out_of[nid] if r["idx"] in pending]
            if not outs:
                continue
            fr = SPLIT.get(nid, {})
            for r in outs:
                share = fr.get(r["edge"]["river"], 1.0 / len(out_of[nid]))
                q[r["idx"]] = total * share
                inflow[r["edge"]["to"]] = inflow[r["edge"]["to"]] + q[r["idx"]]
                pending.discard(r["idx"])
                progressed = True
        if not progressed:
            break
    return q, pending


# ------------------------------------------------------------------ chạy từng trận, xuất khung ảnh
vw = from_bounds(*transform_bounds("EPSG:4326", CRS_METRIC, *VIEW), transform=T).round_offsets().round_lengths()
r0, c0, vh, vwid = int(vw.row_off), int(vw.col_off), int(vw.height), int(vw.width)
view_bounds_utm = rasterio.windows.bounds(vw, T)
view_bounds = transform_bounds(CRS_METRIC, "EPSG:4326", *view_bounds_utm)
# ảnh nằm trong khung UTM; Cesium phủ theo khung lon/lat – lệch nhỏ (< 1 ô) ở vùng hẹp này, chấp nhận cho mức cơ sở
PALETTE = [(0.0, (180, 220, 255)), (0.5, (110, 180, 245)), (1.0, (50, 130, 220)), (2.0, (25, 80, 190)), (4.0, (10, 40, 130))]


def colorize(depth):
    rgba = np.zeros(depth.shape + (4,), np.uint8)
    wet = depth > 0.05
    for lim, col in PALETTE:
        m = wet & (depth >= lim)
        rgba[m, :3] = col
    rgba[wet, 3] = np.clip(120 + depth[wet] * 40, 120, 220).astype(np.uint8)
    return rgba


# lưới dùng chung cho 19_hand_stage.py (bản đồ ngập theo mực nước trạm đo)
np.savez_compressed(WORK / "hand_grid.npz", dem=dem.astype(np.float32), streams=streams, transform=np.array(T)[:6],
                    view=np.array([r0, c0, vh, vwid]), view_bounds=np.array(view_bounds), lowland_m=LOWLAND_M,
                    smooth_cells=SMOOTH_CELLS)

lab_v = label[r0:r0 + vh, c0:c0 + vwid]
hand_v = hand[r0:r0 + vh, c0:c0 + vwid]
river_v = streams[r0:r0 + vh, c0:c0 + vwid] > 0
dem_v = dem[r0:r0 + vh, c0:c0 + vwid]
base_v = dem_v - hand_v                      # cao độ mặt nước DEM tại ô sông mà ô này thuộc về
low_v = dem_v < LOWLAND_M
ok_v = np.isfinite(base_v)
# khu thí điểm Hội An: lưu mặt nước từng khung cho mô phỏng 3D (23_sim_package.py)
HW, HW_T = hoian_window(rasterio.windows.transform(vw, T), (vh, vwid))


def smooth_wse(wse):
    """Làm trơn mặt nước tuyệt đối ở đồng bằng (tích chập chuẩn hóa, bỏ qua ô không có giá trị)."""
    m = ok_v & low_v & np.isfinite(wse)          # chỉ lấy ô đồng bằng, không lẫn mặt nước suối vùng núi
    num = ndimage.gaussian_filter(np.where(m, wse, 0.0), SMOOTH_CELLS)
    den = ndimage.gaussian_filter(m.astype(float), SMOOTH_CELLS)
    sm = np.where(den > 1e-3, num / np.maximum(den, 1e-3), np.nan)
    return np.where(low_v & np.isfinite(sm), sm, wse)


def save_png(depth, path):
    d = depth[: depth.shape[0] // OUT_SCALE * OUT_SCALE, : depth.shape[1] // OUT_SCALE * OUT_SCALE]
    d = d.reshape(d.shape[0] // OUT_SCALE, OUT_SCALE, d.shape[1] // OUT_SCALE, OUT_SCALE).mean(axis=(1, 3))
    Image.fromarray(colorize(d), "RGBA").quantize(colors=24, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
for f in sorted((COMPUTE / "routing").glob("*.json")):
    rt = json.loads(f.read_text(encoding="utf-8"))
    n = len(rt["time"])
    q, unresolved = reach_flows(rt["flow"], n)
    stage = {i: stage_of(next(r for r in in_region if r["idx"] == i), qv) for i, qv in q.items()}
    out_dir = WEB_OUT / "flood_hand" / f.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.png"):
        old.unlink()
    frames, max_depth, hoian_wse, region_wse = [], np.zeros_like(hand_v), [], []
    lut_idx = np.zeros(int(label.max()) + 1, np.float64)
    for t in range(0, n):
        lut_idx[:] = np.nan
        for i, s in stage.items():
            lut_idx[i] = s[t]
        st = lut_idx[lab_v]
        wse = smooth_wse(base_v + st)                                   # mặt nước tuyệt đối, làm trơn ở đồng bằng
        depth = np.where(np.isfinite(wse) & ok_v, wse - dem_v, 0)
        depth = np.where(river_v, 0, np.clip(depth, 0, None))          # không tô lòng sông
        max_depth = np.maximum(max_depth, depth)
        if t % FRAME_EVERY_H == 0:
            name = f"t{t:03d}.png"
            save_png(depth, out_dir / name)
            hoian_wse.append(wse[HW].astype(np.float32))
            region_wse.append(block_mean(wse, 10))
            frames.append({"t": t, "time": rt["time"][t], "file": name,
                           "area_km2": round(float((depth > 0.05).sum()) * cell * cell / 1e6, 1),
                           "max_depth_m": round(float(depth.max()), 2),
                           "q": {k: round(float(rt["flow"][k][t])) for k in KEY_NODES if k in rt["flow"]}})
    save_png(max_depth, out_dir / "max.png")
    # cho mô phỏng 3D (23_sim_package.py): mặt nước khu Hội An (cao độ DEM) mỗi khung + lưu lượng từng đoạn sông theo giờ
    np.savez_compressed(WORK / f"wse_hoian_flow_{f.stem}.npz", wse=np.stack(hoian_wse),
                        frame_t=np.array([fr["t"] for fr in frames]), transform=np.array(HW_T)[:6],
                        time0=rt["time"][0])
    np.savez_compressed(WORK / f"wse_region_flow_{f.stem}.npz", wse=np.stack(region_wse),
                        frame_t=np.array([fr["t"] for fr in frames]),
                        transform=np.array(rasterio.windows.transform(vw, T) * Affine.scale(10))[:6], time0=rt["time"][0])
    (WORK / f"reach_flows_{f.stem}.json").write_text(json.dumps(
        {"time": rt["time"], "reaches": {f"{r['edge']['from']}|{r['edge']['to']}": [round(float(v), 1) for v in q[r["idx"]]]
                                         for r in in_region if r["idx"] in q}}, ensure_ascii=False), encoding="utf-8")
    # độ sâu lớn nhất dạng số (30 m) – bước 16 lấy mẫu tại vị trí tháp báo ngập để kiểm định
    with rasterio.open(WORK / f"hand_max_{f.stem}.tif", "w", driver="GTiff", height=vh, width=vwid, count=1,
                       dtype="float32", crs=CRS_METRIC, transform=rasterio.windows.transform(vw, T),
                       compress="deflate", nodata=-1) as dst:
        dst.write(np.where(ok_v, max_depth, -1).astype(np.float32), 1)
    st_q = {nid: round(float(np.max(rt["flow"][nid])), 0) for nid in KEY_NODES if nid in rt["flow"]}
    meta = {
        "event": rt["event"], "method": "HAND + đường quan hệ tổng hợp (mức cơ sở, minh họa có cơ sở vật lý)",
        "bounds": [round(v, 6) for v in view_bounds], "frames": frames, "frame_every_h": FRAME_EVERY_H,
        "max": {"file": "max.png", "area_km2": round(float((max_depth > 0.05).sum()) * cell * cell / 1e6, 1),
                "max_depth_m": round(float(max_depth.max()), 2)},
        "peak_flow_m3s": st_q,
        "nodes": {k: {"name": nodes[k]["name"], "lon": nodes[k].get("lon"), "lat": nodes[k].get("lat")} for k in KEY_NODES},
        "assumptions": ["DEM 30 m, không đê, không triều, không vận tốc",
                        f"Mặt nước đồng bằng làm trơn σ = {SMOOTH_CELLS * 30} m; ảnh xuất {30 * OUT_SCALE} m/điểm ảnh",
                        f"Đồng bằng (< {LOWLAND_M} m): ô gán vào nhánh sông gần nhất; lòng sông sâu {CHANNEL_DEPTH_M} m dưới mặt nước DEM (giả định)",
                        f"Tỷ lệ chia phân lưu giả định: {json.dumps(SPLIT, ensure_ascii=False)}",
                        "Lưu lượng thượng nguồn từ diễn toán Muskingum-Cunge chưa kiểm chứng tại trạm sông",
                        f"Manning n = {N_MANNING}; độ dốc đồng bằng {S_MIN_DELTA}"],
        "unresolved_reaches": len(unresolved),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    size = sum(p.stat().st_size for p in out_dir.iterdir()) / 1e6
    print(f"{f.stem}: {len(frames)} khung, ngập lớn nhất {meta['max']['area_km2']} km², sâu nhất {meta['max']['max_depth_m']} m, "
          f"đoạn chưa có lưu lượng: {len(unresolved)}, dung lượng {size:.1f} MB")
