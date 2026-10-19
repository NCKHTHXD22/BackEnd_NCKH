"""Bước 7 – Khu thí điểm Hội An: nhà 3D, đường, lưới mô phỏng ngập.

Đầu vào : data/raw/hoian/buildings.json, water.json, roads.json (bước 6: 06_hoian_download.py)
          data/raw/dem/Copernicus_DSM_COG_10_N15_00_E108_00_DEM.tif
Đầu ra  : web/public/data/dt/hoian/buildings.json  – nhà dạng nén (tọa độ nguyên 1e-6°, mã hóa sai phân)
          web/public/data/dt/hoian/flood_grid.json – lưới cao độ mặt đất + mực nước bắt đầu ngập của từng ô
          web/public/data/dt/hoian/roads.geojson   – đường (nếu đã tải được)

Mô phỏng ngập (minh họa, KHÔNG phải mô hình thủy lực):
  - DEM Copernicus là mô hình bề mặt (có mái nhà, cây) → lấy cực tiểu cửa sổ 3×3 để xấp xỉ mặt đất.
  - Nguồn nước = biển + mặt nước sông/kênh OSM. Thuật toán priority-flood tính cho mỗi ô "mực nước
    nhỏ nhất để nước từ nguồn tràn tới được ô đó" (fill). Với mực nước WL: ô ngập khi fill < WL,
    độ sâu = WL − cao độ mặt đất. Ô trũng kín không nối với sông sẽ không ngập cho tới khi nước tràn bờ.
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/07_hoian.py
"""
import heapq
import hashlib
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import from_bounds
from shapely.geometry import LineString, Polygon, box
from shapely.ops import polygonize, unary_union

from config import RAW, OUT

BBOX = dict(west=108.29, south=15.855, east=108.39, north=15.91)
SRC = RAW / "hoian"
DST = OUT / "hoian"
DST.mkdir(parents=True, exist_ok=True)
Q = 1e6  # lượng tử tọa độ: 1e-6° ≈ 0,11 m


def els(name):
    p = SRC / f"{name}.json"
    return json.load(open(p, encoding="utf-8"))["elements"] if p.exists() and p.stat().st_size > 1000 else None


def coords(e):
    return [(p["lon"], p["lat"]) for p in e.get("geometry", [])]


# 1) Lưới cao độ ------------------------------------------------------------------------------
dem_path = RAW / "dem" / "Copernicus_DSM_COG_10_N15_00_E108_00_DEM.tif"
with rasterio.open(dem_path) as src:
    win = from_bounds(BBOX["west"], BBOX["south"], BBOX["east"], BBOX["north"], src.transform).round_offsets().round_lengths()
    dsm = src.read(1, window=win).astype("float32")
    tr = src.window_transform(win)
ny, nx = dsm.shape
sea = dsm <= 0.0                                     # biển trong Copernicus có cao độ 0
pad = np.pad(dsm, 1, mode="edge")
dtm = np.min([pad[i:i + ny, j:j + nx] for i in range(3) for j in range(3)], axis=0)  # cực tiểu 3×3
dtm[sea] = 0.0
print(f"Lưới {nx}×{ny} ô (~30 m); cao độ mặt đất {np.percentile(dtm[~sea], 5):.1f}–{np.percentile(dtm[~sea], 95):.1f} m (P5–P95)")

# 2) Nguồn nước: biển + sông/kênh OSM --------------------------------------------------------
water_geoms = []
for e in els("water") or []:
    t = e.get("tags", {})
    if e["type"] == "way" and len(coords(e)) >= 4 and coords(e)[0] == coords(e)[-1] and t.get("natural") == "water":
        water_geoms.append(Polygon(coords(e)))
    elif e["type"] == "way" and t.get("waterway") in ("river", "canal") and len(coords(e)) > 1:
        water_geoms.append(LineString(coords(e)).buffer(0.00015))       # ~15 m mỗi bên
    elif e["type"] == "relation":
        outer = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                 for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        water_geoms += list(polygonize(unary_union(outer)))
water = unary_union([g.buffer(0) for g in water_geoms]).intersection(box(*BBOX.values()))
river = rasterize([(water, 1)], out_shape=(ny, nx), transform=tr, fill=0, all_touched=True).astype(bool)
source = sea | river
print(f"Ô nguồn nước: biển {sea.sum()}, sông/kênh {river.sum()}")

# 3) Priority-flood: mực nước nhỏ nhất để ô bị ngập từ nguồn ----------------------------------
fill = np.full((ny, nx), np.inf, dtype="float32")
heap = []
for r, c in zip(*np.nonzero(source)):
    fill[r, c] = dtm[r, c]
    heapq.heappush(heap, (float(dtm[r, c]), r, c))
while heap:
    h, r, c = heapq.heappop(heap)
    if h > fill[r, c]:
        continue
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < ny and 0 <= cc < nx:
            v = max(float(dtm[rr, cc]), h)
            if v < fill[rr, cc]:
                fill[rr, cc] = v
                heapq.heappush(heap, (v, rr, cc))

west, north = tr.c, tr.f
dx, dy = tr.a, -tr.e
json.dump({
    "west": west, "north": north, "dx": dx, "dy": dy, "nx": nx, "ny": ny,
    "note": "dtm = cao độ mặt đất xấp xỉ (m, EGM2008); fill = mực nước bắt đầu ngập ô (m); hàng từ bắc xuống nam",
    "dtm": np.round(dtm, 2).ravel().tolist(),
    "fill": np.round(fill, 2).ravel().tolist(),
    "source": source.astype(int).ravel().tolist(),
}, open(DST / "flood_grid.json", "w"), separators=(",", ":"))


def cell_of(lon, lat):
    c = min(max(int((lon - west) / dx), 0), nx - 1)
    r = min(max(int((north - lat) / dy), 0), ny - 1)
    return r, c


# 4) Nhà ----------------------------------------------------------------------------------
TYPE_H = {"hotel": 13, "apartments": 16, "commercial": 8, "retail": 7.5, "school": 9, "hospital": 10,
          "temple": 7, "church": 10, "pagoda": 7, "industrial": 9, "warehouse": 8, "house": 6.5}
TYPE_VI = {"house": "Nhà ở", "residential": "Nhà ở", "hotel": "Khách sạn", "apartments": "Chung cư",
           "retail": "Cửa hàng", "commercial": "Thương mại", "school": "Trường học", "hospital": "Bệnh viện",
           "temple": "Đền/miếu", "pagoda": "Chùa", "church": "Nhà thờ", "construction": "Đang xây dựng",
           "industrial": "Công nghiệp", "warehouse": "Kho"}


def jitter(osm_id, span):
    return (int(hashlib.md5(str(osm_id).encode()).hexdigest()[:6], 16) / 0xFFFFFF - 0.5) * span


items, n_tag = [], 0
lat0 = (BBOX["south"] + BBOX["north"]) / 2
m_per_deg = (111320 * np.cos(np.radians(lat0)), 110540)
for e in els("buildings"):
    ring = coords(e)
    if len(ring) < 4:
        continue
    t = e["tags"]
    poly = Polygon(ring)
    if not poly.is_valid or poly.is_empty:
        continue
    area = poly.area * m_per_deg[0] * m_per_deg[1]
    btype = t.get("building", "yes")
    levels = None
    if "height" in t:
        try:
            h = float(str(t["height"]).replace("m", "").strip()); n_tag += 1
        except ValueError:
            h = None
    else:
        h = None
    if h is None and "building:levels" in t:
        try:
            levels = int(float(t["building:levels"])); h = levels * 3.3 + 1; n_tag += 1
        except ValueError:
            pass
    if h is None:   # ước lượng: theo loại nhà, không có thì theo diện tích nền
        h = TYPE_H.get(btype) or (4.5 if area < 40 else 7 if area < 120 else 9 if area < 400 else 10)
        h = round(h + jitter(e["id"], 2.0), 1)
    levels = levels or max(1, round((h - 1) / 3.3))
    cx, cy = poly.centroid.x, poly.centroid.y
    r, c = cell_of(cx, cy)
    q = [(round((x - BBOX["west"]) * Q), round((y - BBOX["south"]) * Q)) for x, y in ring[:-1]]
    flat = [q[0][0], q[0][1]]
    for (x0, y0), (x1, y1) in zip(q, q[1:]):
        flat += [x1 - x0, y1 - y0]
    items.append([e["id"], round(h, 1), levels, round(float(dtm[r, c]), 2), round(float(fill[r, c]), 2),
                  TYPE_VI.get(btype, "Công trình"), t.get("name"), round(area), flat])

json.dump({"west": BBOX["west"], "south": BBOX["south"], "q": Q,
           "fields": ["osm_id", "height_m", "levels", "ground_m", "flood_from_m", "type", "name", "area_m2", "ring"],
           "items": items}, open(DST / "buildings.json", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
fl = np.array([i[4] for i in items])
print(f"Nhà: {len(items)} (có số tầng/chiều cao gốc: {n_tag}); "
      f"ngập ở mực 1 m: {(fl < 1).sum()}, 2 m: {(fl < 2).sum()}, 3 m: {(fl < 3).sum()}")

# 5) Đường ---------------------------------------------------------------------------------
ROAD_CLASS = {"trunk": 1, "primary": 1, "secondary": 2, "tertiary": 2, "residential": 3, "unclassified": 3,
              "living_street": 3, "service": 4, "pedestrian": 3, "footway": 5, "path": 5, "track": 5}
road_els = els("roads")
if road_els:
    rows = [{"name": e["tags"].get("name"), "highway": e["tags"]["highway"],
             "cls": ROAD_CLASS.get(e["tags"]["highway"].replace("_link", ""), 4), "geometry": LineString(coords(e))}
            for e in road_els if len(coords(e)) > 1]
    rd = gpd.GeoDataFrame(rows, crs="EPSG:4326")
    rd = rd[rd["cls"] <= 4].copy()
    rd["code"] = [f"DUONG-{i + 1}" for i in range(len(rd))]
    rd["geometry"] = rd.simplify(0.00001)
    lens = rd.to_crs(32649).length
    rd["length_km"] = (lens / 1000).round(3)
    # mực nước bắt đầu ngập đoạn đường = fill thấp nhất dọc tuyến (lấy mẫu các đỉnh)
    rd["flood_from_m"] = [round(min(float(fill[cell_of(x, y)]) for x, y in g.coords), 2) for g in rd.geometry]
    rd[["code", "name", "highway", "cls", "length_km", "flood_from_m", "geometry"]].to_file(
        DST / "roads.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)
    print(f"Đường: {len(rd)} đoạn, {rd['length_km'].sum():.0f} km")
else:
    print("Chưa có roads.json – bỏ qua lớp đường (chạy lại sau khi tải được)")

for f in sorted(DST.iterdir()):
    print(f"  → hoian/{f.name} ({f.stat().st_size / 1e6:.2f} MB)")
