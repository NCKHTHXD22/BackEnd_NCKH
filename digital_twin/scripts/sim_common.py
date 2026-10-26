"""Phần dùng chung của gói "Mô phỏng diễn biến lũ" cho bản đồ 3D: 23_sim_package.py (xem lại trận lũ đã qua) và
26_forecast_package.py (dự báo theo LSTM). Cùng lưới, cùng cách mã hóa mặt nước, cùng cấu trúc hồ / trạm / sông.

Mặt nước mã hóa uint16 little-endian, khung × ny × nx: z = v/100 − 10 (m, cao độ DEM); 0 = không có số liệu.
"""
import json
import subprocess

import numpy as np
from affine import Affine
from rasterio.warp import transform as warp_xy
from shapely.geometry import LineString

from config import CRS_METRIC, OUT as WEB_OUT, ROOT, WORK

COMPUTE = ROOT / "data" / "compute"
SIM = WEB_OUT / "sim"
HOIAN_STEP = 3 / 3600                     # 3″ ≈ 90 m – mặt nước đã làm trơn σ 300 m nên đủ mịn
REGION_STEP = 10 / 3600                   # 10″ ≈ 300 m – toàn vùng, cho khu tự dựng ("Dựng khu này")
SIMPLIFY_DEG = 0.0004                     # ~40 m
ENCODING = "uint16 little-endian, khung × ny × nx; z = v/100 − 10 (m, cao độ DEM); 0 = không có"

net = json.loads((COMPUTE / "network.json").read_text(encoding="utf-8"))
NODES = {n["id"]: n for n in net["nodes"]}
_gj = json.loads((COMPUTE / "network.geojson").read_text(encoding="utf-8"))
EDGES = [f for f in _gj["features"] if f["properties"]["kind"] == "edge"]
_summary = json.loads((COMPUTE / "station_levels_summary.json").read_text(encoding="utf-8"))
STATION_META = {s["station_code"]: s for s in _summary["stations"]}
# thông số hồ từ nguồn duy nhất src/script/lakeSpecsData.js (như 13_routing.py)
SPEC = {s["lake_id"]: s for s in json.loads(subprocess.run(
    ["node", "--input-type=module", "-e",
     "import('./src/script/lakeSpecsData.js').then(m => console.log(JSON.stringify(m.LAKE_SPECS)))"],
    cwd=ROOT.parent, capture_output=True, text=True, check=True).stdout)}


def geo_grid(west, north, east, south, step):
    """Lưới địa lý đều (tâm ô) + tọa độ UTM của tâm ô để lấy mẫu mặt nước từ lưới UTM của 14/19."""
    nx, ny = int(round((east - west) / step)), int(round((north - south) / step))
    lon, lat = np.meshgrid(west + (np.arange(nx) + 0.5) * step, north - (np.arange(ny) + 0.5) * step)
    xs, ys = warp_xy("EPSG:4326", CRS_METRIC, lon.ravel().tolist(), lat.ravel().tolist())
    return {"west": west, "north": north, "dx": step, "dy": step, "nx": nx, "ny": ny, "xs": np.array(xs), "ys": np.array(ys)}


# lưới đích khu Hội An (địa lý, 3″) – cùng khung flood_grid.json; lưới toàn vùng hạ du (~300 m) – khung bản đồ ngập
_hg = json.loads((WEB_OUT / "hoian" / "flood_grid.json").read_text(encoding="utf-8"))
HOIAN = geo_grid(_hg["west"], _hg["north"], _hg["west"] + _hg["dx"] * _hg["nx"], _hg["north"] - _hg["dy"] * _hg["ny"], HOIAN_STEP)
_vb = np.load(WORK / "hand_grid.npz")["view_bounds"]
REGION = geo_grid(float(_vb[0]), float(_vb[3]), float(_vb[2]), float(_vb[1]), REGION_STEP)
GRIDS = {"hoian": HOIAN, "region": REGION}


def grid_info(g):
    return {k: g[k] for k in ("west", "north", "dx", "dy", "nx", "ny")} | {"encoding": ENCODING}


def r1(v):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), 2)


def encode_frames(wse, transform, g):
    """Mặt nước các khung (mảng khung × hàng × cột trên lưới UTM `transform`) → lưới địa lý g (song tuyến) → bytes uint16."""
    inv = ~Affine(*transform)
    cols, rows = inv * (g["xs"], g["ys"])
    cols, rows = cols - 0.5, rows - 0.5                       # tâm ô
    h, w = wse.shape[1:]
    c0 = np.clip(np.floor(cols).astype(int), 0, w - 2)
    r0 = np.clip(np.floor(rows).astype(int), 0, h - 2)
    fc, fr = np.clip(cols - c0, 0, 1), np.clip(rows - r0, 0, 1)
    out = []
    for fr_wse in wse:
        a, b = fr_wse[r0, c0], fr_wse[r0, c0 + 1]
        c, d = fr_wse[r0 + 1, c0], fr_wse[r0 + 1, c0 + 1]
        v = np.stack([a, b, c, d])
        wgt = np.stack([(1 - fc) * (1 - fr), fc * (1 - fr), (1 - fc) * fr, fc * fr])
        ok = np.isfinite(v)
        val = np.where(ok.any(0), np.nansum(np.where(ok, v * wgt, 0), 0) / np.maximum((wgt * ok).sum(0), 1e-9), np.nan)
        enc = np.where(np.isfinite(val), np.clip(np.round((val + 10) * 100), 1, 65535), 0).astype("<u2")
        out.append(enc.reshape(g["ny"], g["nx"]))
    return np.stack(out).tobytes()


def lake_entry(lid, q_in, q_out, h, rain, mode=None):
    """Một hồ trong sim.json: vị trí theo mạng sông, mực nước đặc trưng theo QĐ 1865, chuỗi giờ."""
    sp, node = SPEC.get(int(lid), {}), NODES.get(f"HO-{lid}")
    return {"id": int(lid), "name": sp.get("name", f"Hồ {lid}"),
            "lon": node and node["lon"], "lat": node and node["lat"],
            "MNC": sp.get("MNC"), "MNDBT": sp.get("MNDBT"), "MNGC": sp.get("MNGC"),
            "q_in": [r1(v) for v in q_in], "q_out": [r1(v) for v in q_out],
            "h": [r1(v) for v in h], "rain": [r1(v) for v in rain], "mode": mode}


def station_entries(levels):
    """Trạm KTTV có tọa độ trong sim.json; levels: {mã trạm: chuỗi mực nước giờ}."""
    return [{"code": s["station_code"], "name": s["name"], "lon": s.get("lon"), "lat": s.get("lat"),
             "alarm": s.get("alarm"), "h": levels[s["station_code"]]}
            for s in _summary["stations"] if s.get("lat") and s["station_code"] in levels]


def river_entries(reach_q, node_flow, n):
    """43 đoạn sông (đã giản lược) + lưu lượng giờ: đoạn trong vùng tính lấy reach_q["từ|đến"]; đoạn núi ngoài vùng
    lấy Q tại nút hạ lưu (nút đập → thượng lưu đập) của diễn toán."""
    rivers = []
    for f in EDGES:
        p = f["properties"]
        k = f"{p['from']}|{p['to']}"
        if k in reach_q:
            q = reach_q[k]
        else:
            node = p["to"] if (p["to"] in node_flow and not p["to"].startswith("HO-")) else p["from"]
            q = node_flow.get(node)
        if q is None:
            continue
        line = LineString(f["geometry"]["coordinates"]).simplify(SIMPLIFY_DEG)
        rivers.append({"from": p["from"], "to": p["to"], "river": p.get("river"), "source": p.get("source"),
                       "coords": [[round(x, 5), round(y, 5)] for x, y in line.coords],
                       "q": [round(float(v)) for v in q[:n]]})
    return rivers
