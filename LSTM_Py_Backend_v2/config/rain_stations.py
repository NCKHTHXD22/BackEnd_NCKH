# config/rain_stations.py
# Copy nguyên từ LSTM_Py_Backend/lstm_service/config/rain_stations.py.
# Tọa độ các trạm đo mưa VNDMS — Vu Gia / Thu Bồn / Đà Nẵng.
#
# available_from: năm bắt đầu có dữ liệu trong VNDMS (ảnh hưởng dataset_builder)
#   "2022" → có từ đầu bộ dữ liệu
#   "2025" → chỉ có từ khoảng tháng 9-11/2025 trở đi
#   "2025_01" → có từ tháng 1/2025 (nhưng có thể bị gián đoạn)
#
# Không dùng trực tiếp bởi dataset_builder.py hiện tại (mưa đã được IDW sẵn trong
# Data_Tung_Ho_Ma_Tran_Rong/*.xlsx) — giữ lại cho tương lai nếu triển khai
# StationRainAttention với dữ liệu trạm riêng lẻ (xem models/station_attention.py).

RAIN_STATIONS = {
    "XaPrao": {
        "lat": 15.938, "lon": 107.625,
        "available_from": "2022",
        "vndms_name_keywords": ["Xa Prao", "Dong Giang - Xa Prao", "Đông Giang - Xã Prao",
                                 "Da Nang - Dong Giang - Xa Prao"],
        "description": "Xã Prao, Đông Giang — lưu vực A Vương / Zà Hung",
    },
    "KaDang": {
        "lat": 15.892, "lon": 107.723,
        "available_from": "2022",
        "vndms_name_keywords": ["Ka Dang", "Ka Dăng"],
        "description": "Ka Dăng, Đông Giang — lưu vực A Vương / Sông Bung 5-6",
    },
    "BenGiang": {
        "lat": 15.753, "lon": 107.818,
        "available_from": "2022",
        "vndms_name_keywords": ["Ben Giang"],
        "description": "Bến Giang, Đại Lộc — lưu vực hợp lưu Sông Bung / Vu Gia (mất từ 2025_06)",
    },
    "Zuoich": {
        "lat": 15.659, "lon": 107.575,
        "available_from": "2022",
        "vndms_name_keywords": ["Zuoich", "Zuôich"],
        "description": "Zuôich, Nam Giang — lưu vực Sông Bung 2/4",
    },
    "ThanhMy": {
        "lat": 15.760, "lon": 107.822,
        "available_from": "2022",
        "vndms_name_keywords": ["Thanh My", "Thành Mỹ"],
        "description": "Thành Mỹ, Nam Giang — lưu vực Sông Bung 4/5/6",
    },
    "Chom": {
        "lat": 16.073, "lon": 107.382,
        "available_from": "2025",
        "vndms_name_keywords": ["Ch'ơm", "Chom"],
        "description": "Ch'ơm, Tây Giang — thượng nguồn xa nhất sông Bung (giáp Lào)",
    },
    "ATieng": {
        "lat": 15.963, "lon": 107.550,
        "available_from": "2025",
        "vndms_name_keywords": ["A Tiêng", "A Tieng"],
        "description": "A Tiêng, Tây Giang — huyện lỵ Tây Giang, lưu vực A Vương / Sông Bung 2",
    },
    "TrHy": {
        "lat": 16.005, "lon": 107.498,
        "available_from": "2025_01",
        "vndms_name_keywords": ["Tr'Hy", "TrHy", "Thủy điện Tr'Hy"],
        "description": "Thủy điện Tr'Hy, Tây Giang — sông Bung thượng nguồn (gián đoạn 2025_03–10)",
    },
    "DakPring2": {
        "lat": 15.685, "lon": 107.488,
        "available_from": "2025",
        "vndms_name_keywords": ["Đắk Pring 2", "Dak Pring 2"],
        "description": "Đắk Pring 2, Nam Giang — sông Bung đoạn giữa",
    },
    "SongBac": {
        "lat": 15.812, "lon": 107.642,
        "available_from": "2025",
        "vndms_name_keywords": ["Sông Bắc", "Song Bac", "Trạm Kiểm lâm Sông Bắc"],
        "description": "Sông Bắc, Đông Giang — lưu vực A Vương hạ lưu",
    },
    "DaiChanh": {
        "lat": 15.828, "lon": 108.055,
        "available_from": "2022",
        "vndms_name_keywords": ["Dai Chanh", "Đại Chánh"],
        "description": "Đại Chánh, Đại Lộc — lưu vực Khê Diên",
    },
    "PhuocChanh": {
        "lat": 15.390, "lon": 107.920,
        "available_from": "2022",
        "vndms_name_keywords": ["Phuoc My", "Phước Sơn - Phước Mỹ",
                                  "Da Nang - Phuoc Son - Phuoc My"],
        "description": "Phước Mỹ, Phước Sơn — trạm cốt lõi lưu vực Đắk Mi",
    },
    "PhuocNang": {
        "lat": 15.460, "lon": 107.810,
        "available_from": "2022",
        "vndms_name_keywords": ["Uy Ban Huyen", "Nam Tra My",
                                  "Da Nang - Nam Tra My - Uy Ban Huyen"],
        "description": "Tắk Pố, Nam Trà My — trung tâm huyện Nam Trà My, đầu nguồn Đắk Mi",
    },
    "PhuocChanh2": {
        "lat": 15.400, "lon": 107.932,
        "available_from": "2025",
        "vndms_name_keywords": ["Phước Chánh"],
        "description": "Xã Phước Chánh, Phước Sơn — lưu vực Đắk Mi (khác với PhuocChanh/Phước Mỹ)",
    },
    "PhuocNinh": {
        "lat": 15.448, "lon": 107.897,
        "available_from": "2025",
        "vndms_name_keywords": ["Phước Ninh"],
        "description": "Xã Phước Ninh, Phước Sơn — lưu vực Đắk Mi thượng nguồn",
    },
    "PhuocCong": {
        "lat": 15.438, "lon": 107.968,
        "available_from": "2025",
        "vndms_name_keywords": ["Phước Công"],
        "description": "Xã Phước Công, Phước Sơn — lưu vực Đắk Mi phía Đông",
    },
    "PhuocHiep": {
        "lat": 15.355, "lon": 107.945,
        "available_from": "2025",
        "vndms_name_keywords": ["Phước Hiệp"],
        "description": "Xã Phước Hiệp, Phước Sơn — thượng nguồn Đắk Mi 4",
    },
    "PhuocThanh": {
        "lat": 15.378, "lon": 107.952,
        "available_from": "2025",
        "vndms_name_keywords": ["Phước Thành"],
        "description": "Xã Phước Thành, Phước Sơn — lưu vực Đắk Mi 3/4",
    },
    "PhuocNang2": {
        "lat": 15.462, "lon": 107.818,
        "available_from": "2025",
        "vndms_name_keywords": ["Phước Năng"],
        "description": "Xã Phước Năng, Nam Trà My — gần lưu vực Đắk Mi thượng nguồn",
    },
    "DakMi4A": {
        "lat": 15.480, "lon": 107.830,
        "available_from": "2025",
        "vndms_name_keywords": ["Đăk Mi 4A", "Dak Mi 4A", "Đập thủy điện Đăk Mi 4A"],
        "description": "Đập thủy điện Đắk Mi 4A, Phước Sơn — trên sông Đắk Mi",
    },
    "DakMi4C": {
        "lat": 15.548, "lon": 107.895,
        "available_from": "2025",
        "vndms_name_keywords": ["Đăk Mi 4C", "Dak Mi 4C", "Đập thủy điện Đăk Mi 4C"],
        "description": "Đập thủy điện Đắk Mi 4C, Phước Sơn — tái điều tiết hạ lưu",
    },
    "TraLeng": {
        "lat": 15.300, "lon": 108.010,
        "available_from": "2022",
        "vndms_name_keywords": ["Tra Leng", "Trà Leng", "Tak Pat", "Tắk Pát",
                                  "Khu TDC Tắk Pát"],
        "description": "Trà Leng / Tắk Pát, Nam Trà My — thượng nguồn Sông Tranh 2",
    },
    "TraKot": {
        "lat": 15.385, "lon": 108.204,
        "available_from": "2022",
        "vndms_name_keywords": ["Tra Kot", "Trà Kót"],
        "description": "Trà Kót, Bắc Trà My — lưu vực Sông Tranh 2/4",
    },
    "TraMy": {
        "lat": 15.345, "lon": 108.200,
        "available_from": "2022",
        "vndms_name_keywords": ["Tra My", "Trà My"],
        "description": "Trà My, Bắc Trà My — lưu vực Sông Tranh 3/4",
    },
    "NongSon": {
        "lat": 15.655, "lon": 107.965,
        "available_from": "2022",
        "vndms_name_keywords": ["Nong Son", "Nông Sơn"],
        "description": "Nông Sơn — hạ lưu Thu Bồn, lưu vực Sông Tranh 3",
    },
    "TraGiap": {
        "lat": 15.360, "lon": 108.030,
        "available_from": "2022",
        "vndms_name_keywords": ["Tra Giap", "Trà Giáp"],
        "description": "Trà Giáp, Nam Trà My — lưu vực Sông Tranh 2/3/4",
    },
    "TraDon": {
        "lat": 15.350, "lon": 108.070,
        "available_from": "2022",
        "vndms_name_keywords": ["TD Song Tranh 2", "Tra Nam", "Trà Nam", "Trà Don",
                                  "Da Nang - Tra Nam - TD Song Tranh 2"],
        "description": "Trà Nam / Trà Don, Nam Trà My — lòng hồ Sông Tranh 2",
    },
    "TraVan": {
        "lat": 15.315, "lon": 108.150,
        "available_from": "2025",
        "vndms_name_keywords": ["Trà Vân", "Tra Van"],
        "description": "Xã Trà Vân, Nam Trà My — lưu vực Sông Tranh 3/4",
    },
}

# ═══════════════════════════════════════════════════════════════════════
# Mapping: reservoir_id → danh sách trạm dùng để tính mưa IDW
# ═══════════════════════════════════════════════════════════════════════
RESERVOIR_TO_STATIONS = {
    1:  ["XaPrao", "KaDang", "BenGiang", "ATieng", "Chom", "TrHy"],
    3:  ["BenGiang", "Zuoich", "ThanhMy", "TrHy", "DakPring2"],
    7:  ["BenGiang", "Zuoich", "ThanhMy", "TrHy", "DakPring2"],
    8:  ["BenGiang", "KaDang", "ThanhMy", "TrHy"],
    9:  ["Zuoich", "XaPrao", "Chom", "ATieng", "TrHy"],
    11: ["ThanhMy", "KaDang", "BenGiang", "TrHy"],
    13: ["XaPrao", "KaDang", "ATieng", "Chom"],
    15: ["DaiChanh", "BenGiang", "ThanhMy"],
    16: ["BenGiang", "Zuoich", "ThanhMy", "TrHy"],
    2:  ["PhuocChanh", "PhuocNang", "TraLeng",
          "PhuocNinh", "PhuocNang2", "DakMi4A", "DakMi4C"],
    14: ["PhuocChanh", "PhuocNang",
          "PhuocChanh2", "PhuocNinh", "PhuocHiep", "PhuocThanh"],
    18: ["PhuocChanh", "PhuocNang", "TraLeng",
          "PhuocNinh", "DakMi4A"],
    19: ["PhuocChanh", "PhuocNang",
          "PhuocChanh2", "PhuocNinh", "DakMi4C", "PhuocCong"],
    4:  ["TraDon", "TraGiap", "TraKot", "TraLeng"],
    12: ["TraMy", "NongSon", "TraGiap", "TraVan"],
    17: ["TraKot", "TraMy", "TraGiap", "TraVan"],
}
