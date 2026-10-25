"""Bước 23 – Đóng gói dữ liệu cho chế độ "Mô phỏng diễn biến lũ" trên bản đồ 3D (lộ trình 9.1).

Mọi thứ theo CÙNG trục thời gian giờ của trận (11_event_series.py – bắt đầu trước cửa sổ bản đồ ngập 48 giờ để thấy
mưa → hồ → hạ du):
  lakes     16 hồ: Q đến, Q xả, mực nước, mưa đo theo giờ + chế độ QĐ 1865 (21_qd1865_replay.mjs) cho 5 hồ có quy tắc
  stations  9 trạm KTTV: mực nước giờ đo (20_routing_check.py → station_events/) + mức báo động, tọa độ VNDMS
  rivers    43 đoạn sông (network.geojson, đã giản lược) + lưu lượng giờ từng đoạn (14_hand.py → reach_flows; đoạn núi
            ngoài vùng tính lấy Q tại nút từ 13_routing.py)
  region    mặt nước toàn vùng hạ du mỗi 3 giờ trên lưới 10″ (~300 m) – cho khu người dùng tự dựng
  hoian     mặt nước khu thí điểm Hội An mỗi 3 giờ trên lưới 3″ (~90 m), cao độ theo DEM (cùng hệ với nhà/đường của
            07_hoian.py), cho hai phương án: theo lưu lượng (14) và theo mực nước trạm (19) → file .bin uint16
            (cm + 1000; 0 = không có số liệu); trình duyệt tự tính độ sâu tại từng nhà, đoạn đường, ô mặt nước 3D.
Không có dự báo Q đến lưu trữ cho các trận 2025 (forecast_LSTM bắt đầu 30/3/2026) → không đóng gói dự báo.

Đầu ra: web/public/data/dt/sim/<trận>/sim.json, hoian_{flow,stage}.bin, region_{flow,stage}.bin
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/23_sim_package.py   (sau 14, 19, 20, 21)
"""
import json
import subprocess

import numpy as np
import pandas as pd
from affine import Affine
from rasterio.warp import transform as warp_xy
from shapely.geometry import LineString

from config import CRS_METRIC, OUT as WEB_OUT, ROOT, WORK

COMPUTE = ROOT / "data" / "compute"
SIM = WEB_OUT / "sim"
HOIAN_STEP = 3 / 3600                     # 3″ ≈ 90 m – mặt nước đã làm trơn σ 300 m nên đủ mịn
REGION_STEP = 10 / 3600                   # 10″ ≈ 300 m – toàn vùng, cho khu tự dựng ("Dựng khu này")
SIMPLIFY_DEG = 0.0004                     # ~40 m

events = json.loads((COMPUTE / "events.json").read_text(encoding="utf-8"))
net = json.loads((COMPUTE / "network.json").read_text(encoding="utf-8"))
nodes = {n["id"]: n for n in net["nodes"]}
gj = json.loads((COMPUTE / "network.geojson").read_text(encoding="utf-8"))
edges = [f for f in gj["features"] if f["properties"]["kind"] == "edge"]
summary = json.loads((COMPUTE / "station_levels_summary.json").read_text(encoding="utf-8"))
replay = json.loads((COMPUTE / "qd1865_replay.json").read_text(encoding="utf-8"))
hgrid = json.loads((WEB_OUT / "hoian" / "flood_grid.json").read_text(encoding="utf-8"))
# thông số hồ từ nguồn duy nhất src/script/lakeSpecsData.js (như 13_routing.py)
specs = json.loads(subprocess.run(
    ["node", "--input-type=module", "-e",
     "import('./src/script/lakeSpecsData.js').then(m => console.log(JSON.stringify(m.LAKE_SPECS)))"],
    cwd=ROOT.parent, capture_output=True, text=True, check=True).stdout)
SPEC = {s["lake_id"]: s for s in specs}



def geo_grid(west, north, east, south, step):
    """Lưới địa lý đều (tâm ô) + tọa độ UTM của tâm ô để lấy mẫu mặt nước từ lưới UTM của 14/19."""
    nx, ny = int(round((east - west) / step)), int(round((north - south) / step))
    lon, lat = np.meshgrid(west + (np.arange(nx) + 0.5) * step, north - (np.arange(ny) + 0.5) * step)
    xs, ys = warp_xy("EPSG:4326", CRS_METRIC, lon.ravel().tolist(), lat.ravel().tolist())
    return {"west": west, "north": north, "dx": step, "dy": step, "nx": nx, "ny": ny, "xs": np.array(xs), "ys": np.array(ys)}


# lưới đích khu Hội An (địa lý, 3″) – cùng khung flood_grid.json; lưới toàn vùng hạ du (~300 m) – khung bản đồ ngập
H_WEST, H_NORTH = hgrid["west"], hgrid["north"]
HOIAN = geo_grid(H_WEST, H_NORTH, H_WEST + hgrid["dx"] * hgrid["nx"], H_NORTH - hgrid["dy"] * hgrid["ny"], HOIAN_STEP)
vb = np.load(WORK / "hand_grid.npz")["view_bounds"]
REGION = geo_grid(float(vb[0]), float(vb[3]), float(vb[2]), float(vb[1]), REGION_STEP)


def r1(v):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), 2)


def resample_frames(npz_path, master0, g):
    """Mặt nước các khung (lưới UTM) → lưới địa lý g (song tuyến), uint16 = round((z + 10) × 100); trả (giờ trên trục chính, bytes)."""
    z = np.load(npz_path)
    T = Affine(*z["transform"])
    inv = ~T
    cols, rows = inv * (g["xs"], g["ys"])
    cols, rows = cols - 0.5, rows - 0.5                       # tâm ô
    h, w = z["wse"].shape[1:]
    c0 = np.clip(np.floor(cols).astype(int), 0, w - 2)
    r0 = np.clip(np.floor(rows).astype(int), 0, h - 2)
    fc, fr = np.clip(cols - c0, 0, 1), np.clip(rows - r0, 0, 1)
    out = []
    for fr_wse in z["wse"]:
        a, b = fr_wse[r0, c0], fr_wse[r0, c0 + 1]
        c, d = fr_wse[r0 + 1, c0], fr_wse[r0 + 1, c0 + 1]
        v = np.stack([a, b, c, d])
        wgt = np.stack([(1 - fc) * (1 - fr), fc * (1 - fr), (1 - fc) * fr, fc * fr])
        ok = np.isfinite(v)
        val = np.where(ok.any(0), np.nansum(np.where(ok, v * wgt, 0), 0) / np.maximum((wgt * ok).sum(0), 1e-9), np.nan)
        enc = np.where(np.isfinite(val), np.clip(np.round((val + 10) * 100), 1, 65535), 0).astype("<u2")
        out.append(enc.reshape(g["ny"], g["nx"]))
    offset_h = int(round((pd.Timestamp(str(z["time0"])) - master0) / pd.Timedelta(hours=1)))
    return [offset_h + int(t) for t in z["frame_t"]], np.stack(out).tobytes()


for key in ("calibration", "validation"):
    name = f"{key}_{events[key]['peak_st2'][:10].replace('-', '')}"
    ev = json.loads((COMPUTE / "events" / f"{name}.json").read_text(encoding="utf-8"))
    times = ev["time"]
    master0 = pd.Timestamp(times[0])
    tindex = {t: i for i, t in enumerate(times)}
    n = len(times)

    # ---------------------------------------------------------------- hồ chứa
    rp = replay["events"].get(name, {})
    lakes = []
    for lid, d in ev["lakes"].items():
        sp, node = SPEC.get(int(lid), {}), nodes.get(f"HO-{lid}")
        mode = [None] * n
        for row in rp.get(lid, {}).get("timeline", []):
            if row["t"] in tindex:
                mode[tindex[row["t"]]] = row["mode"]
        lakes.append({
            "id": int(lid), "name": sp.get("name", f"Hồ {lid}"),
            "lon": node and node["lon"], "lat": node and node["lat"],
            "MNC": sp.get("MNC"), "MNDBT": sp.get("MNDBT"), "MNGC": sp.get("MNGC"),
            "q_in": [r1(v) for v in d["inflow"]], "q_out": [r1(v) for v in d["outflow"]],
            "h": [r1(v) for v in d["water_level"]], "rain": [r1(v) for v in d["rain"]],
            "mode": mode if any(mode) else None,
        })
    lakes.sort(key=lambda l: -max((v or 0) for v in l["q_in"]))
    rain = np.array([[np.nan if v is None else v for v in l["rain"]] for l in lakes], float)
    basin_rain = [r1(v) for v in np.nanmean(rain, 0)]

    # ---------------------------------------------------------------- trạm KTTV
    st = json.loads((COMPUTE / "station_events" / f"{name}.json").read_text(encoding="utf-8"))
    stations = [{"code": s["station_code"], "name": s["name"], "lon": s.get("lon"), "lat": s.get("lat"),
                 "alarm": s.get("alarm"), "h": st["levels"].get(s["station_code"])}
                for s in summary["stations"] if s.get("lat") and s["station_code"] in st["levels"]]

    # ---------------------------------------------------------------- sông + lưu lượng giờ
    rt = json.loads((COMPUTE / "routing" / f"{name}.json").read_text(encoding="utf-8"))
    rf = json.loads((WORK / f"reach_flows_{name}.json").read_text(encoding="utf-8"))["reaches"]
    rivers = []
    for f in edges:
        p = f["properties"]
        k = f"{p['from']}|{p['to']}"
        if k in rf:
            q = rf[k]
        else:                                    # đoạn núi ngoài vùng tính: Q tại nút hạ lưu (nút đập → thượng lưu đập)
            node = p["to"] if (p["to"] in rt["flow"] and not p["to"].startswith("HO-")) else p["from"]
            q = rt["flow"].get(node)
        if q is None:
            continue
        line = LineString(f["geometry"]["coordinates"]).simplify(SIMPLIFY_DEG)
        rivers.append({"from": p["from"], "to": p["to"], "river": p.get("river"), "source": p.get("source"),
                       "coords": [[round(x, 5), round(y, 5)] for x, y in line.coords],
                       "q": [round(float(v)) for v in q[:n]]})

    # ---------------------------------------------------------------- mặt nước Hội An
    out_dir = SIM / name
    out_dir.mkdir(parents=True, exist_ok=True)
    enc = "uint16 little-endian, khung × ny × nx; z = v/100 − 10 (m, cao độ DEM); 0 = không có"
    grids = {}
    for key2, g in (("hoian", HOIAN), ("region", REGION)):
        grids[key2] = {"grid": {k: g[k] for k in ("west", "north", "dx", "dy", "nx", "ny")} | {"encoding": enc}, "methods": {}}
        for method in ("stage", "flow"):
            p = WORK / f"wse_{key2}_{method}_{name}.npz"
            if not p.exists():
                continue
            hours, blob = resample_frames(p, master0, g)
            (out_dir / f"{key2}_{method}.bin").write_bytes(blob)
            grids[key2]["methods"][method] = {"file": f"{key2}_{method}.bin", "frame_hours": hours}
    hoian = grids["hoian"]

    sim = {
        "event": name, "time": times, "time_zone": "giờ Việt Nam",
        "flood_window": [events[key]["window_start"], events[key]["window_end"]],
        "basin_rain_mm": basin_rain, "lakes": lakes, "stations": stations, "rivers": rivers, "hoian": hoian,
        "region": grids["region"],
        "notes": ["Số liệu đo xem lại – chưa có dự báo Q đến lưu trữ cho trận này (cần chạy dự báo ngược)",
                  "Mưa: trung bình các điểm đo tại hồ (mm/giờ)"],
    }
    (out_dir / "sim.json").write_text(json.dumps(sim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = sum(p.stat().st_size for p in out_dir.iterdir()) / 1e6
    print(f"{name}: {n} giờ, {len(lakes)} hồ, {len(stations)} trạm, {len(rivers)} đoạn sông, "
          f"Hội An {HOIAN['nx']}×{HOIAN['ny']} ô, toàn vùng {REGION['nx']}×{REGION['ny']} ô × {[len(v['frame_hours']) for v in hoian['methods'].values()]} khung, {size:.1f} MB → {out_dir}")
