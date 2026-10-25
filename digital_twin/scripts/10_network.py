"""Bước 10 – Mạng kết nối lưu vực – sông – hồ (lộ trình mục 1.4).

Mục đích: biết nước của hồ/trạm nào chảy tới đâu, để diễn toán lũ (5.1), vận hành liên hồ (4.3) không cộng trùng
nước giữa các hồ bậc thang.

Hai phần:
  1) Thượng nguồn – theo hướng dòng chảy D8 (bước 4): dò từ mỗi đập/trạm xuôi dòng tới "đầu đồng bằng"
     (cuối sông Vu Gia nơi tách Quảng Huế/Ái Nghĩa, và Thu Bồn tại Giao Thủy). Nút = đập, trạm, hợp lưu giữa các
     tuyến dò. Diện tích lưu vực từ facc.tif.
  2) Đồng bằng – D8 chỉ cho mỗi ô một hướng nên không tả được phân lưu. Dùng các sông có tên trên OSM
     (Thu Bồn, Quảng Huế, Ái Nghĩa, Yên, La Thọ, Thanh Quýt, Vĩnh Điện, Cẩm Lệ, Đô Toả, Hàn, Túy Loan, Quá Giáng),
     nối tại điểm đầu/cuối chạm sông khác; hướng chảy theo chiều vẽ OSM. Tỷ lệ chia nước tại phân lưu CHƯA BIẾT
     (để null – xác định khi có mô hình 1D/số liệu đo).
  3) Khai báo tay: Đắk Mi 4 chuyển nước qua nhà máy sang lưu vực Thu Bồn (phần tua-bin), phần xả tràn xuống Đắk Mi.

Tọa độ trạm thủy văn là GẦN ĐÚNG (cần xác nhận với Đài KTTV); diện tích "công bố" dùng để đối chiếu cũng cần xác nhận.

Đầu ra: digital_twin/data/compute/network.json      – nút, cạnh (dùng cho các bước tính)
        digital_twin/data/compute/network.geojson   – để xem trên QGIS / bản đồ
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/10_network.py
"""
import json
from collections import defaultdict

import geopandas as gpd
import numpy as np
import rasterio
from shapely.geometry import LineString, Point, mapping
from shapely.ops import linemerge, substring

from config import CRS_METRIC, RAW, WORK, ROOT

COMPUTE = ROOT / "data" / "compute"
COMPUTE.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------ trạm (tọa độ gần đúng, cần xác nhận)
# area_ref: diện tích lưu vực thường được dẫn trong tài liệu – chỉ để đối chiếu, cần xác nhận với Đài KTTV
UPLAND_STATIONS = [
    dict(id="ST-THANHMY", name="Trạm Thành Mỹ", river="Vu Gia (Cái)", lon=107.837, lat=15.761, area_ref=1850),
    dict(id="ST-NONGSON", name="Trạm Nông Sơn", river="Thu Bồn", lon=108.027, lat=15.700, area_ref=3130),
]
# Đầu đồng bằng: nơi dừng dò D8 và bắt đầu mạng OSM
HEADS = [
    dict(id="ST-GIAOTHUY", name="Trạm Giao Thủy (đầu đồng bằng Thu Bồn)", river="Thu Bồn", lon=108.108, lat=15.846,
         area_ref=3825, osm="Sông Thu Bồn"),
    dict(id="J-VUGIA-END", name="Cuối sông Vu Gia (tách Quảng Huế / Ái Nghĩa)", river="Vu Gia", lon=None, lat=None,
         area_ref=None, osm="Sông Vu Gia"),
]
DELTA_STATIONS = [
    dict(id="ST-AINGHIA", name="Trạm Ái Nghĩa", river="Ái Nghĩa (Vu Gia)", lon=108.117, lat=15.883),
    dict(id="ST-CAULAU", name="Trạm Câu Lâu", river="Thu Bồn", lon=108.270, lat=15.852),
    dict(id="ST-HOIAN", name="Trạm Hội An", river="Thu Bồn", lon=108.333, lat=15.878),
    dict(id="ST-CAMLE", name="Trạm Cẩm Lệ", river="Cẩm Lệ", lon=108.195, lat=16.004),
]
DELTA_RIVERS = ["Sông Thu Bồn", "Sông Vu Gia", "Sông Quảng Huế", "Sông Ái Nghĩa", "Sông Yên", "Sông La Thọ",
                "Sông Thanh Quýt", "Sông Vĩnh Điện", "Sông Cẩm Lệ", "Sông Đô Toả", "Sông Hàn", "Sông Túy Loan",
                "Sông Quá Giáng"]
JOIN_M = 400        # đầu/cuối sông cách sông khác ≤ 400 m thì coi là nối
MERGE_M = 250       # gộp các điểm nút đồng bằng gần nhau

# Whitebox D8: 1=NE 2=E 4=SE 8=S 16=SW 32=W 64=NW 128=N  → (drow, dcol)
D8 = {1: (-1, 1), 2: (0, 1), 4: (1, 1), 8: (1, 0), 16: (1, -1), 32: (0, -1), 64: (-1, -1), 128: (-1, 0)}


def to_utm(lon, lat):
    return gpd.GeoSeries([Point(lon, lat)], crs=4326).to_crs(CRS_METRIC).iloc[0]


# ------------------------------------------------------------------ raster
d8_src = rasterio.open(WORK / "d8.tif")
d8 = d8_src.read(1)
facc = rasterio.open(WORK / "facc.tif").read(1)
dem = rasterio.open(WORK / "dem_utm.tif").read(1)   # DEM gốc: dem_breach bị khoét trũng sâu ở đồng bằng, chỉ hợp cho D8
T = d8_src.transform
CELL_KM2 = abs(T.a * T.e) / 1e6
H, W = d8.shape


def rc_of(x, y):
    c, r = ~T * (x, y)
    return int(r), int(c)


def xy_of(r, c):
    return T * (c + 0.5, r + 0.5)


def area(rc):
    return float(facc[rc]) * CELL_KM2


def snap(pt, radius_m, area_ref=None):
    """Ô sông gần điểm: nếu có diện tích tham chiếu → ô gần nhất có diện tích trong ±35%; không thì ô tích lũy lớn nhất."""
    r0, c0 = rc_of(pt.x, pt.y)
    k = int(radius_m / abs(T.a))
    rs, cs = slice(max(0, r0 - k), min(H, r0 + k + 1)), slice(max(0, c0 - k), min(W, c0 + k + 1))
    win = facc[rs, cs].astype(float) * CELL_KM2
    rr, cc = np.mgrid[rs, cs]
    dist = np.hypot(rr - r0, cc - c0) * abs(T.a)
    ok = dist <= radius_m
    if area_ref:
        band = ok & (np.abs(win - area_ref) <= 0.35 * area_ref)
        if band.any():
            i = np.argmin(np.where(band, dist, np.inf))
            return (int(rr.flat[i]), int(cc.flat[i])), float(dist.flat[i]), "gần nhất trong ±35% diện tích tham chiếu"
    i = np.argmax(np.where(ok, win, -1))
    return (int(rr.flat[i]), int(cc.flat[i])), float(dist.flat[i]), "ô tích lũy lớn nhất"


def trace(rc, stop):
    path = [rc]
    seen = {rc}
    while True:
        r, c = path[-1]
        v = int(d8[r, c])
        if v not in D8:
            return path, "hết hướng chảy (biển/mép)"
        dr, dc = D8[v]
        nxt = (r + dr, c + dc)
        if not (0 <= nxt[0] < H and 0 <= nxt[1] < W) or nxt in seen:
            return path, "ra ngoài vùng"
        path.append(nxt)
        seen.add(nxt)
        if nxt in stop:
            return path, stop[nxt]


# ------------------------------------------------------------------ đồng bằng: sông OSM
osm = json.loads((RAW / "osm" / "rivers.json").read_text(encoding="utf-8"))
lines = defaultdict(list)
for e in osm["elements"]:
    name = e.get("tags", {}).get("name")
    if name in DELTA_RIVERS and e.get("geometry"):
        lines[name].append(LineString([(p["lon"], p["lat"]) for p in e["geometry"]]))
rivers = {}
for name, parts in lines.items():
    g = gpd.GeoSeries(parts, crs=4326).to_crs(CRS_METRIC)
    m = linemerge(list(g))
    if m.geom_type == "MultiLineString":       # giữ đoạn dài nhất (các mảnh lẻ thường là nhánh phụ)
        m = max(m.geoms, key=lambda x: x.length)
    rivers[name] = m
missing = [n for n in DELTA_RIVERS if n not in rivers]

# Vị trí đầu đồng bằng
vg_end = Point(rivers["Sông Vu Gia"].coords[-1])
heads = []
for h in HEADS:
    pt = vg_end if h["osm"] == "Sông Vu Gia" else to_utm(h["lon"], h["lat"])
    rc, d, how = snap(pt, 1500, h["area_ref"])
    heads.append({**h, "rc": rc, "snap_m": round(d), "snap_how": how})

# Thu Bồn chỉ lấy phần hạ lưu Giao Thủy; Vu Gia chỉ lấy điểm cuối (phần trên đã có D8)
gt = next(h for h in heads if h["id"] == "ST-GIAOTHUY")
gt_pt = Point(*xy_of(*gt["rc"]))
tb = rivers["Sông Thu Bồn"]
rivers["Sông Thu Bồn"] = substring(tb, tb.project(gt_pt), tb.length)
del rivers["Sông Vu Gia"]

# ------------------------------------------------------------------ thượng nguồn: dò D8
dams = gpd.read_file(WORK / "dams_snap.geojson").to_crs(CRS_METRIC)
keypoints = []
for _, r in dams.iterrows():
    rc = rc_of(r.geometry.x, r.geometry.y)
    keypoints.append(dict(id=r["code"], name=r["name"].replace("Hồ ", "Đập "), type="dam", rc=rc))
for s in UPLAND_STATIONS:
    rc, d, how = snap(to_utm(s["lon"], s["lat"]), 2500, s["area_ref"])
    keypoints.append(dict(id=s["id"], name=s["name"], type="station", rc=rc, area_ref=s["area_ref"],
                          snap_m=round(d), snap_how=how, river=s["river"]))
for h in heads:
    keypoints.append(dict(id=h["id"], name=h["name"], type="station" if h["id"].startswith("ST-") else "delta_head",
                          rc=h["rc"], area_ref=h["area_ref"], snap_m=h["snap_m"], snap_how=h["snap_how"]))

stop = {h["rc"]: h["id"] for h in heads}
traces, ends = {}, {}
for k in keypoints:
    if k["rc"] in stop:
        continue
    traces[k["id"]], ends[k["id"]] = trace(k["rc"], stop)

pred = defaultdict(set)
for p in traces.values():
    for a, b in zip(p, p[1:]):
        pred[b].add(a)
node_at = {k["rc"]: k for k in keypoints}
junctions = {rc for rc, s in pred.items() if len(s) >= 2 and rc not in node_at}
for i, rc in enumerate(sorted(junctions)):
    node_at[rc] = dict(id=f"J{i + 1:02d}", name="Hợp lưu", type="confluence", rc=rc)
for kid, p in traces.items():                  # điểm cuối không tới đầu đồng bằng → nút "cửa ra"
    if p[-1] not in node_at:
        node_at[p[-1]] = dict(id=f"OUT-{kid}", name=f"Cửa ra (dò từ {kid})", type="outlet", rc=p[-1])

edges = {}
for kid, p in traces.items():
    seg = [p[0]]
    for rc in p[1:]:
        seg.append(rc)
        if rc in node_at:
            u, v = node_at[seg[0]]["id"], node_at[rc]["id"]
            if (u, v) not in edges:
                xy = [xy_of(*q) for q in seg]
                steps = sum(np.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(xy, xy[1:]))
                z0, z1 = float(dem[seg[0]]), float(dem[rc])
                edges[(u, v)] = dict(source="d8", length_km=round(steps / 1000, 2), z_up=round(z0, 1),
                                     z_down=round(z1, 1), slope=round((z0 - z1) / max(steps, 1), 5),
                                     geometry=LineString(xy).simplify(15))
            seg = [rc]

nodes = {}
for rc, n in node_at.items():
    x, y = xy_of(*rc)
    nodes[n["id"]] = {**{k: v for k, v in n.items() if k != "rc"}, "area_km2": round(area(rc), 1), "geometry": Point(x, y)}

# ------------------------------------------------------------------ đồng bằng: nút, cạnh từ OSM
cuts = defaultdict(list)          # tên sông → [(khoảng cách dọc sông, nút_id)]
dnodes = []                       # (point, id, name, type)


def add_dnode(pt, nid, name, typ):
    for q, qid, *_ in dnodes:
        if q.distance(pt) <= MERGE_M:
            return qid
    dnodes.append((pt, nid, name, typ))
    return nid


# đầu đồng bằng
gt_id = add_dnode(gt_pt, "ST-GIAOTHUY", gt["name"], "station")
vg_head = next(h for h in heads if h["id"] == "J-VUGIA-END")
vg_id = add_dnode(vg_end, "J-VUGIA-END", vg_head["name"], "delta_head")
# đầu/cuối mỗi sông chạm sông khác → nút phân/hợp lưu
jn = 0
for name, ln in rivers.items():
    for end in (Point(ln.coords[0]), Point(ln.coords[-1])):
        best = None
        for other, ol in rivers.items():
            if other != name and ol.distance(end) <= JOIN_M:
                d = ol.distance(end)
                if best is None or d < best[0]:
                    best = (d, other, ol)
        for nid, p0 in ((vg_id, vg_end), (gt_id, gt_pt)):
            if p0.distance(end) <= JOIN_M and (best is None or p0.distance(end) < best[0]):
                best = (p0.distance(end), None, None)
                use = nid
        if best is None:
            continue
        if best[1] is None:
            cuts[name].append((ln.project(end), use))
            continue
        jn += 1
        on = best[2].interpolate(best[2].project(end))
        nid = add_dnode(on, f"D{jn:02d}", f"Nối {name.replace('Sông ', '')} – {best[1].replace('Sông ', '')}", "delta_junction")
        cuts[name].append((ln.project(end), nid))
        cuts[best[1]].append((best[2].project(on), nid))
# trạm đồng bằng
for s in DELTA_STATIONS:
    pt = to_utm(s["lon"], s["lat"])
    name, ln = min(rivers.items(), key=lambda kv: kv[1].distance(pt))
    on = ln.interpolate(ln.project(pt))
    nid = add_dnode(on, s["id"], s["name"], "station")
    cuts[name].append((ln.project(on), nid))
    s["snap_m"], s["on_river"] = round(on.distance(pt)), name
# Thu Bồn bắt đầu tại Giao Thủy
cuts["Sông Thu Bồn"].append((0.0, gt_id))

pts = {nid: p for p, nid, *_ in dnodes}
for name, ln in rivers.items():
    cs = sorted(set(cuts[name]))
    # đầu/cuối không nối → nguồn (thượng lưu sông nhánh) hoặc cửa sông
    if not cs or cs[0][0] > JOIN_M:
        sid = add_dnode(Point(ln.coords[0]), f"SRC-{name.replace('Sông ', '').replace(' ', '')}", f"Đầu {name}", "source")
        pts[sid] = Point(ln.coords[0])
        cs.insert(0, (0.0, sid))
    if cs[-1][0] < ln.length - JOIN_M:
        oid = add_dnode(Point(ln.coords[-1]), f"OUT-{name.replace('Sông ', '').replace(' ', '')}", f"Cửa {name}", "outlet")
        pts[oid] = Point(ln.coords[-1])
        cs.append((ln.length, oid))
    for (d0, u), (d1, v) in zip(cs, cs[1:]):
        if u == v or d1 - d0 < 1:
            continue
        g = substring(ln, d0, d1)
        edges[(u, v)] = dict(source="osm", river=name, length_km=round((d1 - d0) / 1000, 2),
                             split_fraction=None, geometry=g.simplify(10))
for p, nid, name, typ in dnodes:
    if nid not in nodes:
        rc = rc_of(p.x, p.y)
        nodes[nid] = dict(id=nid, name=name, type=typ, area_km2=None, geometry=p)
    else:
        nodes[nid]["type"] = nodes[nid]["type"]
for s in DELTA_STATIONS:
    nodes[s["id"]].update(river=s["on_river"], snap_m=s["snap_m"], coord_note="tọa độ gần đúng – cần xác nhận")

# Nguồn sông nhánh đồng bằng (Túy Loan, Quá Giáng…): diện tích lưu vực tại điểm đầu đoạn OSM
for nid, n in nodes.items():
    if n["type"] == "source":
        rc, d, _ = snap(n["geometry"], 500)
        n["area_km2"] = round(area(rc), 1)

# ------------------------------------------------------------------ khai báo tay
edges[("HO-2", "HO-19")] = dict(
    source="declared", kind="diversion", flow_component="q_turbine", length_km=None,
    note="QĐ 1865 Phụ lục I: nhà máy Đắk Mi 4 (Q max 128 m³/s) xả vào hồ Đắk Mi 4b (lưu vực riêng 29 km² nhưng Q nhà máy "
         "130 m³/s) rồi Đắk Mi 4c (140 m³/s) → sông Thu Bồn. Đắk Mi 4b chưa có trong hệ thống nên nối thẳng HO-2 → HO-19. "
         "Cạnh D8 từ HO-2 xuôi Đắk Mi (về Vu Gia) chỉ mang phần xả tràn và dòng chảy tối thiểu (≥ 3 m³/s, Điều 13).",
    geometry=LineString([nodes["HO-2"]["geometry"], nodes["HO-19"]["geometry"]]))
for (u, v), e in edges.items():
    if e["source"] == "d8" and u == "HO-2":
        e["flow_component"] = "q_spillway"

# diện tích khu giữa của mỗi nút (thượng nguồn): A(v) − Σ A(u) các cạnh D8 đổ vào
inc = defaultdict(list)
for (u, v), e in edges.items():
    if e["source"] == "d8":
        inc[v].append(u)
for nid, n in nodes.items():
    if n.get("area_km2") is not None and n["type"] != "source":
        ups = [nodes[u]["area_km2"] for u in inc.get(nid, [])]
        n["local_area_km2"] = round(n["area_km2"] - sum(ups), 1) if ups else n["area_km2"]

# ------------------------------------------------------------------ kiểm tra
print(f"Ô lưới {abs(T.a):.0f} m; {len(nodes)} nút, {len(edges)} cạnh. Sông OSM thiếu: {missing or 'không'}")
print("\nĐầu đồng bằng / trạm (đối chiếu diện tích):")
for nid in ["ST-THANHMY", "ST-NONGSON", "ST-GIAOTHUY", "J-VUGIA-END"]:
    n = nodes[nid]
    ref = n.get("area_ref")
    diff = f"{(n['area_km2'] - ref) / ref * 100:+.1f}%" if ref else "—"
    print(f"  {nid:14s} {n['area_km2']:8.1f} km²  tham chiếu {ref or '—':>5}  lệch {diff:>7}  dời {n.get('snap_m')} m ({n.get('snap_how')})")
print("\nDò D8 từ đập/trạm:")
for kid, why in ends.items():
    print(f"  {kid:14s} → {why}")
bad = [k for k, why in ends.items() if not why.startswith(("ST-", "J-"))]
print("\nĐập không tới đầu đồng bằng:", bad or "không")
for s in DELTA_STATIONS:
    print(f"  {s['id']:12s} trên {s['on_river']:16s} cách tọa độ nhập {s['snap_m']} m")

import networkx as nx
G = nx.DiGraph()
G.add_nodes_from(nodes)
G.add_edges_from(edges)
outs = [n for n, d in G.out_degree() if d == 0]
print("\nNút không có cạnh ra (phải là cửa sông):", outs)
for nid in [n for n in nodes if n.startswith("HO-")]:
    reach = [o for o in outs if nx.has_path(G, nid, o)]
    if not reach:
        print("  !", nid, "không tới cửa sông nào")
print("Chu trình:", list(nx.simple_cycles(G))[:5] or "không")
cascade = {}
for nid in sorted(n for n in nodes if n.startswith("HO-")):
    down = [d for d in nx.descendants(G, nid) if d.startswith("HO-")]
    if down:
        cascade[nid] = sorted(down, key=lambda d: nx.shortest_path_length(G, nid, d))
print("Hồ bậc thang (hồ → các hồ hạ lưu):")
for k, v in cascade.items():
    print(f"  {k}: {' → '.join(v)}")

# ------------------------------------------------------------------ ghi
def geo(g):
    return gpd.GeoSeries([g], crs=CRS_METRIC).to_crs(4326).iloc[0]


feat = []
out_nodes, out_edges = [], []
for nid, n in nodes.items():
    p = geo(n["geometry"])
    props = {k: v for k, v in n.items() if k not in ("geometry",)}
    props.update(lon=round(p.x, 5), lat=round(p.y, 5))
    out_nodes.append(props)
    gprops = {("node_type" if k == "type" else k): v for k, v in props.items()}   # 'type' trùng khóa GeoJSON
    feat.append({"type": "Feature", "geometry": mapping(p), "properties": {**gprops, "kind": "node"}})
for (u, v), e in edges.items():
    g = geo(e["geometry"])
    props = {k: val for k, val in e.items() if k != "geometry"}
    props.update({"from": u, "to": v})
    out_edges.append(props)
    feat.append({"type": "Feature", "geometry": json.loads(json.dumps(mapping(g))), "properties": {**props, "kind": "edge"}})

meta = {
    "note": "Mạng kết nối thủy văn Vu Gia – Thu Bồn (tạo bởi 10_network.py). Thượng nguồn theo D8 (DEM 30 m), đồng bằng theo "
            "sông OSM; split_fraction tại phân lưu chưa biết (null). Tọa độ trạm gần đúng – cần xác nhận.",
    "cell_m": abs(T.a), "crs_compute": CRS_METRIC,
    "cascades": cascade,
    "warnings": [
        "Đắk Mi 4 → Đắk Mi 4b → Đắk Mi 4c (QĐ 1865 Phụ lục I) – chưa có Đắk Mi 4b và tọa độ nhà máy; cạnh khai báo không có trễ truyền.",
        "Za Hưng (HO-13): D8 xếp ở thượng lưu A Vương nhưng Q đến Za Hưng gần trùng Q đến A Vương – cần xác nhận vị trí đập, nhà máy, tuyến xả.",
        "Các nhà máy kiểu đường dẫn (đường hầm) xả nước tại nhà máy, không tại đập – cần tọa độ nhà máy để đặt đúng điểm nhập lưu.",
        "Tọa độ trạm thủy văn là gần đúng; diện tích tham chiếu (Thành Mỹ 1850, Nông Sơn 3130, Giao Thủy 3825 km²) cần xác nhận. Diện tích lưu vực các hồ khớp Phụ lục I QĐ 1865 (sai lệch ≤ 2,7%).",
        "Tỷ lệ chia nước tại phân lưu (Quảng Huế, Yên/Quá Giáng, Vĩnh Điện) chưa biết – xác định bằng mô hình 1D hoặc số liệu đo.",
        "Đồng bằng: chưa tính diện tích khu giữa đổ trực tiếp vào các nhánh (Túy Loan thượng nguồn, vùng trũng) – bổ sung khi có DTM.",
    ],
}
(COMPUTE / "network.json").write_text(json.dumps({**meta, "nodes": out_nodes, "edges": out_edges},
                                                  ensure_ascii=False, indent=1, default=float), encoding="utf-8")
(COMPUTE / "network.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feat},
                                                     ensure_ascii=False, default=float), encoding="utf-8")
print("\n→", COMPUTE / "network.json")
