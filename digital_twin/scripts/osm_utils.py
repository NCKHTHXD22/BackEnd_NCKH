"""Đọc dữ liệu OSM tải bằng Overpass (bước 2) thành GeoDataFrame."""
import json

import geopandas as gpd
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, unary_union

from config import RAW


def _coords(el):
    return [(p["lon"], p["lat"]) for p in el.get("geometry", [])]


def read_lakes():
    """Mặt nước hồ (way khép kín + relation multipolygon), EPSG:4326."""
    els = json.load(open(RAW / "osm" / "water.json", encoding="utf-8"))["elements"]
    rows = []
    for e in els:
        t = e.get("tags", {})
        if e["type"] == "way" and len(_coords(e)) >= 4:
            geom = Polygon(_coords(e))
        elif e["type"] == "relation":
            ring = lambda role: [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                                 for m in e.get("members", []) if m.get("role") == role and m.get("geometry")]
            polys = list(polygonize(unary_union(ring("outer"))))
            if not polys:
                continue
            geom = unary_union(polys)
            inner = ring("inner")
            if inner:
                geom = geom.difference(unary_union(list(polygonize(unary_union(inner)))))
        else:
            continue
        rows.append({"name": t.get("name:vi") or t.get("name"), "osm_id": f'{e["type"]}/{e["id"]}',
                     "geometry": geom.buffer(0)})
    return gpd.GeoDataFrame(rows, crs="EPSG:4326")


def read_rivers():
    """Đoạn sông (waterway=river), EPSG:4326."""
    els = json.load(open(RAW / "osm" / "rivers.json", encoding="utf-8"))["elements"]
    rows = [{"name": e["tags"].get("name:vi") or e["tags"].get("name"), "name_en": e["tags"].get("name:en"),
             "geometry": LineString(_coords(e))} for e in els if e["type"] == "way" and len(_coords(e)) > 1]
    return gpd.GeoDataFrame(rows, crs="EPSG:4326")
