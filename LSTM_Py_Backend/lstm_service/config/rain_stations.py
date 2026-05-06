# config/rain_stations.py
# Tọa độ các trạm đo mưa VNDMS — Vu Gia / Thu Bồn / Đà Nẵng
#
# available_from: năm bắt đầu có dữ liệu trong VNDMS (ảnh hưởng dataset_builder)
#   "2022" → có từ đầu bộ dữ liệu
#   "2025" → chỉ có từ khoảng tháng 9-11/2025 trở đi
#   "2025_01" → có từ tháng 1/2025 (nhưng có thể bị gián đoạn)
#
# Lưu ý: tọa độ được xác định theo địa lý hành chính xã/huyện.
# Dù trạm đo mưa chỉ có dữ liệu từ 2025, tọa độ vẫn dùng được
# cho Open-Meteo IDW inference (query NWP tại vị trí đó).

RAIN_STATIONS = {

    # ═══════════════════════════════════════════════════════════════════
    # NHÓM TÂY GIANG (thượng nguồn Sông Bung / A Vương)
    # ═══════════════════════════════════════════════════════════════════
    "XaPrao": {
        "lat": 15.938, "lon": 107.625,
        "available_from": "2022",
        "vndms_name_keywords": ["Xa Prao", "Dong Giang - Xa Prao", "Đông Giang - Xã Prao",
                                 "Quang Nam - Dong Giang - Xa Prao"],
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

    # Tây Giang — có dữ liệu từ 2025_09+
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

    # ═══════════════════════════════════════════════════════════════════
    # NHÓM ĐẠI LỘC (hạ lưu Vu Gia — Khê Diên / Sông Con 2)
    # ═══════════════════════════════════════════════════════════════════
    "DaiChanh": {
        "lat": 15.828, "lon": 108.055,
        "available_from": "2022",
        "vndms_name_keywords": ["Dai Chanh", "Đại Chánh"],
        "description": "Đại Chánh, Đại Lộc — lưu vực Khê Diên",
    },

    # ═══════════════════════════════════════════════════════════════════
    # NHÓM PHƯỚC SƠN (lưu vực Đắk Mi)
    # ═══════════════════════════════════════════════════════════════════
    "PhuocChanh": {
        "lat": 15.390, "lon": 107.920,
        "available_from": "2022",
        "vndms_name_keywords": ["Phuoc My", "Phước Sơn - Phước Mỹ",
                                  "Quang Nam - Phuoc Son - Phuoc My"],
        "description": "Phước Mỹ, Phước Sơn — trạm cốt lõi lưu vực Đắk Mi",
    },
    "PhuocNang": {
        "lat": 15.460, "lon": 107.810,
        "available_from": "2022",
        "vndms_name_keywords": ["Uy Ban Huyen", "Nam Tra My",
                                  "Quang Nam - Nam Tra My - Uy Ban Huyen"],
        "description": "Tắk Pố, Nam Trà My — trung tâm huyện Nam Trà My, đầu nguồn Đắk Mi",
    },

    # Phước Sơn — có dữ liệu từ 2025+
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

    # Đập thủy điện Đắk Mi — có dữ liệu từ 2025+
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

    # ═══════════════════════════════════════════════════════════════════
    # NHÓM SÔNG TRANH (Thu Bồn — Bắc Trà My / Nam Trà My / Nông Sơn)
    # ═══════════════════════════════════════════════════════════════════
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
                                  "Quang Nam - Tra Nam - TD Song Tranh 2"],
        "description": "Trà Nam / Trà Don, Nam Trà My — lòng hồ Sông Tranh 2",
    },

    # Nam Trà My — có dữ liệu từ 2025+
    "TraVan": {
        "lat": 15.315, "lon": 108.150,
        "available_from": "2025",
        "vndms_name_keywords": ["Trà Vân", "Tra Van"],
        "description": "Xã Trà Vân, Nam Trà My — lưu vực Sông Tranh 3/4",
    },
}

# ═══════════════════════════════════════════════════════════════════════
# Mapping: reservoir_id → danh sách trạm dùng để tính mưa IDW
#
# Thứ tự: ưu tiên trạm gần lưu vực nhất, trạm cốt lõi (2022+) đặt trước.
# Trạm chỉ có từ 2025 vẫn được liệt kê — dataset_builder xử lý NaN tự động,
# Open-Meteo IDW dùng tọa độ này bất kể năm nào.
# ═══════════════════════════════════════════════════════════════════════
RESERVOIR_TO_STATIONS = {

    # ─── Nhóm Sông Vu Gia ───────────────────────────────────────────

    # HO A VUONG (rid=1) — A Vương river, Đông Giang / Tây Giang
    1:  ["XaPrao", "KaDang", "BenGiang", "ATieng", "Chom", "TrHy"],

    # HO SONG BUNG 4 (rid=3) — Nam Giang, sông Bung đoạn giữa
    3:  ["BenGiang", "Zuoich", "ThanhMy", "TrHy", "DakPring2"],

    # HO SONG BUNG 4A (rid=7) — Nam Giang, sát Sông Bung 4
    7:  ["BenGiang", "Zuoich", "ThanhMy", "TrHy", "DakPring2"],

    # HO SONG BUNG 5 (rid=8) — Nam Giang / Đông Giang
    8:  ["BenGiang", "KaDang", "ThanhMy", "TrHy"],

    # HO SONG BUNG 2 (rid=9) — Tây Giang, thượng nguồn nhất
    9:  ["Zuoich", "XaPrao", "Chom", "ATieng", "TrHy"],

    # HO SONG BUNG 6 (rid=11) — Nam Giang / Đại Lộc, hạ lưu Sông Bung
    11: ["ThanhMy", "KaDang", "BenGiang", "TrHy"],

    # HO ZA HUNG (rid=13) — Đông Giang, nhánh A Vương
    13: ["XaPrao", "KaDang", "ATieng", "Chom"],

    # HO KHE DIEN (rid=15) — Đại Lộc, Khê Diên stream
    15: ["DaiChanh", "BenGiang", "ThanhMy"],

    # HO SONG CON 2 (rid=16) — Nam Giang / Đại Lộc
    16: ["BenGiang", "Zuoich", "ThanhMy", "TrHy"],

    # ─── Nhóm Sông Thu Bồn — Đắk Mi ────────────────────────────────

    # HO DAK MI 4 (rid=2) — Phước Sơn, lớn nhất nhóm Đắk Mi
    2:  ["PhuocChanh", "PhuocNang", "TraLeng",
          "PhuocNinh", "PhuocNang2", "DakMi4A", "DakMi4C"],

    # HO DAK MI 3 (rid=14) — Phước Sơn, thượng nguồn Đắk Mi 4
    14: ["PhuocChanh", "PhuocNang",
          "PhuocChanh2", "PhuocNinh", "PhuocHiep", "PhuocThanh"],

    # HO DAK MI 2 (rid=18) — Phước Sơn, thượng nguồn xa nhất
    18: ["PhuocChanh", "PhuocNang", "TraLeng",
          "PhuocNinh", "DakMi4A"],

    # HO DAK MI 4C (rid=19) — Phước Sơn, tái điều tiết hạ lưu Đắk Mi 4
    19: ["PhuocChanh", "PhuocNang",
          "PhuocChanh2", "PhuocNinh", "DakMi4C", "PhuocCong"],

    # ─── Nhóm Sông Thu Bồn — Sông Tranh ────────────────────────────

    # HO SONG TRANH 2 (rid=4) — Nam Trà My / Bắc Trà My
    4:  ["TraDon", "TraGiap", "TraKot", "TraLeng"],

    # HO SONG TRANH 3 (rid=12) — Bắc Trà My / Nông Sơn
    12: ["TraMy", "NongSon", "TraGiap", "TraVan"],

    # HO SONG TRANH 4 (rid=17) — Bắc Trà My
    17: ["TraKot", "TraMy", "TraGiap", "TraVan"],
}
