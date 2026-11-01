"""Bước 27 – Xuất một khu của Hội An cho SketchUp / Blender / plugin render: mô hình 3D (.dae, .glb) và bản vẽ
mặt bằng 2D (.png màu theo số tầng cho "Dựng khối từ bản vẽ", .dxf cho AutoCAD/SketchUp).

Đầu vào : web/public/data/dt/hoian/buildings.json, roads.geojson (bước 7) + data/raw/hoian/water.json (bước 6)
Đầu ra  : data/export/<tên>/<tên>.dae – COLLADA: SketchUp → File ▸ Import (mỗi nhà một group)
          data/export/<tên>/<tên>.glb, <tên>_gop.glb – glTF (từng nhà / gộp theo vật liệu)
          data/export/<tên>/<tên>_ban_ve_dung_khoi.png (+ .pgw), <tên>_ban_do_tham_khao.png, <tên>_mat_bang.dxf
          data/export/<tên>/README.txt – gốc tọa độ, tỷ lệ, cách dùng, nguồn dữ liệu, giới hạn
Hệ tọa độ: mét, gốc = tâm khung, trục x hướng đông, y hướng bắc, z lên (UTM 49N trừ gốc). Mặt đất phẳng z = 0
(khu phố cổ cao 2–4 m, gần như phẳng); nhà dựng từ cao độ 0.

Hình khối là MINH HỌA: nền nhà OpenStreetMap, chiều cao đo từ Google Open Buildings 2.5D (2023) cho ~2/3 số nhà,
còn lại ước lượng (07_hoian.py); nhà gần chữ nhật, thấp được thêm mái dốc hai mái (sống mái theo cạnh dài) – không
phải mô hình kiến trúc thật của từng nhà.

Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/27_hoian_export_3d.py
      [--name hoian_phoco] [--bbox tây,nam,đông,bắc]
"""
import argparse
import hashlib
import json
import struct
from xml.sax.saxutils import escape

import numpy as np
import shapely
from pyproj import Geod, Transformer
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.geometry.polygon import orient
from shapely.ops import polygonize, split, unary_union

from config import OUT, RAW, ROOT

# Phố cổ (phường Minh An cũ) + cồn An Hội bên kia sông Hoài, ~1,4 × 0,9 km
DEFAULT_BBOX = (108.3220, 15.8730, 108.3350, 15.8815)
ap = argparse.ArgumentParser()
ap.add_argument("--name", default="hoian_phoco")
ap.add_argument("--bbox", default=",".join(map(str, DEFAULT_BBOX)), help="tây,nam,đông,bắc (độ)")
args = ap.parse_args()
W, S, E, N = map(float, args.bbox.split(","))
DST = ROOT / "data" / "export" / args.name
DST.mkdir(parents=True, exist_ok=True)

LON0, LAT0 = (W + E) / 2, (S + N) / 2
_utm = Transformer.from_crs("EPSG:4326", "EPSG:32649", always_xy=True)
X0, Y0 = _utm.transform(LON0, LAT0)


def to_m(lon, lat):
    x, y = _utm.transform(lon, lat)
    return np.column_stack([np.asarray(x) - X0, np.asarray(y) - Y0])


AREA = box(*to_m([W, E], [S, N]).T.ravel()[[0, 2, 1, 3]])           # khung theo mét (xmin, ymin, xmax, ymax)

# Vật liệu: tên → màu sRGB
MATERIALS = {
    "tuong_vang": "#e9c46a", "tuong_vang_nhat": "#f2d98c", "tuong_kem": "#efe3c2", "tuong_trang": "#f4f1ea",
    "mai_ngoi": "#9c4a2f", "mai_bang": "#d8d2c4", "mat_dat": "#c9c3a6", "duong": "#8f8f8c", "mat_nuoc": "#4f7f8f",
}
WALLS = ["tuong_vang", "tuong_vang_nhat", "tuong_kem", "tuong_vang"]


# ------------------------------------------------------------------------------------------- hình học
def tri_polygon(poly, z_of):
    """Tam giác hóa (Delaunay ràng buộc, đúng cả đa giác lõm/có lỗ) → mảng (n, 3, 3), mặt hướng lên."""
    out = []
    for t in shapely.constrained_delaunay_triangles(poly).geoms:
        p = np.asarray(t.exterior.coords)[:3]
        tri = np.column_stack([p, [z_of(x, y) for x, y in p]])
        if np.cross(tri[1] - tri[0], tri[2] - tri[0])[2] < 0:
            tri = tri[[0, 2, 1]]
        out.append(tri)
    return np.array(out).reshape(-1, 3, 3)


def walls(ring, z_top):
    """Tường đứng từ z = 0 tới z_top(đỉnh) theo vòng ngoài ngược chiều kim đồng hồ → mặt hướng ra ngoài."""
    out = []
    for (x0, y0), (x1, y1) in zip(ring[:-1], ring[1:]):
        a0, b0 = (x0, y0, 0.0), (x1, y1, 0.0)
        a1, b1 = (x0, y0, z_top(x0, y0)), (x1, y1, z_top(x1, y1))
        out += [(a0, b0, b1), (a0, b1, a1)]
    return np.array(out, dtype=float).reshape(-1, 3, 3)


def gable_parts(poly, height):
    """Nhà mái dốc hai mái: sống mái qua tâm hình chữ nhật bao nhỏ nhất, dọc cạnh dài. Trả (tường, mái)."""
    mrr = np.asarray(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    e1, e2 = mrr[1] - mrr[0], mrr[2] - mrr[1]
    u = e1 if np.linalg.norm(e1) >= np.linalg.norm(e2) else e2
    u = u / np.linalg.norm(u)
    n = np.array([-u[1], u[0]])
    c = mrr.mean(axis=0)
    hw = min(np.linalg.norm(e1), np.linalg.norm(e2)) / 2
    rise = min(hw * np.tan(np.radians(28)), 3.5, height - 2.6)               # mái ~28°, tường tối thiểu 2,6 m
    eave = height - rise
    z = lambda x, y: eave + rise * (1 - min(abs((x - c[0]) * n[0] + (y - c[1]) * n[1]) / hw, 1.0))
    halves = [g for g in split(poly, LineString([c - u * 1e3, c + u * 1e3])).geoms if g.area > 0.01]
    roof = np.concatenate([tri_polygon(h, z) for h in halves])
    # chèn giao điểm sống mái × cạnh vào vòng ngoài để tường đầu hồi lên tới đỉnh mái
    ring = np.asarray(orient(poly, 1).exterior.coords)
    s = (ring - c) @ n
    pts = []
    for i in range(len(ring) - 1):
        pts.append(ring[i])
        if s[i] * s[i + 1] < 0:
            pts.append(ring[i] + s[i] / (s[i] - s[i + 1]) * (ring[i + 1] - ring[i]))
    return walls(np.array(pts + [pts[0]]), z), roof


def flat_parts(poly, height):
    ring = np.asarray(orient(poly, 1).exterior.coords)
    return walls(ring, lambda x, y: height), tri_polygon(poly, lambda x, y: height)


def hjit(osm_id):
    return int(hashlib.md5(str(osm_id).encode()).hexdigest()[:8], 16)


# ------------------------------------------------------------------------------------------- dữ liệu
bj = json.loads((OUT / "hoian" / "buildings.json").read_text(encoding="utf-8"))
F = {f: i for i, f in enumerate(bj["fields"])}
houses, n_gable = [], 0
for it in bj["items"]:
    xy = np.cumsum(np.array(it[F["ring"]], dtype=float).reshape(-1, 2), axis=0) / bj["q"]
    lon, lat = bj["west"] + xy[:, 0], bj["south"] + xy[:, 1]
    if len(xy) < 3 or not (W <= lon.mean() <= E and S <= lat.mean() <= N):      # lọc nhanh theo độ trước khi chiếu
        continue
    pts = to_m(lon, lat)
    poly = Polygon(pts).buffer(0)
    if poly.is_empty or poly.geom_type != "Polygon" or not AREA.contains(poly.centroid):
        continue
    poly = poly.simplify(0.05)
    h, area, typ = float(it[F["height_m"]]), poly.area, it[F["type"]]
    rect = area / poly.minimum_rotated_rectangle.area
    pitched = h <= 12 and area <= 600 and rect >= 0.85 and typ not in ("Khách sạn", "Chung cư", "Đang xây dựng")
    try:
        wall_tris, roof_tris = gable_parts(poly, h) if pitched else flat_parts(poly, h)
    except Exception:                                    # hình học suy biến khi cắt sống mái → mái bằng
        pitched = False
        wall_tris, roof_tris = flat_parts(poly, h)
    n_gable += pitched
    wall_mat = "tuong_trang" if typ in ("Khách sạn", "Chung cư") else WALLS[hjit(it[F["osm_id"]]) % len(WALLS)]
    houses.append({"id": it[F["osm_id"]], "name": it[F["name"]], "type": typ, "h": h, "levels": int(it[F["levels"]]),
                   "h_src": it[F["h_src"]],
                   "poly": poly, "parts": [(wall_mat, wall_tris), ("mai_ngoi" if pitched else "mai_bang", roof_tris)]})

# Mặt nước: polygon natural=water + đường sông/kênh (đệm ~15 m mỗi bên) như 07_hoian.py
water_geoms = []
for e in json.loads((RAW / "hoian" / "water.json").read_text(encoding="utf-8"))["elements"]:
    t = e.get("tags", {})
    ll = [(p["lon"], p["lat"]) for p in e.get("geometry", [])]
    if e["type"] == "way" and len(ll) >= 4 and ll[0] == ll[-1] and t.get("natural") == "water":
        water_geoms.append(Polygon(to_m(*zip(*ll))))
    elif e["type"] == "way" and t.get("waterway") in ("river", "canal") and len(ll) > 1:
        water_geoms.append(LineString(to_m(*zip(*ll))).buffer(15))
    elif e["type"] == "relation":
        outer = [LineString(to_m(*zip(*[(p["lon"], p["lat"]) for p in m["geometry"]])))
                 for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        water_geoms += list(polygonize(unary_union(outer)))
water = unary_union([g.buffer(0) for g in water_geoms]).intersection(AREA) if water_geoms else Polygon()

# Đường: đệm theo cấp (bề rộng mặt đường, m), bỏ phần nằm dưới nước (cầu vẫn giữ: cầu OSM có bridge=yes)
ROAD_W = {1: 10, 2: 7, 3: 5, 4: 3.5}
road_geoms, road_axes = [], []
for f in json.loads((OUT / "hoian" / "roads.geojson").read_text(encoding="utf-8"))["features"]:
    g = shape(f["geometry"])
    lines = g.geoms if g.geom_type == "MultiLineString" else [g]
    for ln in lines:
        m = LineString(to_m(*zip(*ln.coords)))
        if m.intersects(AREA):
            road_geoms.append(m.buffer(ROAD_W.get(f["properties"]["cls"], 3.5) / 2, cap_style="flat"))
            road_axes.append(m.intersection(AREA))                                  # tim đường cho bản vẽ DXF
roads = unary_union(road_geoms).intersection(AREA) if road_geoms else Polygon()
ground = AREA.difference(water)

site = [("Mat_dat", "mat_dat", tri_polygon(ground, lambda x, y: 0.0)),
        ("Duong", "duong", tri_polygon(roads.simplify(0.2), lambda x, y: 0.03)),
        ("Mat_nuoc", "mat_nuoc", tri_polygon(water, lambda x, y: -0.4))]


def all_nodes():
    """(tên node, tên hiển thị, [(vật liệu, tam giác)]) – mặt bằng trước, rồi từng nhà."""
    for key, mat, tris in site:
        if len(tris):
            yield key, key.replace("_", " "), [(mat, tris)]
    for hs in houses:
        label = f"{hs['name']} ({hs['type']}, {hs['h']:.1f} m)" if hs["name"] else f"{hs['type']} {hs['h']:.1f} m"
        yield f"NHA_{hs['id']}", label, [(m, t) for m, t in hs["parts"] if len(t)]


def merged_nodes():
    """Gộp mọi tam giác cùng vật liệu thành một khối – vài chục draw call thay vì ~2 nghìn/km² (xem nhanh, render)."""
    by_mat = {}
    for _, _, parts in all_nodes():
        for m, t in parts:
            by_mat.setdefault(m, []).append(t)
    for m, ts in by_mat.items():
        yield f"GOP_{m}", m, [(m, np.concatenate(ts))]


def rgb(hexs):
    return [int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)]


# ------------------------------------------------------------------------------------------- COLLADA
def write_dae(path):
    lines = ['<?xml version="1.0" encoding="utf-8"?>',
             '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
             f'<asset><contributor><authoring_tool>NCKH digital_twin 27_hoian_export_3d.py</authoring_tool></contributor>'
             f'<unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>',
             '<library_effects>']
    for m, col in MATERIALS.items():
        r, g, b = rgb(col)
        lines.append(f'<effect id="{m}-fx"><profile_COMMON><technique sid="c"><lambert><diffuse>'
                     f'<color>{r:.4f} {g:.4f} {b:.4f} 1</color></diffuse></lambert></technique></profile_COMMON></effect>')
    lines.append('</library_effects><library_materials>')
    lines += [f'<material id="{m}" name="{m}"><instance_effect url="#{m}-fx"/></material>' for m in MATERIALS]
    lines.append('</library_materials><library_geometries>')
    scene = []
    for key, label, parts in all_nodes():
        tris = np.concatenate([t for _, t in parts])
        verts, inv = np.unique(np.round(tris.reshape(-1, 3), 3), axis=0, return_inverse=True)
        inv = inv.reshape(-1, 3)
        lines.append(f'<geometry id="{key}-g"><mesh><source id="{key}-p"><float_array id="{key}-pa" count="{verts.size}">'
                     + " ".join(f"{v:.3f}" for v in verts.ravel()) +
                     f'</float_array><technique_common><accessor source="#{key}-pa" count="{len(verts)}" stride="3">'
                     '<param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>'
                     f'</accessor></technique_common></source><vertices id="{key}-v"><input semantic="POSITION" source="#{key}-p"/></vertices>')
        k = 0
        for mat, t in parts:
            idx = inv[k:k + len(t)]
            k += len(t)
            lines.append(f'<triangles material="{mat}" count="{len(t)}"><input semantic="VERTEX" source="#{key}-v" offset="0"/>'
                         f'<p>{" ".join(map(str, idx.ravel()))}</p></triangles>')
        lines.append('</mesh></geometry>')
        binds = "".join(f'<instance_material symbol="{m}" target="#{m}"/>' for m in dict.fromkeys(m for m, _ in parts))
        scene.append(f'<node id="{key}" name="{escape(label, {chr(34): "&quot;"})}"><instance_geometry url="#{key}-g">'
                     f'<bind_material><technique_common>{binds}</technique_common></bind_material></instance_geometry></node>')
    lines += ['</library_geometries><library_visual_scenes><visual_scene id="khu" name="Khu">', *scene,
              '</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#khu"/></scene></COLLADA>']
    path.write_text("\n".join(lines), encoding="utf-8")


# ------------------------------------------------------------------------------------------- glTF (.glb)
def write_glb(path, nodes):
    """glTF 2.0: trục Y lên → (x đông, z lên, −y bắc). Tam giác không chỉ số, pháp tuyến phẳng theo mặt."""
    mats = list(MATERIALS)
    gl = {"asset": {"version": "2.0", "generator": "NCKH digital_twin 27_hoian_export_3d.py"},
          "scene": 0, "scenes": [{"name": "Khu", "nodes": []}], "nodes": [], "meshes": [],
          "materials": [{"name": m, "pbrMetallicRoughness": {
              "baseColorFactor": [c ** 2.2 for c in rgb(MATERIALS[m])] + [1.0],   # glTF dùng màu tuyến tính
              "metallicFactor": 0.0, "roughnessFactor": 0.9}} for m in mats],
          "accessors": [], "bufferViews": [], "buffers": []}
    blob = bytearray()

    def view(data, target):
        while len(blob) % 4:
            blob.append(0)
        gl["bufferViews"].append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob.extend(data)
        return len(gl["bufferViews"]) - 1

    for key, label, parts in nodes:
        prims = []
        for mat, t in parts:
            p = t[:, :, [0, 2, 1]] * np.array([1, 1, -1])                    # (x, y, z) → (x, z, −y)
            nrm = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
            pos = p.reshape(-1, 3).astype(np.float32)
            nor = np.repeat(nrm, 3, axis=0).astype(np.float32)
            gl["accessors"].append({"bufferView": view(pos.tobytes(), 34962), "componentType": 5126, "count": len(pos),
                                    "type": "VEC3", "min": pos.min(0).tolist(), "max": pos.max(0).tolist()})
            gl["accessors"].append({"bufferView": view(nor.tobytes(), 34962), "componentType": 5126, "count": len(nor),
                                    "type": "VEC3"})
            prims.append({"attributes": {"POSITION": len(gl["accessors"]) - 2, "NORMAL": len(gl["accessors"]) - 1},
                          "material": mats.index(mat)})
        gl["meshes"].append({"name": key, "primitives": prims})
        gl["nodes"].append({"name": label, "mesh": len(gl["meshes"]) - 1, "extras": {"id": key}})
        gl["scenes"][0]["nodes"].append(len(gl["nodes"]) - 1)
    while len(blob) % 4:
        blob.append(0)
    gl["buffers"].append({"byteLength": len(blob)})
    js = json.dumps(gl, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))


# ------------------------------------------------------------------------------------------- bản vẽ 2D
# Màu theo số tầng như bản vẽ quy hoạch: plugin "Dựng khối từ bản vẽ" nhận diện vùng theo màu → mỗi màu một số tầng.
FLOOR_CLASSES = [   # (số tầng tối đa, nhãn, lớp DXF, màu, mã màu AutoCAD dự phòng)
    (1, "1 tầng", "NHA_1T", "#ffd54f", 2),
    (2, "2 tầng", "NHA_2T", "#ff8a65", 30),
    (3, "3 tầng", "NHA_3T", "#e53935", 1),
    (5, "4–5 tầng", "NHA_4-5T", "#8e24aa", 6),
    (99, "≥ 6 tầng", "NHA_6T+", "#1e88e5", 5),
]
RELIGIOUS = ("Chùa", "Đền/miếu", "Nhà thờ")
RELIGIOUS_CLASS = (0, "Chùa, đền, nhà thờ", "NHA_TON_GIAO", "#6d4c41", 32)
RES = 0.4             # m/điểm ảnh: nhà ống rộng ~4 m = 10 điểm ảnh, khe giữa hai nhà 0,8 m = 2 điểm ảnh


def plan_class(hs):
    if hs["type"] in RELIGIOUS:
        return RELIGIOUS_CLASS
    return next(c for c in FLOOR_CLASSES if hs["levels"] <= c[0])


def path_of(geom):
    """Đa giác shapely (có lỗ, đa phần) → matplotlib Path, vòng ngoài/lỗ ngược chiều để lỗ không bị tô."""
    from matplotlib.path import Path as MPath
    polys = geom.geoms if hasattr(geom, "geoms") else [geom]
    rings = [r for p in polys if p.geom_type == "Polygon" and not p.is_empty
             for r in [orient(p, 1).exterior, *orient(p, 1).interiors]]
    return MPath.make_compound_path(*[MPath(np.asarray(r.coords), closed=True) for r in rings]) if rings else None


def georef_marks():
    """Hai mốc định vị M1 (gần góc tây bắc) và M2 (gần góc đông nam) đặt vào chỗ trống trên bản vẽ, để plugin
    "Định vị đúng vị trí thực" (2 điểm + tọa độ WGS84) tự tính tỷ lệ, hướng bắc và vị trí.
    Trả [(tên, x, y, vĩ độ, kinh độ)] với x, y theo mét quanh gốc."""
    xmin, ymin, xmax, ymax = AREA.bounds
    built = unary_union([hs["poly"] for hs in houses]).buffer(22)     # chừa 22 m quanh nhà cho chữ thập + nhãn
    shapely.prepare(built)
    inv = Transformer.from_crs("EPSG:32649", "EPSG:4326", always_xy=True)
    marks = []
    for name, fx, fy in (("M1", 0.06, 0.92), ("M2", 0.94, 0.08)):
        tx, ty = xmin + fx * (xmax - xmin), ymin + fy * (ymax - ymin)
        cand = sorted(((tx + dx, ty + dy) for dx in range(-80, 81, 4) for dy in range(-80, 81, 4)),
                      key=lambda p: (p[0] - tx) ** 2 + (p[1] - ty) ** 2)
        x, y = next((p for p in cand if not built.contains(Point(p))), (tx, ty))
        lon, lat = inv.transform(X0 + x, Y0 + y)
        marks.append((name, x, y, lat, lon))
    return marks


def write_plan_png(path, reference):
    """reference=False: bản vẽ sạch để plugin nhận diện (chỉ nhà, nền trắng, không khử răng cưa → màu thuần)
                        + 2 mốc định vị màu đen.
    reference=True : bản đồ tham khảo có sông, đường, chú giải, thước tỷ lệ, hướng bắc."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    from matplotlib.patches import PathPatch, Patch
    xmin, _, _, ymax = AREA.bounds
    wpx, hpx = round((AREA.bounds[2] - xmin) / RES), round((ymax - AREA.bounds[1]) / RES)
    xmax, ymin = xmin + wpx * RES, ymax - hpx * RES          # khung khớp đúng số điểm ảnh → tỷ lệ chính xác RES
    dpi, strip = 100, (300 if reference else 0)
    fig = plt.figure(figsize=(wpx / dpi, (hpx + strip) / dpi), dpi=dpi)
    fig.patch.set_facecolor("#f6f3ea" if reference else "white")
    ax = fig.add_axes([0, strip / (hpx + strip), 1, hpx / (hpx + strip)])
    ax.set_xlim(xmin, xmax); ax.set_ylim(ymin, ymax); ax.axis("off")
    ax.set_facecolor(fig.get_facecolor())
    if reference:
        for geom, fc, ec in ((water, "#a9d3e6", "#7fb3cc"), (roads, "#ffffff", "#c9c1ae")):
            if (p := path_of(geom)) is not None:
                ax.add_patch(PathPatch(p, facecolor=fc, edgecolor=ec, linewidth=0.6))
    ax.add_collection(PolyCollection(
        [np.asarray(hs["poly"].exterior.coords) for hs in houses], facecolors=[plan_class(hs)[3] for hs in houses],
        edgecolors="#5d5048" if reference else "white", antialiaseds=reference,
        linewidths=(0.15 if reference else 0.8) / RES * 72 / dpi))       # bề rộng nét (m) → point
    if reference:
        fs = 26
        # thước tỷ lệ 100 m và mũi tên hướng bắc trên bản đồ
        x0, y0 = xmin + 40, ymin + 40
        ax.add_patch(plt.Rectangle((x0 - 15, y0 - 15), 140, 55, facecolor="white", alpha=0.85, edgecolor="none"))
        ax.plot([x0, x0 + 100], [y0, y0], color="black", linewidth=6, solid_capstyle="butt")
        ax.text(x0 + 50, y0 + 12, "100 m", ha="center", va="bottom", fontsize=fs)
        ax.annotate("B", xy=(xmax - 60, ymax - 40), xytext=(xmax - 60, ymax - 140), ha="center", fontsize=fs + 8,
                    fontweight="bold", arrowprops=dict(arrowstyle="-|>", linewidth=4, mutation_scale=50, color="black"))
        num = lambda n: f"{n:,}".replace(",", ".")
        handles = [Patch(facecolor=c[3], edgecolor="#5d5048", label=f"{c[1]} ({num(sum(plan_class(h) is c for h in houses))})")
                   for c in FLOOR_CLASSES + [RELIGIOUS_CLASS]]
        fig.legend(handles=handles, loc="lower center", ncol=len(handles), fontsize=fs, frameon=False,
                   bbox_to_anchor=(0.5, 20 / (hpx + strip)), handlelength=2.2, handleheight=1.4)
        fig.text(0.5, (strip - 40) / (hpx + strip), f"Mặt bằng khu {args.name} – Hội An · {num(len(houses))} nhà, màu theo số "
                 f"tầng (Google 2.5D / ước lượng) · tỷ lệ {str(RES).replace('.', ',')} m/điểm ảnh · © OpenStreetMap",
                 ha="center", va="top", fontsize=fs + 4, fontweight="bold")
    # mốc định vị: chữ thập + vòng tròn đen (màu không trùng lớp nhà nào). Bản vẽ sạch chỉ ghi tên mốc nhỏ trong
    # chỗ trống (không che nhà); bản đồ tham khảo ghi cả tọa độ.
    import matplotlib.patheffects as pe
    lw = 0.8 / RES * 72 / dpi
    for name, x, y, lat, lon in MARKS:
        ax.add_patch(plt.Circle((x, y), 6, fill=False, edgecolor="black", linewidth=lw, antialiased=reference))
        for dx, dy in ((12, 0), (0, 12)):
            ax.plot([x - dx, x + dx], [y - dy, y + dy], color="black", linewidth=lw, antialiased=reference)
        left = x < (xmin + xmax) / 2          # nhãn quay vào phía trong khung
        if reference:
            ax.text(x + (14 if left else -14), y + (-14 if left else 14), f"{name}: {lat:.6f}, {lon:.6f}",
                    ha="left" if left else "right", va="top" if left else "bottom", fontsize=22, fontweight="bold",
                    path_effects=[pe.withStroke(linewidth=6, foreground="white")])
        else:
            ax.text(x + (6 if left else -6), y + 6, name, ha="left" if left else "right", va="bottom",
                    fontsize=14, fontweight="bold")
    fig.savefig(path, dpi=dpi, facecolor=fig.get_facecolor())
    plt.close(fig)
    if not reference:   # world file: mở thẳng trong QGIS/ArcGIS đúng vị trí (UTM 49N, EPSG:32649)
        path.with_suffix(".pgw").write_text(
            f"{RES}\n0\n0\n{-RES}\n{X0 + xmin + RES / 2:.3f}\n{Y0 + ymax - RES / 2:.3f}\n", encoding="ascii")
    return wpx, hpx


def write_dxf(path):
    """Mặt bằng AutoCAD (mét, cùng gốc với .dae): mỗi nhà một polyline kín, lớp theo số tầng → SketchUp Push/Pull."""
    import ezdxf
    from ezdxf import units
    doc = ezdxf.new("R2010", setup=True)
    doc.units = units.M
    msp = doc.modelspace()

    def layer(name, col, aci):
        if name not in doc.layers:
            doc.layers.add(name, color=aci).rgb = tuple(int(col[i:i + 2], 16) for i in (1, 3, 5))
        return {"layer": name}

    for hs in houses:
        _, _, lname, col, aci = plan_class(hs)
        msp.add_lwpolyline(np.round(np.asarray(hs["poly"].exterior.coords)[:-1], 3).tolist(), close=True,
                           dxfattribs=layer(lname, col, aci))
    for name, geom, col, aci in (("DUONG_MEP", roads, "#9e9e9e", 8), ("SONG_NUOC", water, "#4f9fc8", 4)):
        for p in (geom.geoms if hasattr(geom, "geoms") else [geom]):
            if p.geom_type == "Polygon" and not p.is_empty:
                for r in [p.exterior, *p.interiors]:
                    msp.add_lwpolyline(np.round(np.asarray(r.coords)[:-1], 3).tolist(), close=True,
                                       dxfattribs=layer(name, col, aci))
    for g in road_axes:
        for ln in (g.geoms if hasattr(g, "geoms") else [g]):
            if ln.geom_type == "LineString" and len(ln.coords) > 1:
                msp.add_lwpolyline(np.round(np.asarray(ln.coords), 3).tolist(), dxfattribs=layer("DUONG_TIM", "#bdbdbd", 9))
    msp.add_lwpolyline(np.round(np.asarray(AREA.exterior.coords)[:-1], 3).tolist(), close=True,
                       dxfattribs=layer("KHUNG", "#000000", 7))
    doc.saveas(path)


write_dae(DST / f"{args.name}.dae")
write_glb(DST / f"{args.name}.glb", all_nodes())
write_glb(DST / f"{args.name}_gop.glb", merged_nodes())
MARKS = georef_marks()
(_, x1, y1, la1, lo1), (_, x2, y2, la2, lo2) = MARKS
az, _, d_true = Geod(ellps="WGS84").inv(lo1, la1, lo2, la2)
# plugin đặt bản vẽ theo mặt phẳng tiếp xúc (bắc thật), bản vẽ theo lưới UTM ⇒ lệch tỷ lệ UTM và góc hội tụ kinh tuyến
DV_SCALE = d_true / np.hypot(x2 - x1, y2 - y1)
DV_ROT = np.degrees(np.arctan2(np.cos(np.radians(az)), np.sin(np.radians(az))) - np.arctan2(y2 - y1, x2 - x1))
WPX, HPX = write_plan_png(DST / f"{args.name}_ban_ve_dung_khoi.png", reference=False)
write_plan_png(DST / f"{args.name}_ban_do_tham_khao.png", reference=True)
write_dxf(DST / f"{args.name}_mat_bang.dxf")
n_tri = sum(len(t) for _, _, ps in all_nodes() for _, t in ps)
N_SRC = {k: sum(hs["h_src"] == k for hs in houses) for k in ("google", "osm", "est")}
(DST / "README.txt").write_text(f"""Mô hình 3D khu {args.name} – Hội An
Khung: tây {W}, nam {S}, đông {E}, bắc {N} (WGS84) ≈ {AREA.bounds[2] - AREA.bounds[0]:.0f} × {AREA.bounds[3] - AREA.bounds[1]:.0f} m
Gốc tọa độ (0, 0, 0) = vĩ độ {LAT0:.6f}, kinh độ {LON0:.6f}; đơn vị mét; x đông, y bắc, z lên (UTM 49N trừ gốc).
Nội dung: {len(houses)} nhà ({n_gable} mái dốc, còn lại mái bằng), mặt đường, mặt nước, mặt đất; {n_tri} tam giác.

Tệp:
  {args.name}.dae – SketchUp: File ▸ Import ▸ chọn kiểu COLLADA (*.dae) ▸ Options: bỏ chọn "Merge coplanar faces"
                    nếu muốn giữ nguyên tam giác. Mỗi nhà là một group tên NHA_<mã OSM>.
                    Muốn định vị đúng chỗ trên bản đồ: Extensions/File ▸ Geo-location ▸ Set Manual Location
                    nhập vĩ độ/kinh độ gốc ở trên.
  {args.name}.glb – glTF, mỗi nhà một khối: Blender (File ▸ Import ▸ glTF), trình xem web.
  {args.name}_gop.glb – glTF gộp theo vật liệu (9 khối, nhẹ nhất khi xoay/render): dùng cho cửa sổ "Render 3D"
                    của plugin AICuongCoVua hoặc xem nhanh (vd. https://gltf-viewer.donmccurdy.com).

Bản vẽ 2D (cùng khung, cùng gốc tọa độ):
  {args.name}_ban_ve_dung_khoi.png – {WPX} × {HPX} điểm ảnh, TỶ LỆ {RES} m/điểm ảnh (chiều ngang = {WPX * RES:.0f} m).
                    Nền trắng, chỉ có nhà, màu thuần theo số tầng, khe trắng 0,8 m giữa các nhà → đưa vào bước
                    "1 Bản vẽ" của "Dựng khối từ bản vẽ" trong plugin, khi plugin hỏi tỷ lệ/kích thước thì nhập
                    chiều ngang {WPX * RES:.0f} m. Màu ↔ số tầng:
{chr(10).join(f"                      {c[3]}  {c[1]}" for c in FLOOR_CLASSES + [RELIGIOUS_CLASS])}
                    Hai chữ thập đen M1, M2 là mốc định vị (đừng "Lấy màu" màu đen khi nhận diện nhà):
{chr(10).join(f"                      {m[0]}: {m[3]:.6f}, {m[4]:.6f}" for m in MARKS)}
  {args.name}_ban_ve_dung_khoi.pgw – world file (UTM 49N, EPSG:32649) để mở ảnh đúng vị trí trong QGIS/ArcGIS.
  {args.name}_ban_do_tham_khao.png – bản đồ có sông, đường, chú giải, thước tỷ lệ, hướng bắc (để xem, in, báo cáo).
  {args.name}_mat_bang.dxf – AutoCAD 2010, đơn vị mét, cùng gốc với .dae. SketchUp: File ▸ Import ▸ AutoCAD
                    Files (*.dwg, *.dxf) ▸ Options: Units = Meters. Mỗi nhà một polyline kín; lớp (Tag) theo số tầng:
                    NHA_1T, NHA_2T, NHA_3T, NHA_4-5T, NHA_6T+, NHA_TON_GIAO; ngoài ra DUONG_MEP (mép đường),
                    DUONG_TIM (tim đường), SONG_NUOC, KHUNG. Dựng tay: tạo mặt (Make Faces) rồi Push/Pull
                    ~3,3 m × số tầng.

Đặt bản vẽ đúng chỗ + dựng địa hình (DEM) trong plugin AICuongCoVua › Render 3D:
  1. 📐 Mặt bằng ▸ 📂 nạp {args.name}_ban_ve_dung_khoi.png.
  2. ⛰ Địa hình ▸ 🌍 Bản đồ ▸ dán tâm "{LAT0:.6f}, {LON0:.6f}" ▸ 📍 Đi tới; khung vàng ≈ {1.05 * max(WPX, HPX) * RES / 100:.0f}00 m,
     xoay 0; tick ⛰ Địa hình (bỏ Nhà nếu sẽ dựng nhà từ bản vẽ) ▸ ▶ Tạo 3D. Plugin tự tải DEM (ô Terrarium/SRTM
     ~30 m) – không nạp được tệp DEM ngoài; "Nạp file khảo sát" chỉ lấy tọa độ.
  3. 🏗 Dựng khối từ bản vẽ ▸ ① Bản vẽ ▸ 📍 Định vị đúng vị trí thực ▸ hệ WGS84: điểm 1 = bấm tâm chữ thập M1 +
     dán tọa độ M1, điểm 2 = M2 ▸ 📍 Đặt bản vẽ vào vị trí thực. Kết quả đúng: rộng ≈ {WPX * RES * DV_SCALE:.0f} m,
     xoay ≈ {abs(DV_ROT):.1f}° (góc hội tụ kinh tuyến UTM, dấu +/− tùy plugin), 2 mốc khớp vài chục cm.
     Định vị TRƯỚC khi dựng khối (khối đã dựng không tự dời theo bản vẽ).
  4. ⌂ Vùng chọn và thao tác ▸ ⬇ Đặt mặt bằng theo địa hình, rồi ② Nhận diện (Lấy màu từng lớp nhà) ▸ ▶ Dựng khối.

Nguồn & giới hạn:
  - Hình nhà, đường, sông: OpenStreetMap (© OpenStreetMap contributors, ODbL) – tải bằng 06_hoian_download.py.
  - Chiều cao (07_hoian.py) trong khung này: {N_SRC.get('google', 0)} nhà đo từ Google Open Buildings 2.5D Temporal 2023
    (CC BY 4.0; trung vị trong nền nhà, sai số cỡ ±1–2 m), {N_SRC.get('osm', 0)} nhà theo thẻ OSM, {N_SRC.get('est', 0)} nhà ước lượng
    theo loại nhà và diện tích. Số tầng ≈ (chiều cao − 1) / 3,3 m (suy ra, trừ nhà OSM có ghi số tầng).
  - Mái dốc là mái hai mái đơn giản cho nhà ≤ 12 m, ≤ 600 m², gần chữ nhật – KHÔNG phải kiến trúc thật từng nhà.
  - Mặt đất phẳng (z = 0); cầu không có trụ/độ cao riêng.
""", encoding="utf-8")
for f in sorted(DST.iterdir()):
    print(f"  → {f.relative_to(ROOT)} ({f.stat().st_size / 1e6:.2f} MB)")
print(f"{len(houses)} nhà ({n_gable} mái dốc), {n_tri} tam giác; nguồn chiều cao {N_SRC}")
for m in MARKS:
    print(f"{m[0]}: {m[3]:.6f}, {m[4]:.6f}  (x {m[1]:.0f} m, y {m[2]:.0f} m)")
print(f"định vị trong plugin: rộng ≈ {WPX * RES * DV_SCALE:.1f} m, xoay ≈ {DV_ROT:.2f}°")
