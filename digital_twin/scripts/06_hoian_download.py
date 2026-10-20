"""Bước 6 – Tải dữ liệu OSM khu thí điểm Hội An: nhà, đường, mặt nước/sông/bờ biển.

Overpass hay quá tải (HTTP 502/429) → tự thử lại, thời gian chờ tăng gấp đôi mỗi lần.
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/06_hoian_download.py
"""
import json
import time

import requests

from config import RAW

OVERPASS = "https://overpass-api.de/api/interpreter"
b = "15.855,108.29,15.91,108.39"   # nam, tây, bắc, đông – phố cổ, Cẩm Nam, Cẩm Thanh, Cửa Đại
QUERIES = {
    "buildings": f'[out:json][timeout:300];way["building"]({b});out tags geom;',
    "roads": f'[out:json][timeout:300];way["highway"]({b});out tags geom;',
    "water": f'[out:json][timeout:300];(way["natural"="water"]({b});relation["natural"="water"]({b});'
             f'way["waterway"~"river|canal|riverbank"]({b});way["natural"="coastline"]({b}););out geom;',  # giữ thành phần relation
}

out_dir = RAW / "hoian"
out_dir.mkdir(parents=True, exist_ok=True)
for name, q in QUERIES.items():
    dst = out_dir / f"{name}.json"
    if dst.exists() and dst.stat().st_size > 1000:
        print("đã có", dst.name)
        continue
    wait = 30
    for attempt in range(6):
        r = requests.post(OVERPASS, data={"data": q}, timeout=600,
                          headers={"User-Agent": "NCKH-VuGiaThuBon-DigitalTwin/0.1"})
        if r.status_code == 200:
            dst.write_text(json.dumps(r.json(), ensure_ascii=False), encoding="utf-8")
            print(f"tải {name}: {len(r.json()['elements'])} đối tượng")
            break
        print(f"{name}: HTTP {r.status_code}, thử lại sau {wait} s")
        time.sleep(wait)
        wait *= 2
    time.sleep(5)
