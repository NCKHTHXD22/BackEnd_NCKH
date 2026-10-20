"""Bước 8 – Tuyến đập 3D: trục đập, phía thượng lưu, mặt hồ của từng hồ thủy điện.

Đầu vào : data/raw/dams/osm_dams.json, osm_dam_rel.json (Overpass – đường/vùng waterway=dam)
          web/public/data/dt/reservoirs.geojson (bước 3), lakes.geojson (bước 5)
Đầu ra  : web/public/data/dt/dams.geojson       – trục đập (2 đầu mút) + thuộc tính
          web/public/data/dt/dam_lakes.geojson  – đa giác mặt hồ dùng để vẽ mặt nước 3D
          web/public/data/dt/dam_lakebeds.json  – lưới tam giác lòng hồ (lon, lat, khoảng cách tới bờ) để
                                                  thay mặt hồ phẳng của địa hình bằng lòng hồ dốc dần
Kích thước thân đập (cao trình đỉnh, ngưỡng tràn, bề rộng tràn…) lấy lúc chạy từ API lake-specs;
mực nước hiện tại từ API inflowLake – không ghi cứng ở đây.
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/08_dams.py
"""
import json
import math

import geopandas as gpd
import numpy as np
import shapely
import rasterio
import rasterio.mask
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import polygonize, unary_union

from config import RAW, WORK, OUT, CRS_METRIC

# lake_id (Id_Lake) → đối tượng OSM của tuyến đập (đã đối chiếu tên/vị trí, xem web/src/utils/reservoirs.js)
DAM_OSM = {
    1: "way/479648364",    # A Vương
    2: "way/439942289",    # Đắk Mi 4
    3: "way/479647796",    # Sông Bung 4
    4: "relation/20743406",  # Sông Tranh 2 (đập chính; relation/16248253 là đập phụ)
    7: "way/875642999",    # Sông Bung 4A
    8: "way/1318145157",   # Sông Bung 5
    11: "way/1270939018",  # Sông Bung 6
    12: "way/440411118",   # Sông Tranh 3
    13: "way/624211586",   # Za Hung
    14: "way/888875287",   # Đắk Mi 3
    16: "way/390411207",   # Sông Côn 2
    17: "way/1472001972",  # Sông Tranh 4
    19: "way/878175634",   # Đắk Mi 4C
}


def load_osm():
    geoms = {}
    for fn in ("osm_dams.json", "osm_dam_rel.json"):
        for e in json.load(open(RAW / "dams" / fn, encoding="utf-8"))["elements"]:
            key = f'{e["type"]}/{e["id"]}'
            if e["type"] == "way" and e.get("geometry"):
                pts = [(p["lon"], p["lat"]) for p in e["geometry"]]
                geoms[key] = (Polygon(pts) if pts[0] == pts[-1] and len(pts) >= 4 else LineString(pts), e.get("tags", {}))
            elif e["type"] == "relation" and e.get("members"):
                lines = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                         for m in e["members"] if m.get("geometry") and m.get("role") == "outer"]
                geoms[key] = (unary_union(list(polygonize(unary_union(lines)))), e.get("tags", {}))
    return geoms


def axis_of(geom):
    """Trục đập (2 đầu mút, hệ mét) và bề rộng chân đập theo OSM (nếu là vùng)."""
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        rect = list(geom.minimum_rotated_rectangle.exterior.coords)[:4]
        sides = [(rect[i], rect[(i + 1) % 4]) for i in range(4)]
        short = sorted(sides, key=lambda s: math.dist(*s))[:2]          # hai cạnh ngắn (hai bờ vai đập)
        mid = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in short]
        return LineString(mid), round(math.dist(*short[0]))
    c = list(geom.coords)
    return LineString([c[0], c[-1]]), None


# Hướng D8 của WhiteboxTools: 64 128 1 / 32 · 2 / 16 8 4 (Tây-Bắc, Bắc, Đông-Bắc …)
D8_STEP = {1: (1, -1), 2: (1, 0), 4: (1, 1), 8: (0, 1), 16: (-1, 1), 32: (-1, 0), 64: (-1, -1), 128: (0, -1)}
facc_src, d8_src = rasterio.open(WORK / "facc.tif"), rasterio.open(WORK / "d8.tif")
d8 = d8_src.read(1)


def downstream_vector(axis):
    """Hướng dòng chảy tại chỗ sông cắt qua tuyến đập: từ ô tích lũy lớn nhất trong vùng đập, đi theo
    con trỏ D8 xuống hạ lưu 20 ô; trả vectơ (x, y) hệ mét."""
    win, tr = rasterio.mask.mask(facc_src, [axis.buffer(60)], crop=True, nodata=-1)
    r, c = np.unravel_index(np.argmax(win[0]), win[0].shape)
    x0, y0 = rasterio.transform.xy(tr, r, c)
    row, col = d8_src.index(x0, y0)
    for _ in range(20):
        step = D8_STEP.get(int(d8[row, col]))
        if not step:
            break
        col, row = col + step[0], row + step[1]
    x1, y1 = d8_src.xy(row, col)
    return x1 - x0, y1 - y0


osm = load_osm()


def cut_lines(skip_lake_id):
    """Các tuyến đập khác (kéo dài ×1,5 về hai phía, dày 20 m) dùng để cắt rời mặt nước giữa các bậc thang."""
    out = []
    for lid, key in DAM_OSM.items():
        if lid == skip_lake_id or key not in osm:
            continue
        g = gpd.GeoSeries([osm[key][0]], crs=4326).to_crs(CRS_METRIC).iloc[0]
        ax, _ = axis_of(g)
        (a0, b0), (a1, b1) = ax.coords
        out.append(LineString([(a0 - (a1 - a0) * 1.5, b0 - (b1 - b0) * 1.5), (a1 + (a1 - a0) * 1.5, b1 + (b1 - b0) * 1.5)]).buffer(10))
    return unary_union(out)
res = gpd.read_file(OUT / "reservoirs.geojson").to_crs(CRS_METRIC).set_index("lake_id")
lakes = gpd.read_file(OUT / "lakes.geojson").to_crs(CRS_METRIC)

dams, dam_lakes = [], []
for lake_id, key in DAM_OSM.items():
    if lake_id not in res.index or key not in osm:
        print(f"  bỏ qua hồ {lake_id}: thiếu dữ liệu ({key})")
        continue
    geom4326, tags = osm[key]
    geom = gpd.GeoSeries([geom4326], crs=4326).to_crs(CRS_METRIC).iloc[0]
    axis, foot_w = axis_of(geom)
    (x0, y0), (x1, y1) = axis.coords
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    nx, ny = -(y1 - y0), (x1 - x0)                                     # pháp tuyến của trục
    n = math.hypot(nx, ny); nx, ny = nx / n, ny / n
    # Phía thượng lưu = ngược hướng nước chảy (D8) tại chỗ sông cắt qua tuyến đập. Không dùng "phía nhiều
    # mặt hồ hơn" vì với đập bậc thang, phía hạ lưu cũng là hồ của đập kế tiếp.
    fx, fy = downstream_vector(axis)
    up = -1 if (fx * nx + fy * ny) > 0 else 1
    ux, uy = up * nx, up * ny
    # Mặt hồ: phần mặt nước ở phía thượng lưu, trong 12 km, bị cắt tại các tuyến đập khác (OSM có thể vẽ cả
    # đoạn sông dài nhiều đập thành một đa giác) – giữ mảnh chạm tuyến đập này, chọn mảnh lớn nhất.
    upbox = Polygon([(x0 - ux * 5, y0 - uy * 5), (x1 - ux * 5, y1 - uy * 5),
                     (x1 + ux * 12000, y1 + uy * 12000), (x0 + ux * 12000, y0 + uy * 12000)]).buffer(6000, cap_style=2)
    upbox = upbox.intersection(Polygon([(x0 - ux * 5 - (x1 - x0) * 40, y0 - uy * 5 - (y1 - y0) * 40),
                                        (x1 - ux * 5 + (x1 - x0) * 40, y1 - uy * 5 + (y1 - y0) * 40),
                                        (x1 + ux * 20000 + (x1 - x0) * 40, y1 + uy * 20000 + (y1 - y0) * 40),
                                        (x0 + ux * 20000 - (x1 - x0) * 40, y0 + uy * 20000 - (y1 - y0) * 40)]))
    best, best_area, best_id = None, 0.0, None
    for _, L in lakes[lakes.distance(axis) < 800].iterrows():
        g = L.geometry.intersection(upbox).difference(cut_lines(lake_id))
        parts = [q for q in getattr(g, "geoms", [g]) if not q.is_empty and q.distance(axis) < 120]
        if parts and sum(q.area for q in parts) > best_area:
            best, best_area, best_id = unary_union(parts), sum(q.area for q in parts), L["osm_id"]
    lake_poly = None if best is None else {"geometry": best, "osm_id": best_id, "area_km2": round(best_area / 1e6, 2)}
    r = res.loc[lake_id]
    a = gpd.GeoSeries([Point(x0, y0), Point(x1, y1)], crs=CRS_METRIC).to_crs(4326)
    dams.append({
        "type": "Feature",
        "properties": {
            "code": f"DAP-{lake_id}", "lake_id": int(lake_id), "reservoir_code": r["code"], "name": r["name"],
            "osm_id": key, "length_m": round(axis.length), "footprint_width_m": foot_w,
            "osm_height_m": float(tags["height"]) if "height" in tags else None,
            # hướng thượng lưu (độ, tính từ Bắc theo chiều kim đồng hồ) – để dựng mặt cắt đập
            "upstream_bearing": round((math.degrees(math.atan2(ux, uy)) + 360) % 360, 1),
            "lake_osm_id": None if lake_poly is None else lake_poly["osm_id"],
            "lake_area_km2": None if lake_poly is None else lake_poly["area_km2"],
        },
        "geometry": {"type": "LineString", "coordinates": [[round(p.x, 6), round(p.y, 6)] for p in a]},
    })
    if lake_poly is not None:
        dam_lakes.append({"lake_id": int(lake_id), "osm_id": lake_poly["osm_id"], "geometry": lake_poly["geometry"].simplify(15)})
    print(f"  {r['name']:<18} trục {axis.length:5.0f} m, chân {foot_w or '-':>4} m, thượng lưu {dams[-1]['properties']['upstream_bearing']:5.1f}°,"
          f" mặt hồ {'—' if lake_poly is None else str(lake_poly['area_km2']) + ' km² (' + lake_poly['osm_id'] + ')'}")

json.dump({"type": "FeatureCollection", "features": dams}, open(OUT / "dams.geojson", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
gpd.GeoDataFrame(dam_lakes, crs=CRS_METRIC).to_crs(4326).to_file(OUT / "dam_lakes.geojson", driver="GeoJSON",
                                                                  COORDINATE_PRECISION=6)
print(f"→ dams.geojson ({len(dams)} đập), dam_lakes.geojson ({len(dam_lakes)} mặt hồ)")


# ---- Lưới lòng hồ --------------------------------------------------------------------------------
# Địa hình nền (Esri) đã có sẵn mặt hồ "phẳng" ở một mực nước cũ → mặt nước 3D ở mực nước thật sẽ bị che.
# Trên web: cắt bỏ địa hình trong mặt hồ, thay bằng lưới này; độ sâu mỗi đỉnh tính lúc chạy theo khoảng cách
# tới bờ (d) – nước rút thì lộ dải bờ hồ như thực tế.
beds = {}
for f in dam_lakes:
    poly = f["geometry"]
    if poly.geom_type == "MultiPolygon":
        poly = max(poly.geoms, key=lambda q: q.area)
    poly = Polygon(poly.exterior).simplify(20)              # bỏ đảo nhỏ: lòng hồ liền một khối
    area = poly.area
    step = max(55.0, math.sqrt(area / 1200))               # cạnh tam giác tối đa
    # Tam giác hóa có ràng buộc theo đúng biên mặt hồ (phủ kín, kể cả nhánh hồ hẹp), rồi chia nhỏ
    # tới khi cạnh ≤ step để có điểm ở giữa lòng hồ tạo độ dốc.
    ring = poly.exterior
    verts, index = [], {}

    def vid(x, y):
        k = (round(x, 2), round(y, 2))
        if k not in index:
            index[k] = len(verts); verts.append(k)
        return index[k]

    tris = []

    def split(a, b, c, depth=0):
        la, lb, lc = math.dist(b, c), math.dist(a, c), math.dist(a, b)
        if max(la, lb, lc) <= step or depth >= 5:
            tris.append((vid(*a), vid(*b), vid(*c))); return
        ab = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); bc = ((b[0] + c[0]) / 2, (b[1] + c[1]) / 2); ca = ((c[0] + a[0]) / 2, (c[1] + a[1]) / 2)
        for t in ((a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)):
            split(*t, depth + 1)

    for t in shapely.constrained_delaunay_triangles(poly).geoms:
        a, b, c = list(t.exterior.coords)[:3]
        split(a, b, c)
    xy = np.array(verts)
    tri = np.array(tris)
    d = [round(Point(x, y).distance(ring), 1) for x, y in xy]
    ll = gpd.GeoSeries([Point(x, y) for x, y in xy], crs=CRS_METRIC).to_crs(4326)
    shore = gpd.GeoSeries([Polygon(ring)], crs=CRS_METRIC).to_crs(4326).iloc[0]
    inset = poly.buffer(-25)   # vùng cắt địa hình thu vào 25 m: clipping polygon của Cesium tính trên lưới SDF thô, mép cắt lấn ra ngoài
    if inset.geom_type == "MultiPolygon":
        inset = max(inset.geoms, key=lambda q: q.area)
    clip = gpd.GeoSeries([inset.simplify(4)], crs=CRS_METRIC).to_crs(4326).iloc[0]
    beds[f["lake_id"]] = {
        "lon": [round(p.x, 6) for p in ll], "lat": [round(p.y, 6) for p in ll], "d": d,
        "tri": tri.astype(int).ravel().tolist(),
        "shore": [round(c, 6) for xy_ in shore.exterior.coords[:-1] for c in xy_],   # mép mặt nước
        "clip": [round(c, 6) for xy_ in clip.exterior.coords[:-1] for c in xy_],
        "max_d": round(max(d), 1),
    }
    print(f"  lòng hồ {f['lake_id']:>2}: {len(xy)} điểm, {len(tri)} tam giác, xa bờ nhất {max(d):.0f} m")
json.dump(beds, open(OUT / "dam_lakebeds.json", "w"), separators=(",", ":"))
print(f"→ dam_lakebeds.json ({(OUT / 'dam_lakebeds.json').stat().st_size / 1e6:.2f} MB)")
