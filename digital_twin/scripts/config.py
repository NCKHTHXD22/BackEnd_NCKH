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
