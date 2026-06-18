"""
Ngưỡng cảnh báo lũ cho hệ thống 3 hồ Thừa Thiên Huế.

Nguồn:
  - Quy trình vận hành liên hồ chứa lưu vực sông Hương (QĐ 1401/QĐ-TTg 2019)
  - Quy chuẩn kỹ thuật quốc gia QCVN 04-05:2012/BNNPTNT
  - Thông tư 46/2016/TT-BTNMT (ngưỡng cảnh báo thiên tai)
"""

# Ngưỡng mực nước hồ (mét) → cấp cảnh báo vận hành
RESERVOIR_THRESHOLDS = {
    "ta_trach": {
        "normal_level_m": 54.0,
        "flood_limit_level_m": 52.0,     # Mực nước giới hạn mùa lũ
        "pre_flood_drawdown_m": 50.0,     # Mực nước đón lũ (hạ trước khi lũ về)
        "emergency_level_m": 54.6,        # Mực nước ứng khẩn cấp
        "maz_level_m": 55.4,             # Mực nước lũ kiểm tra (Max)
        "inflow_alert": {
            "level_1_m3s": 1000,  # Bắt đầu điều tiết
            "level_2_m3s": 2500,  # Tăng xả
            "level_3_m3s": 4000,  # Xả tối đa
        },
    },
    "binh_dien": {
        "normal_level_m": 72.0,
        "flood_limit_level_m": 70.0,
        "pre_flood_drawdown_m": 67.0,
        "emergency_level_m": 72.8,
        "maz_level_m": 73.7,
        "inflow_alert": {
            "level_1_m3s": 1200,
            "level_2_m3s": 3000,
            "level_3_m3s": 4800,
        },
    },
    "huong_dien": {
        "normal_level_m": 58.0,
        "flood_limit_level_m": 56.0,
        "pre_flood_drawdown_m": 53.0,
        "emergency_level_m": 59.0,
        "maz_level_m": 60.1,
        "inflow_alert": {
            "level_1_m3s": 2000,
            "level_2_m3s": 5000,
            "level_3_m3s": 8000,
        },
    },
}

# Ngưỡng mực nước sông Hương tại Kim Long (Huế city)
# Theo QĐ PCTT Thừa Thiên Huế 2023
HUONG_RIVER_KIM_LONG = {
    "station": "Kim Long",
    "lat": 16.470, "lon": 107.593,
    "bao_dong_1_m": 2.00,   # Cấp I — đề phòng
    "bao_dong_2_m": 2.50,   # Cấp II — nguy hiểm
    "bao_dong_3_m": 3.00,   # Cấp III — rất nguy hiểm
    "historic_max_m": 5.81,  # Lũ lịch sử 1999
    "flood_2020_m": 4.52,    # Lũ tháng 10/2020
}

# Mùa lũ Thừa Thiên Huế: tháng 9-12 (đỉnh tháng 10-11)
FLOOD_SEASON = {
    "start_month": 9,
    "end_month": 12,
    "peak_months": [10, 11],
    "typhoon_months": [9, 10, 11],
}

# Hệ số cấp độ rủi ro thiên tai dựa trên Q_forecast (P50)
RISK_LEVELS = {
    "ta_trach": {
        "low":      (0, 1000),    # m³/s — bình thường
        "moderate": (1000, 2500), # đề phòng
        "high":     (2500, 4000), # nguy hiểm
        "extreme":  (4000, None), # rất nguy hiểm
    },
    "binh_dien": {
        "low":      (0, 1200),
        "moderate": (1200, 3000),
        "high":     (3000, 4800),
        "extreme":  (4800, None),
    },
    "huong_dien": {
        "low":      (0, 2000),
        "moderate": (2000, 5000),
        "high":     (5000, 8000),
        "extreme":  (8000, None),
    },
}


def get_risk_level(basin_key: str, flow_m3s: float) -> str:
    levels = RISK_LEVELS.get(basin_key, {})
    for level, (lo, hi) in levels.items():
        if lo <= flow_m3s < (hi or float("inf")):
            return level
    return "unknown"


def is_flood_season(month: int) -> bool:
    return FLOOD_SEASON["start_month"] <= month <= FLOOD_SEASON["end_month"]
