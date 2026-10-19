"""Bước 5 – Chuyển dữ liệu OSM (bước 2) thành lớp GeoJSON, cắt theo ranh giới lưu vực (bước 4).

Đầu ra: web/public/data/dt/osm_rivers.geojson – sông có tên, gộp theo tên
        web/public/data/dt/lakes.geojson      – mặt nước hồ chứa/hồ tự nhiên ≥ 0,05 km²
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/05_osm_layers.py
"""
import geopandas as gpd
from shapely.ops import linemerge, unary_union

from config import OUT, CRS_METRIC
from osm_utils import read_lakes, read_rivers

basin = gpd.read_file(OUT / "basin.geojson").to_crs(CRS_METRIC)
clip_area = basin.buffer(500).union_all()

# Sông có tên ---------------------------------------------------------------------------
riv = read_rivers().to_crs(CRS_METRIC)
riv = gpd.clip(riv[riv["name"].notna()], clip_area)
def merge_lines(g):
    u = unary_union(list(g))
    return linemerge(u) if u.geom_type == "MultiLineString" else u


riv = riv.groupby("name").agg({"name_en": "first", "geometry": merge_lines}).reset_index()
riv = gpd.GeoDataFrame(riv, geometry="geometry", crs=CRS_METRIC)
riv["geometry"] = riv.simplify(20)
riv["length_km"] = (riv.length / 1000).round(1)
riv = riv[riv["length_km"] >= 3].sort_values("length_km", ascending=False).reset_index(drop=True)
riv["code"] = [f"OSM-SONG-{i + 1}" for i in range(len(riv))]
print(f"Sông có tên: {len(riv)} — dài nhất:",
      ", ".join(f"{n} ({l} km)" for n, l in zip(riv["name"][:6], riv["length_km"][:6])))

# Mặt nước hồ ---------------------------------------------------------------------------
lk = gpd.clip(read_lakes().to_crs(CRS_METRIC), clip_area)
lk["area_km2"] = (lk.area / 1e6).round(2)
lk = lk[lk["area_km2"] >= 0.05].copy()
lk["geometry"] = lk.simplify(15)
lk["name"] = lk["name"].fillna("Mặt nước (chưa có tên trên OSM)")
lk = lk.sort_values("area_km2", ascending=False).reset_index(drop=True)
lk["code"] = [f"MATNUOC-{i + 1}" for i in range(len(lk))]
print(f"Mặt nước: {len(lk)} vùng, tổng {lk['area_km2'].sum():.1f} km²")

for g, name, cols in [(riv, "osm_rivers", ["code", "name", "name_en", "length_km"]),
                      (lk, "lakes", ["code", "name", "osm_id", "area_km2"])]:
    g[cols + ["geometry"]].to_crs("EPSG:4326").to_file(OUT / f"{name}.geojson", driver="GeoJSON",
                                                       COORDINATE_PRECISION=5)
    print(f"  → {name}.geojson ({(OUT / f'{name}.geojson').stat().st_size / 1e6:.2f} MB)")
