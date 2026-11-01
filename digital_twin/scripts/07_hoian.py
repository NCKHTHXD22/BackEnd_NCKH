"""Bước 7 – Khu Hội An (toàn bộ phường Hội An, Hội An Đông, Hội An Tây + xã đảo Tân Hiệp – Cù Lao Chàm):
nhà 3D, đường, cây, lưới mô phỏng ngập.

Đầu vào : data/raw/hoian/{buildings,water,roads}[_culaocham].json (bước 6: 06_hoian_download.py)
          data/raw/hoian/gob25d_2023[_culaocham].tif, worldcover_2021[_culaocham].tif (bước 6)
          data/raw/dem/Copernicus_DSM_COG_10_N15_00_E108_00_DEM.tif
          web/public/data/dt/admin_wards.geojson (bước 24) – gắn phường/xã cho từng nhà
Đầu ra  : web/public/data/dt/hoian/buildings.json  – nhà dạng nén (tọa độ nguyên 1e-6°, mã hóa sai phân)
          web/public/data/dt/hoian/flood_grid.json – lưới cao độ mặt đất + mực nước bắt đầu ngập của từng ô (đất liền)
          web/public/data/dt/hoian/roads.geojson   – đường (nếu đã tải được)
          web/public/data/dt/hoian/trees.json      – vị trí cây minh họa (tọa độ nguyên 1e-5°)
Chiều cao nhà, theo thứ tự ưu tiên (trường h_src): "osm" – thẻ height / building:levels của OSM; "google" – trung vị
chiều cao Google Open Buildings 2.5D 2023 trong nền nhà (khi Google thấy có nhà); "est" – ước lượng theo loại/diện tích.
Cù Lao Chàm cách bờ ~15 km: tính lưới riêng (chỉ để gán cao độ/mực ngập cho nhà, đường trên đảo), không ghi vào
flood_grid.json – nếu gộp, lưới sẽ thành ~0,45 triệu ô, phần lớn là biển.
Khung mô phỏng theo thời gian (23/26) KHÔNG đổi theo lưới này – xem HOIAN_SIM_FRAME trong config.py.

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
from collections import Counter

import geopandas as gpd
import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.windows import from_bounds
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import polygonize, unary_union
from shapely.prepared import prep

from config import RAW, OUT

# khung khớp 06_hoian_download.py; BBOX (đất liền) cũng là gốc mã hóa tọa độ nhà
BBOX = dict(west=108.285, south=15.85, east=108.395, north=15.926)
BBOX_ISLAND = dict(west=108.415, south=15.9, east=108.545, north=15.985)
WARDS = {"20410": "Phường Hội An", "20413": "Phường Hội An Đông", "20401": "Phường Hội An Tây", "20434": "Xã Tân Hiệp"}
SRC = RAW / "hoian"
DST = OUT / "hoian"
DST.mkdir(parents=True, exist_ok=True)
Q = 1e6  # lượng tử tọa độ: 1e-6° ≈ 0,11 m


def els(name):
    p = SRC / f"{name}.json"
    return json.load(open(p, encoding="utf-8"))["elements"] if p.exists() and p.stat().st_size > 100 else None


def coords(e):
    return [(p["lon"], p["lat"]) for p in e.get("geometry", [])]


dem_path = RAW / "dem" / "Copernicus_DSM_COG_10_N15_00_E108_00_DEM.tif"


def flood_grid(bb, water_els, label):
    """Lưới ~30 m trên khung `bb`: cao độ mặt đất xấp xỉ, ô nguồn nước, mực nước bắt đầu ngập (priority-flood)."""
    # 1) Lưới cao độ
    with rasterio.open(dem_path) as src:
        win = from_bounds(bb["west"], bb["south"], bb["east"], bb["north"], src.transform).round_offsets().round_lengths()
        dsm = src.read(1, window=win).astype("float32")
        tr = src.window_transform(win)
    ny, nx = dsm.shape
    sea = dsm <= 0.0                                     # biển trong Copernicus có cao độ 0
    pad = np.pad(dsm, 1, mode="edge")
    dtm = np.min([pad[i:i + ny, j:j + nx] for i in range(3) for j in range(3)], axis=0)  # cực tiểu 3×3
    dtm[sea] = 0.0
    print(f"{label}: lưới {nx}×{ny} ô (~30 m); cao độ mặt đất "
          f"{np.percentile(dtm[~sea], 5):.1f}–{np.percentile(dtm[~sea], 95):.1f} m (P5–P95)")

    # 2) Nguồn nước: biển + sông/kênh OSM
    water_geoms = []
    for e in water_els or []:
        t = e.get("tags", {})
        if e["type"] == "way" and len(coords(e)) >= 4 and coords(e)[0] == coords(e)[-1] and t.get("natural") == "water":
            water_geoms.append(Polygon(coords(e)))
        elif e["type"] == "way" and t.get("waterway") in ("river", "canal") and len(coords(e)) > 1:
            water_geoms.append(LineString(coords(e)).buffer(0.00015))       # ~15 m mỗi bên
        elif e["type"] == "relation":
            outer = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                     for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
            water_geoms += list(polygonize(unary_union(outer)))
    river = np.zeros((ny, nx), bool)
    if water_geoms:
        water = unary_union([g.buffer(0) for g in water_geoms]).intersection(box(*bb.values()))
        if not water.is_empty:
            river = rasterize([(water, 1)], out_shape=(ny, nx), transform=tr, fill=0, all_touched=True).astype(bool)
    source = sea | river
    print(f"{label}: ô nguồn nước – biển {sea.sum()}, sông/kênh {river.sum()}")

    # 3) Priority-flood: mực nước nhỏ nhất để ô bị ngập từ nguồn
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
    return dict(dtm=dtm, fill=fill, source=source, west=tr.c, north=tr.f, dx=tr.a, dy=-tr.e, nx=nx, ny=ny)


def cell_of(g, lon, lat):
    c = min(max(int((lon - g["west"]) / g["dx"]), 0), g["nx"] - 1)
    r = min(max(int((g["north"] - lat) / g["dy"]), 0), g["ny"] - 1)
    return r, c


main = flood_grid(BBOX, els("water"), "Đất liền")
island = flood_grid(BBOX_ISLAND, els("water_culaocham"), "Cù Lao Chàm")
json.dump({
    "west": main["west"], "north": main["north"], "dx": main["dx"], "dy": main["dy"], "nx": main["nx"], "ny": main["ny"],
    "note": "dtm = cao độ mặt đất xấp xỉ (m, EGM2008); fill = mực nước bắt đầu ngập ô (m); hàng từ bắc xuống nam",
    "dtm": np.round(main["dtm"], 2).ravel().tolist(),
    "fill": np.round(main["fill"], 2).ravel().tolist(),
    "source": main["source"].astype(int).ravel().tolist(),
}, open(DST / "flood_grid.json", "w"), separators=(",", ":"))

# Phường/xã sau sáp nhập (bước 24)
_wards = json.loads((OUT / "admin_wards.geojson").read_text(encoding="utf-8"))["features"]
WARD_SHAPES = [(WARDS[f["properties"]["ma_xa"]], prep(shape(f["geometry"])))
               for f in _wards if f["properties"]["ma_xa"] in WARDS]
assert len(WARD_SHAPES) == len(WARDS), "admin_wards.geojson thiếu phường/xã Hội An – chạy lại bước 24"


def ward_of(lon, lat):
    p = Point(lon, lat)
    return next((name for name, s in WARD_SHAPES if s.contains(p)), None)


# Nhà/đường của từng vùng đi kèm lưới của vùng đó (đảo không nằm trong lưới đất liền)
REGIONS = [("", main), ("_culaocham", island)]

# 4) Nhà ----------------------------------------------------------------------------------
TYPE_H = {"hotel": 13, "apartments": 16, "commercial": 8, "retail": 7.5, "school": 9, "hospital": 10,
          "temple": 7, "church": 10, "pagoda": 7, "industrial": 9, "warehouse": 8, "house": 6.5}
TYPE_VI = {"house": "Nhà ở", "residential": "Nhà ở", "hotel": "Khách sạn", "apartments": "Chung cư",
           "retail": "Cửa hàng", "commercial": "Thương mại", "school": "Trường học", "hospital": "Bệnh viện",
           "temple": "Đền/miếu", "pagoda": "Chùa", "church": "Nhà thờ", "construction": "Đang xây dựng",
           "industrial": "Công nghiệp", "warehouse": "Kho"}


def jitter(osm_id, span):
    return (int(hashlib.md5(str(osm_id).encode()).hexdigest()[:6], 16) / 0xFFFFFF - 0.5) * span


# Chiều cao đo từ ảnh vệ tinh: dùng khi xác suất có nhà trung bình trong nền nhà ≥ 0,3 (thấp hơn thường là nhà nhỏ,
# dưới tán cây – Google không thấy) và chiều cao ≥ 2,5 m. Độ nét thật ~4 m nên nhà ống hẹp lẫn một phần nhà bên cạnh.
GOB_MIN_PRESENCE = 0.3
GOB_MIN_H = 2.5
_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32649", always_xy=True)


def gob_sampler(suffix):
    """Hàm ring (lon, lat) → (trung vị chiều cao m, xác suất có nhà TB) từ gob25d_2023*.tif; None nếu chưa tải."""
    p = SRC / f"gob25d_2023{suffix}.tif"
    if not p.exists():
        print(f"Chưa có {p.name} – chiều cao chỉ theo OSM/ước lượng (chạy 06_hoian_download.py)")
        return None
    with rasterio.open(p) as s:
        hgt, pres = s.read()
        T = s.transform
    inv, (ny, nx) = ~T, hgt.shape

    def sample(ring):
        x, y = _to_utm.transform(*np.asarray(ring).T)
        c0, r0 = inv * (x.min(), y.max())
        c1, r1 = inv * (x.max(), y.min())
        c0, r0, c1, r1 = max(int(c0), 0), max(int(r0), 0), min(int(np.ceil(c1)), nx), min(int(np.ceil(r1)), ny)
        if c1 <= c0 or r1 <= r0:
            return None
        cc, rr = np.meshgrid(np.arange(c0, c1), np.arange(r0, r1))
        inside = shapely.contains_xy(Polygon(zip(x, y)), *(T * (cc + 0.5, rr + 0.5)))
        if not inside.any():   # nền nhà nhỏ hơn ô lưới: lấy ô chứa tâm
            c, r = inv * (x.mean(), y.mean())
            inside = (cc == min(int(c), nx - 1)) & (rr == min(int(r), ny - 1))
        h, pr = hgt[r0:r1, c0:c1][inside], pres[r0:r1, c0:c1][inside]
        ok = h != 65535
        return (float(np.median(h[ok])) / 10, float(pr[ok].mean()) / 100) if ok.any() else None
    return sample


lat0 = (BBOX["south"] + BBOX["north"]) / 2
m_per_deg = (111320 * np.cos(np.radians(lat0)), 110540)
n_tag = n_gob = 0


def building_item(e, g, gob):
    """Một nhà OSM → hàng của buildings.json (None nếu hình học hỏng); `g` = lưới, `gob` = hàm chiều cao Google
    của vùng chứa nhà."""
    global n_tag, n_gob
    ring = coords(e)
    if len(ring) < 4:
        return None
    t = e["tags"]
    poly = Polygon(ring)
    if not poly.is_valid or poly.is_empty:
        return None
    area = poly.area * m_per_deg[0] * m_per_deg[1]
    btype = t.get("building", "yes")
    levels = None
    h = None
    if "height" in t:
        try:
            h = float(str(t["height"]).replace("m", "").strip()) or None
        except ValueError:
            pass
    if h is None and "building:levels" in t:      # vài nhà OSM ghi số tầng ≤ 0 (tầng hầm) – bỏ qua
        try:
            levels = int(float(t["building:levels"])) if float(t["building:levels"]) >= 1 else None
            h = levels and levels * 3.3 + 1
        except ValueError:
            pass
    n_tag += h is not None
    h_src = "osm"
    if h is None and gob and (m := gob(ring)) and m[1] >= GOB_MIN_PRESENCE and m[0] >= GOB_MIN_H:
        h, h_src = round(m[0], 1), "google"
        n_gob += 1
    if h is None:   # ước lượng: theo loại nhà, không có thì theo diện tích nền
        h = TYPE_H.get(btype) or (4.5 if area < 40 else 7 if area < 120 else 9 if area < 400 else 10)
        h, h_src = round(h + jitter(e["id"], 2.0), 1), "est"
    levels = levels or max(1, round((h - 1) / 3.3))
    cx, cy = poly.centroid.x, poly.centroid.y
    r, c = cell_of(g, cx, cy)
    q = [(round((x - BBOX["west"]) * Q), round((y - BBOX["south"]) * Q)) for x, y in ring[:-1]]
    flat = [q[0][0], q[0][1]]
    for (x0, y0), (x1, y1) in zip(q, q[1:]):
        flat += [x1 - x0, y1 - y0]
    return [e["id"], round(h, 1), levels, round(float(g["dtm"][r, c]), 2), round(float(g["fill"][r, c]), 2),
            TYPE_VI.get(btype, "Công trình"), t.get("name"), round(area), ward_of(cx, cy), h_src, flat]


GOB = {suffix: gob_sampler(suffix) for suffix, _ in REGIONS}
items, seen, footprints = [], set(), []
for suffix, g in REGIONS:
    for e in els(f"buildings{suffix}") or []:
        if e["id"] not in seen and (it := building_item(e, g, GOB[suffix])):
            seen.add(e["id"])
            items.append(it)
            footprints.append(Polygon(coords(e)))

json.dump({"west": BBOX["west"], "south": BBOX["south"], "q": Q,
           "fields": ["osm_id", "height_m", "levels", "ground_m", "flood_from_m", "type", "name", "area_m2", "ward",
                      "h_src", "ring"],
           "items": items}, open(DST / "buildings.json", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
fl = np.array([i[4] for i in items])
hs = np.array([i[1] for i in items])
print(f"Nhà: {len(items)} – chiều cao theo OSM {n_tag}, Google 2.5D {n_gob}, ước lượng {len(items) - n_tag - n_gob}; "
      f"cao P50 {np.median(hs):.1f} m, P90 {np.percentile(hs, 90):.1f} m, max {hs.max():.1f} m; "
      f"ngập ở mực 1 m: {(fl < 1).sum()}, 2 m: {(fl < 2).sum()}, 3 m: {(fl < 3).sum()}")
by_ward = Counter(it[8] or "ngoài Hội An (viền khung)" for it in items)
print("  theo phường/xã:", ", ".join(f"{k} {v}" for k, v in by_ward.most_common()))

# 5) Đường ---------------------------------------------------------------------------------
ROAD_CLASS = {"trunk": 1, "primary": 1, "secondary": 2, "tertiary": 2, "residential": 3, "unclassified": 3,
              "living_street": 3, "service": 4, "pedestrian": 3, "footway": 5, "path": 5, "track": 5}
rows, seen = [], set()
for suffix, g in REGIONS:
    for e in els(f"roads{suffix}") or []:
        if e["id"] in seen or len(coords(e)) < 2:
            continue
        seen.add(e["id"])
        rows.append({"name": e["tags"].get("name"), "highway": e["tags"]["highway"],
                     "cls": ROAD_CLASS.get(e["tags"]["highway"].replace("_link", ""), 4),
                     "region": suffix, "geometry": LineString(coords(e))})
if rows:
    rd = gpd.GeoDataFrame(rows, crs="EPSG:4326")
    rd = rd[rd["cls"] <= 4].copy()
    rd["code"] = [f"DUONG-{i + 1}" for i in range(len(rd))]
    rd["geometry"] = rd.simplify(0.00001)
    lens = rd.to_crs(32649).length
    rd["length_km"] = (lens / 1000).round(3)
    # mực nước bắt đầu ngập đoạn đường = fill thấp nhất dọc tuyến (lấy mẫu các đỉnh), trên lưới của vùng chứa đường
    grid_of = dict(REGIONS)
    rd["flood_from_m"] = [round(min(float(grid_of[s]["fill"][cell_of(grid_of[s], x, y)]) for x, y in geom.coords), 2)
                          for s, geom in zip(rd["region"], rd.geometry)]
    rd[["code", "name", "highway", "cls", "length_km", "flood_from_m", "geometry"]].to_file(
        DST / "roads.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)
    print(f"Đường: {len(rd)} đoạn, {rd['length_km'].sum():.0f} km")
else:
    print("Chưa có roads.json – bỏ qua lớp đường (chạy lại sau khi tải được)")

# 6) Cây (minh họa) ----------------------------------------------------------------------------
# Ô "cây" (10) / "rừng ngập mặn" (95) của ESA WorldCover 2021 (~10 m): giữ ngẫu nhiên (cố định) 1/`thin` số ô, mỗi ô
# một cây lệch trong ô, tán to thêm √thin lần để vẫn phủ kín; bỏ cây cách nhà < 2 m, cách tim đường < 3 m.
# Không phải vị trí từng cây thật. Rừng Cù Lao Chàm ~174 nghìn ô → thưa hơn (1/8) để web không nặng.
TREE_THIN = {"": 2, "_culaocham": 8}
blockers = shapely.STRtree(footprints + (list(rd.geometry) if rows else []))
n_fp = len(footprints)
groups = []
for k, (suffix, _) in enumerate(REGIONS):
    p = SRC / f"worldcover_2021{suffix}.tif"
    if not p.exists():
        print(f"Chưa có {p.name} – bỏ qua cây (chạy 06_hoian_download.py)")
        continue
    with rasterio.open(p) as s:
        lc, T = s.read(1), s.transform
    rr, cc = np.nonzero(np.isin(lc, (10, 95)))
    rng = np.random.default_rng(k + 7)
    pick = rng.random(rr.size) < 1 / TREE_THIN[suffix]
    rr, cc = rr[pick], cc[pick]
    lon, lat = T * (cc + rng.uniform(0.15, 0.85, cc.size), rr + rng.uniform(0.15, 0.85, rr.size))
    pts = shapely.points(lon, lat)
    keep = np.ones(lon.size, bool)
    pi, gi = blockers.query(pts, predicate="dwithin", distance=3e-5)
    d = shapely.distance(pts[pi], blockers.geometries[gi])
    keep[pi[np.where(gi < n_fp, d < 2e-5, d < 3e-5)]] = False
    xy = np.round((np.column_stack([lon, lat])[keep] - [BBOX["west"], BBOX["south"]]) * 1e5).astype(int)
    groups.append({"scale": round(float(np.sqrt(TREE_THIN[suffix]) / np.sqrt(2)), 2), "n": len(xy),
                   "terrain": "point" if suffix else "grid",     # đảo có đồi: web lấy cao độ từng cây
                   "xy": xy.ravel().tolist()})
    print(f"Cây{suffix or ' đất liền'}: {pick.size} ô cây/rừng ngập mặn → giữ {pick.sum()}, bỏ {keep.size - keep.sum()} "
          f"sát nhà/đường → {len(xy)} cây")
if groups:
    json.dump({"west": BBOX["west"], "south": BBOX["south"], "q": 1e5,
               "note": "Cây minh họa từ ô phủ cây ESA WorldCover 2021 (CC BY 4.0); mỗi nhóm: scale = hệ số cỡ tán, "
                       "xy = [x, y, ...] nguyên theo 1e-5° từ góc tây nam",
               "groups": groups}, open(DST / "trees.json", "w"), separators=(",", ":"))

for f in sorted(DST.iterdir()):
    print(f"  → hoian/{f.name} ({f.stat().st_size / 1e6:.2f} MB)")
