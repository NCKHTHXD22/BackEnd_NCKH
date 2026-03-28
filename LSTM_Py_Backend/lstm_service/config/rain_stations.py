# config/rain_stations.py
# Tọa độ các trạm đo mưa VNDMS ĐẠT CHUẨN 4 NĂM (2022-2025)
# Áp dụng cho thay đổi địa lý khắc phục lỗi rỗng dữ liệu của VNDMS

# Tọa độ trạm đo mưa (lat, lon) thiết lập gần đúng dựa trên xã/huyện
RAIN_STATIONS = {
    # Khu vực Vu Gia (Tây Giang, Đông Giang, Nam Giang, Đại Lộc)
    "XaPrao":      {"lat": 15.938, "lon": 107.625, "vndms_name_keywords": ["Xa Prao", "Dong Giang - Xa Prao", "Đông Giang - Xã Prao"]},
    "BenGiang":    {"lat": 15.753, "lon": 107.818, "vndms_name_keywords": ["Ben Giang"]},
    "Zuoich":      {"lat": 15.659, "lon": 107.575, "vndms_name_keywords": ["Zuoich", "Zuôich"]},
    "ThanhMy":     {"lat": 15.760, "lon": 107.822, "vndms_name_keywords": ["Thanh My", "Thành Mỹ"]},
    "KaDang":      {"lat": 15.892, "lon": 107.723, "vndms_name_keywords": ["Ka Dang", "Ka Dăng"]},
    "DaiChanh":    {"lat": 15.828, "lon": 108.055, "vndms_name_keywords": ["Dai Chanh", "Đại Chánh"]},
    
    # Khu vực vùng cao phía Tây Nam (Phước Sơn, Nam Trà My, Bắc Trà My)
    "TraLeng":     {"lat": 15.300, "lon": 108.010, "vndms_name_keywords": ["Tra Leng", "Trà Leng", "Tak Pat", "Tắk Pát"]},
    "TraKot":      {"lat": 15.385, "lon": 108.204, "vndms_name_keywords": ["Tra Kot", "Trà Kót"]},
    "TraMy":       {"lat": 15.345, "lon": 108.200, "vndms_name_keywords": ["Tra My", "Trà My"]},
    "NongSon":     {"lat": 15.655, "lon": 107.965, "vndms_name_keywords": ["Nong Son", "Nông Sơn"]},
    "TraGiap":     {"lat": 15.360, "lon": 108.030, "vndms_name_keywords": ["Tra Giap", "Trà Giáp"]},
    
    # 3 trạm cốt lõi có sẵn
    "PhuocNang":   {"lat": 15.460, "lon": 107.810, "vndms_name_keywords": ["Uy Ban Huyen", "Nam Tra My"]},
    "PhuocChanh":  {"lat": 15.390, "lon": 107.920, "vndms_name_keywords": ["Phuoc My", "Phước Sơn"]},
    "TraDon":      {"lat": 15.350, "lon": 108.070, "vndms_name_keywords": ["TD Song Tranh 2", "Tra Nam", "Trà Nam", "Trà Don"]},
}

# Mapping: reservoir_id → danh sách tên trạm liên quan tới lưu vực hồ
RESERVOIR_TO_STATIONS = {
    # ================= Nhóm Sông Vu Gia =================
    # HO A VUONG (rid=1)
    1:  ["XaPrao", "KaDang", "BenGiang"],
    # HO SONG BUNG 4 (rid=3)
    3:  ["BenGiang", "Zuoich", "ThanhMy"],
    # HO SONG BUNG 4A (rid=7)
    7:  ["BenGiang", "Zuoich", "ThanhMy"],
    # HO SONG BUNG 5 (rid=8)
    8:  ["BenGiang", "Zuoich", "ThanhMy"],
    # HO SONG BUNG 2 (rid=9)
    9:  ["Zuoich", "XaPrao"],
    # HO SONG BUNG 6 (rid=11)
    11: ["ThanhMy", "DaiChanh", "BenGiang"],
    # HO ZA HUNG (rid=13)
    13: ["XaPrao", "KaDang"],
    # HO KHE DIEN (rid=15)
    15: ["DaiChanh", "BenGiang", "ThanhMy"],
    # HO SONG CON 2 (rid=16)
    16: ["BenGiang", "Zuoich", "ThanhMy"],
    
    # ================= Nhóm Sông Thu Bồn (Đắk Mi) =================
    # HO DAK MI 4 (rid=2)
    2:  ["PhuocChanh", "PhuocNang", "TraLeng"],
    # HO DAK MI 3 (rid=14)
    14: ["PhuocChanh", "PhuocNang"],
    # HO DAK MI 2 (rid=18)
    18: ["PhuocChanh", "PhuocNang", "TraLeng"],
    # HO DAK MI 4C (rid=19)
    19: ["PhuocChanh", "PhuocNang"],
    
    # ================= Nhóm Sông Thu Bồn (Sông Tranh) =================
    # HO SONG TRANH 2 (rid=4)
    4:  ["TraDon", "TraGiap", "TraKot", "TraLeng"],
    # HO SONG TRANH 3 (rid=12)
    12: ["TraMy", "NongSon", "TraGiap"],
    # HO SONG TRANH 4 (rid=17)
    17: ["NongSon", "TraMy", "TraGiap"],
}
