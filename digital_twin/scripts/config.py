"""Cấu hình dùng chung cho các script xử lý dữ liệu bản đồ số Vu Gia – Thu Bồn."""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252, không in được tiếng Việt

ROOT = Path(__file__).resolve().parents[1]          # digital_twin/
RAW = ROOT / "data" / "raw"                          # dữ liệu gốc tải về (không sửa)
WORK = ROOT / "data" / "work"                        # dữ liệu trung gian
OUT = ROOT.parent / "web" / "public" / "data" / "dt"  # dữ liệu lớp bản đồ: web/ và digital_twin/app dùng chung

# Khung bao lưu vực (WGS84), đã nới rộng để không hụt mép khi tách lưu vực
BBOX = dict(west=107.0, south=14.7, east=108.6, north=16.3)

# Hệ tọa độ phẳng để phân tích thủy văn (UTM 49N, đơn vị mét)
CRS_METRIC = "EPSG:32649"
CELL = 30  # m

# Ngưỡng diện tích tích lũy để coi là sông (km²)
STREAM_KM2 = 10

# 16 hồ: id khớp Id_Lake trong backend (src/api/config/reservoirs.js); nhánh theo
# LSTM_Py_Backend_v2/config/reservoirs.py (RIVER_BRANCHES)
BRANCH_OF = {
    1: "A Vương", 13: "A Vương", 16: "A Vương",
    9: "Sông Bung", 3: "Sông Bung", 7: "Sông Bung", 8: "Sông Bung", 11: "Sông Bung",
    18: "Đắk Mi", 14: "Đắk Mi", 2: "Đắk Mi", 19: "Đắk Mi",
    4: "Sông Tranh", 12: "Sông Tranh", 17: "Sông Tranh", 15: "Sông Tranh",
}

for p in (RAW, WORK, OUT):
    p.mkdir(parents=True, exist_ok=True)


def hoian_window(transform, shape, crs="EPSG:32649", pad=10):
    """Cửa sổ (hàng, cột) trên lưới UTM `transform`/`shape` phủ khu thí điểm Hội An (lưới flood_grid.json của 07_hoian.py)
    + `pad` ô – để 14/19 lưu mặt nước khu này cho mô phỏng 3D (23_sim_package.py)."""
    import json
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds
    g = json.loads((OUT / "hoian" / "flood_grid.json").read_text(encoding="utf-8"))
    b = (g["west"], g["north"] - g["dy"] * g["ny"], g["west"] + g["dx"] * g["nx"], g["north"])
    w = from_bounds(*transform_bounds("EPSG:4326", crs, *b), transform=transform).round_offsets().round_lengths()
    r0, c0 = max(int(w.row_off) - pad, 0), max(int(w.col_off) - pad, 0)
    r1, c1 = min(int(w.row_off + w.height) + pad, shape[0]), min(int(w.col_off + w.width) + pad, shape[1])
    return (slice(r0, r1), slice(c0, c1)), transform * transform.translation(c0, r0)


def block_mean(a, k=10):
    """Trung bình khối k×k bỏ qua NaN (mặt nước toàn vùng 30 m → 300 m cho mô phỏng 3D); khối toàn NaN → NaN."""
    import warnings
    import numpy as np
    h, w = a.shape[0] // k * k, a.shape[1] // k * k
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(a[:h, :w].reshape(h // k, k, w // k, k), axis=(1, 3)).astype(np.float32)
