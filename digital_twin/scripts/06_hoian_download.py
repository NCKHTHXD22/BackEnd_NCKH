"""Bước 6 – Tải dữ liệu khu Hội An: nhà, đường, mặt nước/sông/bờ biển (OSM), chiều cao nhà đo từ ảnh vệ tinh
(Google Open Buildings 2.5D) và lớp phủ mặt đất (ESA WorldCover – để rải cây).

Hai vùng (theo ranh giới sau sáp nhập 1/7/2025, admin_wards.geojson của bước 24):
  - đất liền : phường Hội An, Hội An Đông, Hội An Tây (+ viền ~300 m) → buildings.json, roads.json, water.json
  - đảo      : xã Tân Hiệp (Cù Lao Chàm)                              → *_culaocham.json
  Mỗi vùng thêm: gob25d_2023*.tif   – chiều cao nhà năm 2023 (dm) + xác suất có nhà (%), lưới 2 m UTM 49N
                 worldcover_2021*.tif – lớp phủ ESA WorldCover 2021, ô ~10 m (10 = cây, 95 = rừng ngập mặn)
Khung tải của mỗi tệp ghi trong _bbox.json – đổi khung thì tự tải lại, khung không đổi thì bỏ qua.
Overpass hay quá tải (HTTP 502/429) → tự thử lại, thời gian chờ tăng gấp đôi mỗi lần.
Hai nguồn ảnh là COG công khai: chỉ đọc phần byte của khung (vài phút, không cần tài khoản).
  - Google Open Buildings 2.5D Temporal v1 (CC BY 4.0): độ phân giải hiệu dụng ~4 m, chiều cao 0–100 m so với
    mặt đất. Danh sách tile theo ô S2 cấp 7 (ô 31424 phủ Hội An), lấy từ bảng URL của
    github.com/saiga143/google-2.5d-bulk-download.
  - ESA WorldCover 10 m 2021 v200 (CC BY 4.0), tile 3°×3° N15E108.
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/06_hoian_download.py
"""
import json
import time

import numpy as np
import rasterio
import requests
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

from config import RAW

OVERPASS = "https://overpass-api.de/api/interpreter"
REGIONS = {                       # nam, tây, bắc, đông
    "": "15.85,108.285,15.926,108.395",
    "_culaocham": "15.9,108.415,15.985,108.545",
}
GOB25D = "https://storage.googleapis.com/open-buildings-temporal-data/v1/geotiffs/31424_2023_06_30/tile_{}.tif"
GOB25D_TILES = ["Q49OClUjEPg", "ocikwCkHViM", "UCsD5NKbR-0", "OBczARmAugY", "IagNuHr_HQE", "xCUGP8RaPl8"]
GOB25D_RES = 2.0                  # m; dữ liệu gốc 0,5 m nhưng độ nét thật ~4 m
WORLDCOVER = ("https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
              "ESA_WorldCover_10m_2021_v200_N15E108_Map.tif")
GDAL_REMOTE = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                   GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="5")


def queries(b):
    return {
        "buildings": f'[out:json][timeout:300];way["building"]({b});out tags geom;',
        "roads": f'[out:json][timeout:300];way["highway"]({b});out tags geom;',
        "water": f'[out:json][timeout:300];(way["natural"="water"]({b});relation["natural"="water"]({b});'
                 f'way["waterway"~"river|canal|riverbank"]({b});way["natural"="coastline"]({b}););out geom;',  # giữ thành phần relation
    }


out_dir = RAW / "hoian"
out_dir.mkdir(parents=True, exist_ok=True)
stamp_path = out_dir / "_bbox.json"
stamp = json.loads(stamp_path.read_text(encoding="utf-8")) if stamp_path.exists() else {}
for suffix, b in REGIONS.items():
    for name, q in queries(b).items():
        dst = out_dir / f"{name}{suffix}.json"
        if dst.exists() and dst.stat().st_size > 100 and stamp.get(dst.name) == b:
            print("đã có", dst.name)
            continue
        wait = 30
        for attempt in range(6):
            r = requests.post(OVERPASS, data={"data": q}, timeout=600,
                              headers={"User-Agent": "NCKH-VuGiaThuBon-DigitalTwin/0.1"})
            if r.status_code == 200:
                dst.write_text(json.dumps(r.json(), ensure_ascii=False), encoding="utf-8")
                stamp[dst.name] = b
                stamp_path.write_text(json.dumps(stamp, indent=1), encoding="utf-8")
                print(f"tải {dst.name}: {len(r.json()['elements'])} đối tượng")
                break
            print(f"{dst.name}: HTTP {r.status_code}, thử lại sau {wait} s")
            time.sleep(wait)
            wait *= 2
        time.sleep(5)


def save_tif(dst, arr, transform, crs, nodata, b):
    with rasterio.open(dst, "w", driver="GTiff", width=arr.shape[2], height=arr.shape[1], count=arr.shape[0],
                       dtype=arr.dtype, crs=crs, transform=transform, nodata=nodata, compress="deflate",
                       tiled=True, blockxsize=512, blockysize=512) as f:
        f.write(arr)
    stamp[dst.name] = b
    stamp_path.write_text(json.dumps(stamp, indent=1), encoding="utf-8")
    print(f"tải {dst.name}: {arr.shape[2]}×{arr.shape[1]} ô ({dst.stat().st_size / 1e6:.1f} MB)")


for suffix, b in REGIONS.items():
    s, w, n, e = map(float, b.split(","))
    # Chiều cao nhà: ghép các tile phủ khung, lưới 2 m; lưu chiều cao (dm) và xác suất có nhà (%) dạng uint16
    dst = out_dir / f"gob25d_2023{suffix}.tif"
    if dst.exists() and stamp.get(dst.name) == b:
        print("đã có", dst.name)
    else:
        t0 = time.time()
        with rasterio.Env(**GDAL_REMOTE):
            srcs = [rasterio.open("/vsicurl/" + GOB25D.format(t)) for t in GOB25D_TILES]
            try:
                arr, tr = merge(srcs, bounds=transform_bounds("EPSG:4326", srcs[0].crs, w, s, e, n), res=GOB25D_RES,
                                indexes=[2, 3], nodata=-99.0, resampling=Resampling.nearest)   # 2 = chiều cao, 3 = có nhà
                crs = srcs[0].crs
            finally:
                for src in srcs:
                    src.close()
        bad = arr[0] < 0
        out = np.stack([np.clip(np.round(arr[0] * 10), 0, 1000), np.clip(np.round(arr[1] * 100), 0, 100)]).astype("uint16")
        out[:, bad] = 65535
        print(f"  {time.time() - t0:.0f} s; ô không có dữ liệu: {bad.mean() * 100:.1f} %")
        save_tif(dst, out, tr, crs, 65535, b)
    # Lớp phủ mặt đất ESA WorldCover (EPSG:4326, ô 1/12000°)
    dst = out_dir / f"worldcover_2021{suffix}.tif"
    if dst.exists() and stamp.get(dst.name) == b:
        print("đã có", dst.name)
    else:
        with rasterio.Env(**GDAL_REMOTE), rasterio.open("/vsicurl/" + WORLDCOVER) as src:
            win = from_bounds(w, s, e, n, src.transform).round_offsets().round_lengths()
            save_tif(dst, src.read(window=win), src.window_transform(win), src.crs, 0, b)
