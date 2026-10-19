"""Bước 1 – Tải DEM Copernicus GLO-30 (30 m) phủ lưu vực từ kho dữ liệu mở trên AWS.

Nguồn: https://registry.opendata.aws/copernicus-dem/ (miễn phí, không cần tài khoản).
Cao độ theo geoid EGM2008. Mỗi ô 1°×1°.
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/01_download_dem.py
"""
import math
import requests
from config import RAW, BBOX

URL = ("https://copernicus-dem-30m.s3.amazonaws.com/"
       "Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM/"
       "Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM.tif")

out_dir = RAW / "dem"
out_dir.mkdir(parents=True, exist_ok=True)

for lat in range(math.floor(BBOX["south"]), math.ceil(BBOX["north"])):
    for lon in range(math.floor(BBOX["west"]), math.ceil(BBOX["east"])):
        url = URL.format(ns="N", lat=lat, ew="E", lon=lon)
        dst = out_dir / url.rsplit("/", 1)[1]
        if dst.exists():
            print("đã có", dst.name)
            continue
        print("tải", dst.name)
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(dst, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
print("xong")
