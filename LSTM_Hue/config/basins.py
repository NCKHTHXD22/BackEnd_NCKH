"""
Thông số 3 hồ chứa Thừa Thiên Huế.

Nguồn: Quy trình vận hành liên hồ chứa lưu vực sông Hương (QĐ 1401/QĐ-TTg 2019)
và thông số thiết kế công trình.

Basin ID mapping (theo Google Flood Forecasting: basin_id → integer index):
  0 → Tả Trạch   (Ta Trach)
  1 → Bình Điền  (Binh Dien)
  2 → Hương Điền (Huong Dien)
"""

# Basin configurations
BASINS = {
    "ta_trach": {
        "id": 0,
        "name": "Hồ Tả Trạch",
        "name_en": "Ta Trach Reservoir",
        "river": "Sông Tả Trạch (nhánh phải sông Hương)",
        "province": "Thừa Thiên Huế",

        # Vị trí địa lý
        "lat": 16.183,
        "lon": 107.728,

        # Thông số lưu vực (catchment)
        "catchment_area_km2": 717.0,
        "mean_elevation_m": 680.0,
        "mean_slope_pct": 28.5,
        "forest_cover_pct": 78.0,    # rừng nguyên sinh + phục hồi

        # Thông số hồ chứa
        "total_capacity_Mm3": 646.0,         # triệu m³
        "flood_control_capacity_Mm3": 269.0,  # dung tích phòng lũ
        "dead_storage_Mm3": 57.0,
        "dead_level_m": 45.0,
        "normal_level_m": 54.0,              # MNDBT
        "flood_limit_level_m": 52.0,         # mực nước lũ kiểm tra (mùa lũ)
        "design_flood_m3s": 4500.0,          # lũ thiết kế
        "max_outflow_m3s": 4000.0,           # xả lớn nhất
        "spillway_crest_m": 42.0,

        # IDW rain stations (theo thứ tự ưu tiên khoảng cách)
        "rain_station_ids": ["nam_dong", "thuong_nhat", "a_luoi", "phu_loc", "hue_city"],
    },

    "binh_dien": {
        "id": 1,
        "name": "Hồ Bình Điền",
        "name_en": "Binh Dien Reservoir",
        "river": "Sông Hữu Trạch (nhánh trái sông Hương)",
        "province": "Thừa Thiên Huế",

        "lat": 16.363,
        "lon": 107.548,

        "catchment_area_km2": 1025.0,
        "mean_elevation_m": 750.0,
        "mean_slope_pct": 31.2,
        "forest_cover_pct": 82.0,

        "total_capacity_Mm3": 423.0,
        "flood_control_capacity_Mm3": 152.0,
        "dead_storage_Mm3": 30.0,
        "dead_level_m": 60.0,
        "normal_level_m": 72.0,
        "flood_limit_level_m": 70.0,
        "design_flood_m3s": 5200.0,
        "max_outflow_m3s": 3500.0,
        "hydropower_mw": 23.0,
        "spillway_crest_m": 58.0,

        "rain_station_ids": ["a_luoi", "binh_dien_st", "phu_oc", "hue_city", "ta_lu"],
    },

    "huong_dien": {
        "id": 2,
        "name": "Hồ Hương Điền",
        "name_en": "Huong Dien Reservoir",
        "river": "Sông Bồ (độc lập, đổ vào phá Tam Giang)",
        "province": "Thừa Thiên Huế",

        "lat": 16.458,
        "lon": 107.362,

        "catchment_area_km2": 739.0,
        "mean_elevation_m": 620.0,
        "mean_slope_pct": 27.8,
        "forest_cover_pct": 74.0,

        "total_capacity_Mm3": 790.0,
        "flood_control_capacity_Mm3": 310.0,
        "dead_storage_Mm3": 80.0,
        "dead_level_m": 41.0,
        "normal_level_m": 58.0,
        "flood_limit_level_m": 56.0,
        "design_flood_m3s": 9000.0,
        "max_outflow_m3s": 6000.0,
        "hydropower_mw": 81.0,
        "spillway_crest_m": 46.5,

        "rain_station_ids": ["a_luoi", "a_co", "phong_dien", "loc_dien", "ta_lu"],
    },
}

# Lookup helpers
BASIN_ID_TO_KEY = {info["id"]: key for key, info in BASINS.items()}
BASIN_KEY_TO_ID = {key: info["id"] for key, info in BASINS.items()}
N_BASINS = len(BASINS)


def get_basin(basin_key_or_id) -> dict:
    if isinstance(basin_key_or_id, int):
        return BASINS[BASIN_ID_TO_KEY[basin_key_or_id]]
    return BASINS[basin_key_or_id]


def basin_static_vector(basin_key: str) -> list:
    """
    Trả về vector đặc trưng tĩnh của lưu vực — dùng để khởi tạo basin embedding.
    Chuẩn hóa về [0, 1] so với max của 3 hồ.
    Tham khảo: Google dùng 100+ static attributes từ Caravan dataset.
    """
    b = BASINS[basin_key]
    return [
        b["catchment_area_km2"]   / 1025.0,   # normalize by max
        b["mean_elevation_m"]     / 750.0,
        b["mean_slope_pct"]       / 35.0,
        b["forest_cover_pct"]     / 100.0,
        b["total_capacity_Mm3"]   / 790.0,
        b["flood_control_capacity_Mm3"] / 310.0,
        b["dead_level_m"]         / 70.0,
        b["normal_level_m"]       / 75.0,
        b["design_flood_m3s"]     / 9000.0,
    ]
