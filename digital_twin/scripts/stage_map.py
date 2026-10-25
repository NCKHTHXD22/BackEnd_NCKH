"""Mặt nước nội suy từ mực nước trạm đo → độ sâu ngập trên lưới HAND (dùng chung cho 19_hand_stage.py, 22_flood_scenarios.py).

Nạp khi import: lưới của 14_hand.py (data/work/hand_grid.npz), đồ thị ô sông vùng thấp, khoảng cách dọc sông từ trạm,
chuỗi mực nước trạm (17_station_levels.py) và hằng số triều (18_tide_sontra.py). Phương pháp: xem 19_hand_stage.py.
"""
import json
import pickle

import numpy as np
import pandas as pd
import rasterio
import utide
from affine import Affine
from PIL import Image
from rasterio.warp import transform as warp_xy
from scipy import ndimage, sparse
from scipy.sparse.csgraph import dijkstra

from config import CRS_METRIC, OUT as WEB_OUT, ROOT, WORK

COMPUTE = ROOT / "data" / "compute"
NODES = {n["id"]: n for n in json.loads((COMPUTE / "network.json").read_text(encoding="utf-8"))["nodes"]}
# trạm (mã 17_station_levels) → nút mạng sông đã bắt vào dòng chính; cửa sông nhận triều Sơn Trà
STATIONS = {"NONGSON": "ST-NONGSON", "GIAOTHUY": "ST-GIAOTHUY", "AINGHIA": "ST-AINGHIA", "CAULAU": "ST-CAULAU",
            "HOIAN": "ST-HOIAN", "CAMLE": "ST-CAMLE"}
OUTLETS = ["OUT-Hàn", "OUT-ThuBồn"]
FLOOD_DEM_MAX = 25.0       # chỉ xét ô thấp hơn (đỉnh lũ Nông Sơn 2025 = 18,7 m)
STREAM_DEM_MAX = 24.0      # ô sông "vùng thấp" dùng làm đồ thị (như low_stream ở bước 14)
IDW_D0 = 500.0             # m – tránh trọng số vô hạn tại trạm
SNAP_MAX_M = 1000.0        # bỏ điểm bắt vào mạng sông xa hơn
GAP_H = 6                  # nội suy chỗ thiếu số liệu trạm ≤ 6 giờ
FRAME_EVERY_H, OUT_SCALE = 3, 2
PALETTE = [(0.0, (180, 220, 255)), (0.5, (110, 180, 245)), (1.0, (50, 130, 220)), (2.0, (25, 80, 190)), (4.0, (10, 40, 130))]

g = np.load(WORK / "hand_grid.npz")
dem, streams = g["dem"].astype(np.float64), g["streams"]
T = Affine(*g["transform"])
r0, c0, vh, vw = map(int, g["view"])
view_bounds = [round(float(v), 6) for v in g["view_bounds"]]
SMOOTH = int(g["smooth_cells"])
H, W = dem.shape
valid = dem > -1000

# ------------------------------------------------------------------ đồ thị ô sông vùng thấp + khoảng cách dọc sông
low_stream = (streams > 0) & valid & (dem < STREAM_DEM_MAX)
sid = -np.ones((H, W), np.int64)
rs, cs = np.nonzero(low_stream)
sid[rs, cs] = np.arange(len(rs))
rows, cols, dist = [], [], []
for dr, dc in [(0, 1), (1, 0), (1, 1), (1, -1)]:
    r2, c2 = rs + dr, cs + dc
    ok = (r2 < H) & (c2 >= 0) & (c2 < W)
    a, b = sid[rs[ok], cs[ok]], sid[r2[ok], c2[ok]]
    m = b >= 0
    rows += [a[m]]; cols += [b[m]]; dist += [np.full(m.sum(), 30.0 * np.hypot(dr, dc))]
G = sparse.coo_matrix((np.concatenate(dist), (np.concatenate(rows), np.concatenate(cols))), shape=(len(rs),) * 2).tocsr()
# ô gần nhất thuộc mạng sông vùng thấp – để bắt điểm và gán bãi tràn
_, (ni, nj) = ndimage.distance_transform_edt(~low_stream, return_indices=True)


def snap(lon, lat):
    x, y = warp_xy("EPSG:4326", CRS_METRIC, [lon], [lat])
    c, r = ~T * (x[0], y[0])
    r, c = int(r), int(c)
    rr, cc = ni[r, c], nj[r, c]
    return sid[rr, cc], 30.0 * np.hypot(rr - r, cc - c)


sources, skipped = {}, []
for code, node in [*STATIONS.items(), *((o, o) for o in OUTLETS)]:
    n = NODES[node]
    s, d = snap(n["lon"], n["lat"])
    if d > SNAP_MAX_M:          # mạng sông chưa ra tới cửa (vd. cửa Hàn cách 8,5 km) – đặt triều sai chỗ còn tệ hơn không đặt
        skipped.append(f"{code} (ô sông gần nhất cách {d / 1000:.1f} km)")
        print(f"{code:10s} bỏ: ô sông gần nhất cách {d:.0f} m")
        continue
    sources[code] = s
    print(f"{code:10s} → ô sông {s} (bắt {d:.0f} m)")
OUTLETS = [o for o in OUTLETS if o in sources]
codes = list(sources)
D = dijkstra(G, directed=False, indices=[sources[c] for c in codes])          # (nguồn × ô sông), m
Wt = np.where(np.isfinite(D), 1.0 / (D + IDW_D0) ** 2, 0.0)

# ------------------------------------------------------------------ chuỗi mực nước trạm + triều theo giờ
lv = pd.read_parquet(WORK / "station_levels_hourly.parquet")
lv = lv[(lv.qc_flag == "ok") & lv.station_code.isin(STATIONS)]
with open(WORK / "tide_sontra_coef.pkl", "rb") as f:
    tide_coef = pickle.load(f)


def series(ev):
    idx = pd.date_range(ev["window_start"], ev["window_end"], freq="h")
    out = {}
    for code in STATIONS:
        s = lv[lv.station_code == code].drop_duplicates("t_vn").set_index("t_vn").level_m.sort_index()
        s = s[(s.index >= idx[0] - pd.Timedelta(hours=GAP_H)) & (s.index <= idx[-1] + pd.Timedelta(hours=GAP_H))]
        full = s.reindex(s.index.union(idx)).interpolate("time", limit=GAP_H, limit_area="inside")
        out[code] = full.reindex(idx)
    tide = utide.reconstruct((idx - pd.Timedelta(hours=7)).to_pydatetime(), tide_coef, verbose=False).h
    for o in OUTLETS:
        out[o] = pd.Series(tide, index=idx)
    return idx, pd.DataFrame(out)[codes]


# ------------------------------------------------------------------ mặt nước → độ sâu trên khung nhìn
sl = (slice(r0, r0 + vh), slice(c0, c0 + vw))
dem_v, valid_v = dem[sl], valid[sl]
owner_v = sid[ni[sl], nj[sl]]                                   # ô sông gần nhất của mỗi ô
floodable_v = valid_v & (dem_v < FLOOD_DEM_MAX)
river_v = (streams[sl] > 0)


def wse_field(h_row):
    """Mặt nước (m, hệ cao độ trạm) trên khung nhìn cho một giờ."""
    avail = np.isfinite(h_row)
    num = h_row[avail] @ Wt[avail]
    den = Wt[avail].sum(0)
    ws = np.where(den > 0, num / np.where(den > 0, den, 1), np.nan)
    f = np.where(floodable_v, ws[owner_v], np.nan)
    m = np.isfinite(f)
    a = ndimage.gaussian_filter(np.where(m, f, 0.0), SMOOTH)
    b = ndimage.gaussian_filter(m.astype(float), SMOOTH)
    return np.where(m & (b > 1e-3), a / np.maximum(b, 1e-3), np.nan)


def depth_of(wse, shift):
    d = np.where(np.isfinite(wse), wse + shift - dem_v, 0.0)
    return np.where(river_v, 0.0, np.clip(d, 0, None))


def colorize(depth):
    rgba = np.zeros(depth.shape + (4,), np.uint8)
    wet = depth > 0.05
    for lim, col in PALETTE:
        rgba[wet & (depth >= lim), :3] = col
    rgba[wet, 3] = np.clip(120 + depth[wet] * 40, 120, 220).astype(np.uint8)
    return rgba


def save_png(depth, path):
    d = depth[: depth.shape[0] // OUT_SCALE * OUT_SCALE, : depth.shape[1] // OUT_SCALE * OUT_SCALE]
    d = d.reshape(d.shape[0] // OUT_SCALE, OUT_SCALE, d.shape[1] // OUT_SCALE, OUT_SCALE).mean(axis=(1, 3))
    Image.fromarray(colorize(d), "RGBA").quantize(colors=24, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
