"""Bước 2 – Tải sông có tên (waterway=river) và hồ nước từ OpenStreetMap qua Overpass API.

Dữ liệu OSM © OpenStreetMap contributors, giấy phép ODbL – phải ghi nguồn trên bản đồ.
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/02_download_osm.py
"""
import json
import requests
from config import RAW, BBOX

OVERPASS = "https://overpass-api.de/api/interpreter"
b = f'{BBOX["south"]},{BBOX["west"]},{BBOX["north"]},{BBOX["east"]}'

QUERIES = {
    "rivers": f'[out:json][timeout:180];way["waterway"="river"]({b});out tags geom;',
    # Hồ thủy điện trên OSM có thể gắn natural=water, landuse=reservoir hoặc water=reservoir
    "water": f'[out:json][timeout:180];(way["natural"="water"]({b});relation["natural"="water"]({b});'
             f'way["landuse"="reservoir"]({b});relation["landuse"="reservoir"]({b});'
             f'way["water"="reservoir"]({b});relation["water"="reservoir"]({b}););out tags geom;',
}

out_dir = RAW / "osm"
out_dir.mkdir(parents=True, exist_ok=True)
for name, q in QUERIES.items():
    dst = out_dir / f"{name}.json"
    if dst.exists():
        print("đã có", dst.name)
        continue
    print("tải", name)
    r = requests.post(OVERPASS, data={"data": q}, timeout=300,
                      headers={"User-Agent": "NCKH-VuGiaThuBon-DigitalTwin/0.1"})
    r.raise_for_status()
    dst.write_text(json.dumps(r.json(), ensure_ascii=False), encoding="utf-8")
    print(" ", len(r.json()["elements"]), "đối tượng")
print("xong")
