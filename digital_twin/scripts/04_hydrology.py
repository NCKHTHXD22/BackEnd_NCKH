"""Bước 4 – Xử lý DEM: ghép, chiếu sang UTM, phân tích dòng chảy D8, tách lưu vực và mạng sông.

Đầu vào : data/raw/dem/*.tif (bước 1), web/public/data/dt/reservoirs.geojson (bước 3)
Đầu ra  : web/public/data/dt/basin.geojson         – ranh giới toàn lưu vực
          web/public/data/dt/catchments.geojson    – lưu vực bộ phận của từng hồ (phần diện tích
                                                  chảy vào hồ đó mà không qua hồ khác phía trên)
          web/public/data/dt/streams.geojson       – mạng sông trích từ DEM, có cấp Strahler
          data/work/dem_utm.tif, d8.tif, facc.tif ... (trung gian)
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/04_hydrology.py
"""
import json
import subprocess
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
import rasterio.mask
from rasterio.enums import Resampling
from rasterio.features import shapes
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject
from shapely.geometry import shape, Point

from config import RAW, WORK, OUT, BBOX, CRS_METRIC, CELL, STREAM_KM2
from osm_utils import read_lakes

WBT = Path(__file__).resolve().parents[1] / ".venv/Lib/site-packages/whitebox/WBT/whitebox_tools.exe"
CELL_KM2 = CELL * CELL / 1e6


def wbt(tool, **kw):
    """Gọi một công cụ WhiteboxTools; tham số tính theo thư mục WORK."""
    args = [str(WBT), f"--run={tool}", f"--wd={WORK}", "-v=false"]
    args += [f"--{k}={v}" if v is not True else f"--{k}" for k, v in kw.items()]
    print(f"  · {tool}")
    subprocess.run(args, check=True)


def step(msg):
    print(f"\n== {msg}")


# 1) Ghép các ô DEM, cắt theo khung, chiếu sang UTM 30 m -------------------------------
step("Ghép và chiếu DEM")
dem_utm = WORK / "dem_utm.tif"
if not dem_utm.exists():
    srcs = [rasterio.open(p) for p in sorted((RAW / "dem").glob("*.tif"))]
    mosaic, tr = merge(srcs, bounds=(BBOX["west"], BBOX["south"], BBOX["east"], BBOX["north"]))
    prof = srcs[0].profile | dict(height=mosaic.shape[1], width=mosaic.shape[2], transform=tr)
    dst_tr, w, h = calculate_default_transform(prof["crs"], CRS_METRIC, prof["width"], prof["height"],
                                               *rasterio.transform.array_bounds(prof["height"], prof["width"], tr),
                                               resolution=CELL)
    out = np.full((h, w), -9999, dtype="float32")
    reproject(mosaic[0], out, src_transform=tr, src_crs=prof["crs"], dst_transform=dst_tr,
              dst_crs=CRS_METRIC, resampling=Resampling.nearest, src_nodata=None, dst_nodata=-9999)
    # Biển trong Copernicus DEM có cao độ đúng 0 → đặt là không dữ liệu để bờ biển thành cửa
    # thoát nước (vùng phẳng rộng làm thuật toán xử lý trũng chạy rất chậm và sai hướng chảy)
    out[out == 0] = -9999
    with rasterio.open(dem_utm, "w", driver="GTiff", height=h, width=w, count=1, dtype="float32",
                       crs=CRS_METRIC, transform=dst_tr, nodata=-9999, compress="deflate") as dst:
        dst.write(out, 1)
    print(f"  {w}×{h} ô, {w * h / 1e6:.1f} triệu ô")

# 2) Phân tích dòng chảy -------------------------------------------------------------------
step("Phân tích dòng chảy D8")
if not (WORK / "facc.tif").exists():
    # Khai thông trũng giả (Lindsay 2016) rồi lấp phần còn sót, giữ hướng dốc trên vùng phẳng
    wbt("BreachDepressions", dem="dem_utm.tif", output="dem_breach0.tif")
    wbt("FillDepressions", dem="dem_breach0.tif", output="dem_breach.tif", fix_flats=True)
    wbt("D8Pointer", dem="dem_breach.tif", output="d8.tif")
    wbt("D8FlowAccumulation", i="dem_breach.tif", output="facc.tif", out_type="cells")
threshold = int(STREAM_KM2 / CELL_KM2)
if not (WORK / "strahler.tif").exists():
    wbt("ExtractStreams", flow_accum="facc.tif", output="streams.tif", threshold=threshold)
    wbt("StrahlerStreamOrder", d8_pntr="d8.tif", streams="streams.tif", output="strahler.tif")
    wbt("Basins", d8_pntr="d8.tif", output="basins.tif")

# 3) Xác định tuyến đập trên lưới dòng chảy --------------------------------------------------
# Tọa độ đập trong backend có chỗ làm tròn tới 0,01° (~1 km), nên không dùng trực tiếp được.
# Cách làm: tìm mặt hồ OSM gần nhất (≤ 2,5 km); tuyến đập = ô có tích lũy dòng chảy lớn nhất
# trong mặt hồ (nới 90 m) – tức cửa ra của hồ. Không có mặt hồ → ô tích lũy lớn nhất trong 300 m.
step("Xác định tuyến đập")
res = gpd.read_file(OUT / "reservoirs.geojson").to_crs(CRS_METRIC)
lakes = read_lakes().to_crs(CRS_METRIC)
lakes = lakes[lakes.area >= 0.05e6]
facc_src = rasterio.open(WORK / "facc.tif")


def max_acc_in(geom):
    win, tr = rasterio.mask.mask(facc_src, [geom], crop=True, nodata=-1)
    r, c = np.unravel_index(np.argmax(win[0]), win[0].shape)
    x, y = rasterio.transform.xy(tr, r, c)
    return Point(x, y), float(win[0][r, c])


MIN_DAM_KM2 = 50   # các đập thủy điện trong lưu vực đều có lưu vực lớn hơn mức này
rows = []
for _, r in res.iterrows():
    pt = None
    d = lakes.distance(r.geometry)
    if len(d) and d.min() <= 2500:
        lake = lakes.loc[d.idxmin()]
        p, acc = max_acc_in(lake.geometry.buffer(90))
        if p.distance(r.geometry) <= 1500:   # cửa ra phải gần tọa độ đập, tránh nhận nhầm hồ khác
            pt, how = p, f"cửa ra mặt hồ OSM «{lake['name'] if isinstance(lake['name'], str) else lake['osm_id']}»"
    if pt is None:
        pt, acc = max_acc_in(r.geometry.buffer(150))
        how = "ô tích lũy lớn nhất trong 150 m"
    flag = ""
    if acc * CELL_KM2 < MIN_DAM_KM2:
        pt, acc = max_acc_in(r.geometry.buffer(1500))
        how, flag = "ô tích lũy lớn nhất trong 1,5 km", "NGHI SAI TỌA ĐỘ – cần kiểm tra"
    rows.append({"code": r["code"], "name": r["name"], "catch_total_km2": round(acc * CELL_KM2, 1),
                 "dời_m": round(pt.distance(r.geometry)), "cách": how, "cảnh_báo": flag,
                 "lon_goc": round(res.to_crs(4326).loc[_, "geometry"].x, 5),
                 "lat_goc": round(res.to_crs(4326).loc[_, "geometry"].y, 5), "geometry": pt})
snap = gpd.GeoDataFrame(rows, crs=CRS_METRIC)
dup = snap[snap.duplicated("catch_total_km2", keep=False)]
if len(dup):
    print("  ! Hai hồ trùng tuyến đập:", ", ".join(dup["code"]))
snap4326 = snap.to_crs(4326)
snap.drop(columns="geometry").assign(lon_dap=snap4326.geometry.x.round(5), lat_dap=snap4326.geometry.y.round(5)) \
    .to_csv(WORK.parent / "kiem_tra_tuyen_dap.csv", index=False, encoding="utf-8-sig")
snap.assign(FID=range(1, len(snap) + 1))[["FID", "code", "geometry"]].to_file(WORK / "dams_snap.shp")
wbt("Watershed", d8_pntr="d8.tif", pour_pts="dams_snap.shp", output="catch.tif")
print(snap[["code", "catch_total_km2", "dời_m", "cách", "cảnh_báo"]].to_string(index=False))
snap.to_crs("EPSG:4326").to_file(WORK / "dams_snap.geojson", driver="GeoJSON")


# 4) Vector hoá ---------------------------------------------------------------------------
def polygons(raster, keep=None):
    with rasterio.open(WORK / raster) as f:
        a = f.read(1)
        mask = (a > 0) if keep is None else np.isin(a, keep)
        geoms = [(shape(g), int(v)) for g, v in shapes(a.astype("int32"), mask=mask, transform=f.transform)]
    g = gpd.GeoDataFrame({"val": [v for _, v in geoms]}, geometry=[s for s, _ in geoms], crs=CRS_METRIC)
    return g.dissolve("val").reset_index()


step("Ranh giới toàn lưu vực")
with rasterio.open(WORK / "basins.tif") as f:
    ids = {int(v[0]) for v in f.sample([(p.x, p.y) for p in snap.geometry])}
basin = polygons("basins.tif", keep=list(ids))
basin = gpd.GeoDataFrame(geometry=[basin.union_all()], crs=CRS_METRIC)
basin["geometry"] = basin.buffer(0).simplify(60)
area = basin.area.iloc[0] / 1e6
print(f"  {len(ids)} vùng thoát nước, tổng {area:,.0f} km²")
basin = basin.assign(code="LV-VGTB", name="Lưu vực Vu Gia – Thu Bồn", area_km2=round(area, 0))

step("Lưu vực bộ phận của từng hồ")
catch = polygons("catch.tif")
catch["geometry"] = catch.buffer(0).simplify(60)
idx = {i + 1: r for i, r in res.reset_index(drop=True).iterrows()}  # Watershed đánh số theo thứ tự điểm
catch["code"] = catch["val"].map(lambda v: "LVH-" + idx[v]["code"].split("-")[1])
catch["reservoir_code"] = catch["val"].map(lambda v: idx[v]["code"])
catch["name"] = catch["val"].map(lambda v: "Lưu vực bộ phận " + idx[v]["name"])
catch["branch"] = catch["val"].map(lambda v: idx[v]["branch"])
catch["area_km2"] = (catch.area / 1e6).round(1)
catch["catch_total_km2"] = catch["reservoir_code"].map(dict(zip(snap["code"], snap["catch_total_km2"])))
catch["warning"] = catch["reservoir_code"].map(dict(zip(snap["code"], snap["cảnh_báo"])))

step("Mạng sông")
wbt("RasterStreamsToVector", streams="strahler.tif", d8_pntr="d8.tif", output="streams.shp")
st = gpd.read_file(WORK / "streams.shp").set_crs(CRS_METRIC, allow_override=True)
st = gpd.clip(st, basin.buffer(200))
st = st.rename(columns={"STRM_VAL": "strahler"})[["strahler", "geometry"]]
st["geometry"] = st.simplify(30)
st = st.dissolve("strahler").reset_index().explode(index_parts=False).reset_index(drop=True)
st["code"] = [f"SONG-{i + 1}" for i in range(len(st))]
st["name"] = "Sông/suối cấp " + st["strahler"].astype(str)
st["length_km"] = (st.length / 1000).round(2)
print(f"  {len(st)} đoạn, {st['length_km'].sum():,.0f} km, cấp Strahler tối đa {st['strahler'].max()}")


def save(gdf, name, cols):
    g = gdf[cols + ["geometry"]].to_crs("EPSG:4326")
    g.to_file(OUT / f"{name}.geojson", driver="GeoJSON", COORDINATE_PRECISION=5)
    print(f"  → {name}.geojson ({(OUT / f'{name}.geojson').stat().st_size / 1e6:.1f} MB)")


step("Ghi GeoJSON")
save(basin, "basin", ["code", "name", "area_km2"])
save(catch, "catchments", ["code", "reservoir_code", "name", "branch", "area_km2", "catch_total_km2", "warning"])
save(st, "streams", ["code", "name", "strahler", "length_km"])
json.dump({"stream_threshold_km2": STREAM_KM2, "cell_m": CELL, "basin_area_km2": round(area, 0)},
          open(WORK / "hydrology_summary.json", "w"), indent=1)
print("\nxong")
