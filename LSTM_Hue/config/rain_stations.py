"""
Mạng lưới trạm đo mưa Thừa Thiên Huế.

Dữ liệu từ: VNDMS (Hệ thống quản lý dữ liệu quốc gia về tài nguyên nước)
và Đài Khí tượng Thuỷ văn khu vực Trung Trung Bộ.

Tọa độ từ cơ sở dữ liệu trạm KTTV Việt Nam.
"""

RAIN_STATIONS = {
    "a_luoi": {
        "id": "a_luoi",
        "name": "A Lưới",
        "lat": 16.237,
        "lon": 107.257,
        "elevation_m": 560,
        "data_since": 2000,
        "basin": "Sông Hương thượng lưu",
    },
    "nam_dong": {
        "id": "nam_dong",
        "name": "Nam Đông",
        "lat": 16.130,
        "lon": 107.740,
        "elevation_m": 320,
        "data_since": 2000,
        "basin": "Sông Tả Trạch",
    },
    "thuong_nhat": {
        "id": "thuong_nhat",
        "name": "Thượng Nhật",
        "lat": 16.062,
        "lon": 107.880,
        "elevation_m": 410,
        "data_since": 2005,
        "basin": "Sông Tả Trạch thượng lưu",
    },
    "binh_dien_st": {
        "id": "binh_dien_st",
        "name": "Bình Điền",
        "lat": 16.355,
        "lon": 107.558,
        "elevation_m": 180,
        "data_since": 2009,
        "basin": "Sông Hữu Trạch",
    },
    "phu_oc": {
        "id": "phu_oc",
        "name": "Phú Ốc",
        "lat": 16.383,
        "lon": 107.430,
        "elevation_m": 85,
        "data_since": 2003,
        "basin": "Sông Hữu Trạch hạ lưu",
    },
    "a_co": {
        "id": "a_co",
        "name": "A Co",
        "lat": 16.432,
        "lon": 107.302,
        "elevation_m": 480,
        "data_since": 2007,
        "basin": "Sông Bồ thượng lưu",
    },
    "ta_lu": {
        "id": "ta_lu",
        "name": "Tà Lu",
        "lat": 16.270,
        "lon": 107.383,
        "elevation_m": 290,
        "data_since": 2010,
        "basin": "Sông Bồ",
    },
    "loc_dien": {
        "id": "loc_dien",
        "name": "Lộc Điền",
        "lat": 16.447,
        "lon": 107.478,
        "elevation_m": 35,
        "data_since": 2004,
        "basin": "Sông Bồ trung lưu",
    },
    "phong_dien": {
        "id": "phong_dien",
        "name": "Phong Điền",
        "lat": 16.632,
        "lon": 107.598,
        "elevation_m": 10,
        "data_since": 2000,
        "basin": "Sông Ô Lâu",
    },
    "hue_city": {
        "id": "hue_city",
        "name": "Huế (Kim Long)",
        "lat": 16.472,
        "lon": 107.602,
        "elevation_m": 8,
        "data_since": 1980,
        "basin": "Đồng bằng Hương Giang",
    },
    "phu_loc": {
        "id": "phu_loc",
        "name": "Phú Lộc",
        "lat": 16.235,
        "lon": 107.892,
        "elevation_m": 15,
        "data_since": 2002,
        "basin": "Đông Trường Sơn",
    },
}

ALL_STATION_IDS = list(RAIN_STATIONS.keys())
