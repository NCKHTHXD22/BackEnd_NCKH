# config/reservoirs.py
# Copy nguyên từ LSTM_Py_Backend/lstm_service/config/reservoirs.py — 16 hồ Quảng Nam/Đà Nẵng.
# "idx" giữ lại để tra cứu INFLOW_CAPS_M3S/RESERVOIR_TO_STATIONS (không dùng làm reservoir
# embedding nữa — LSTM_Py_Backend_v2 train 1 model độc lập cho từng "rid").

RESERVOIRS = {
    1: {"idx": 0, "name": "HO A VUONG", "lat": 15.815, "lon": 107.63, "river_basin": "Vu Gia"},
    2: {"idx": 1, "name": "HO DAK MI 4", "lat": 15.45285, "lon": 107.83250, "river_basin": "Vu Gia"},
    3: {"idx": 2, "name": "HO SONG BUNG 4", "lat": 15.726, "lon": 107.637, "river_basin": "Vu Gia"},
    4: {"idx": 3, "name": "HO SONG TRANH 2", "lat": 15.326, "lon": 108.125, "river_basin": "Thu Bồn"},
    7: {"idx": 4, "name": "HO SONG BUNG 4A", "lat": 15.765, "lon": 107.679, "river_basin": "Vu Gia"},
    8: {"idx": 5, "name": "HO SONG BUNG 5", "lat": 15.808, "lon": 107.7473, "river_basin": "Vu Gia"},
    9: {"idx": 6, "name": "HO SONG BUNG 2", "lat": 15.7145, "lon": 107.3970, "river_basin": "Vu Gia"},
    11: {"idx": 7, "name": "HO SONG BUNG 6", "lat": 15.82, "lon": 107.78, "river_basin": "Vu Gia"},
    12: {"idx": 8, "name": "HO SONG TRANH 3", "lat": 15.4445, "lon": 108.1430, "river_basin": "Thu Bồn"},
    13: {"idx": 9, "name": "HO ZA HUNG", "lat": 15.86005, "lon": 107.654, "river_basin": "Vu Gia"},
    14: {"idx": 10, "name": "HO DAK MI 3", "lat": 15.33, "lon": 107.81, "river_basin": "Vu Gia"},
    15: {"idx": 11, "name": "HO KHE DIEN", "lat": 15.71279, "lon": 107.92872, "river_basin": "Thu Bồn"},
    16: {"idx": 12, "name": "HO SONG CON 2", "lat": 15.90558, "lon": 107.8234, "river_basin": "Vu Gia"},
    17: {"idx": 13, "name": "HO SONG TRANH 4", "lat": 15.53666, "lon": 108.152, "river_basin": "Thu Bồn"},
    18: {"idx": 14, "name": "HO DAK MI 2", "lat": 15.23832, "lon": 107.8100, "river_basin": "Vu Gia"},
    19: {"idx": 15, "name": "HO DAK MI 4C", "lat": 15.4643, "lon": 107.92893, "river_basin": "Thu Bồn"},
}

VU_GIA_RIDS = [rid for rid, info in RESERVOIRS.items() if info["river_basin"] == "Vu Gia"]
THU_BON_RIDS = [rid for rid, info in RESERVOIRS.items() if info["river_basin"] == "Thu Bồn"]

# ── 1. PHÂN CHIA THEO 4 NHÁNH SÔNG (SUB-BASINS) ──────────────────────────────
# - Nhánh A Vương: A Vương (1), Za Hưng (13)
# - Nhánh Sông Bung: Sông Bung 2 (9), Sông Bung 4 (3), Sông Bung 4A (7), Sông Bung 5 (8), Sông Bung 6 (11)
# - Nhánh Đắk Mi: Đắk Mi 2 (18), Đắk Mi 3 (14), Đắk Mi 4 (2), Đắk Mi 4C (19)
# - Nhánh Sông Tranh: Sông Tranh 2 (4), Sông Tranh 3 (12), Sông Tranh 4 (17), Khe Diên (15)
RIVER_BRANCHES = {
    "A_VUONG": [1, 13],
    "SONG_BUNG": [9, 3, 7, 8, 11],
    "DAK_MI": [18, 14, 2, 19],
    "SONG_TRANH": [4, 12, 17, 15],  # Kèm Khe Diên theo yêu cầu kịch bản
}

# ── 2. BIẾN THỂ THỬ NGHIỆM CHO HỒ SÔNG CÔN 2 (RID=16) ──────────────────────
# Cho phép train thử nghiệm theo từng loại nhánh sông để đối sánh:
#   Variant A: Sông Côn 2 thuộc nhánh A Vương
#   Variant B: Sông Côn 2 thuộc nhánh Sông Bung
SONG_CON_2_VARIANTS = {
    "A_VUONG": [1, 13, 16],
    "SONG_BUNG": [9, 3, 7, 8, 11, 16],
}

# ── 3. PHÂN CHIA THEO LƯU VỰC SÔNG (MAIN BASINS) ─────────────────────────────
# Kịch bản thử nghiệm theo yêu cầu người dùng:
#   - Lưu vực Vu Gia (nhóm thử nghiệm): Nhánh Sông Tranh (Sông Tranh 2, 3, 4) + Hồ Khe Diên (4 hồ)
#   - Lưu vực Thu Bồn (nhóm thử nghiệm): Toàn bộ các hồ còn lại (12 hồ)
RIVER_BASINS_EXPERIMENT = {
    "Vu Gia": [4, 12, 17, 15],
    "Thu Bồn": [1, 13, 9, 3, 7, 8, 11, 18, 14, 2, 19, 16],
}

# Phân chia theo chuẩn thủy văn tự nhiên:
RIVER_BASINS_NATURAL = {
    "Vu Gia": [1, 2, 3, 7, 8, 9, 11, 13, 14, 16, 18],
    "Thu Bồn": [4, 12, 15, 17, 19],
}

RIVER_BASINS = RIVER_BASINS_EXPERIMENT  # Mặc định theo kịch bản bài toán

# ── 4. PHÂN CHIA THEO MÙA (SEASONAL SPLITTING) ──────────────────────────────
#   - Mùa khô: Tháng 1 đến tháng 8 (Jan - Aug)
#   - Mùa mưa / Mùa lũ: Tháng 9 đến tháng 12 (Sep - Dec)
SEASON_MONTHS = {
    "dry": [1, 2, 3, 4, 5, 6, 7, 8],
    "rainy": [9, 10, 11, 12],
    "all": list(range(1, 13)),
}

# Kich ban 4 (nguoi dung de xuat): cac ho ha luu nhanh Song Bung chiu anh
# huong truc tiep tu luu luong xa cua ho thuong nguon.
UPSTREAM_RESERVOIRS = {
    7:  [9, 3, 18],   # Song Bung 4A  <- Song Bung 2, Song Bung 4, Dak Mi 2
    8:  [9, 3, 18],   # Song Bung 5   <- Song Bung 2, Song Bung 4, Dak Mi 2
    11: [9, 3, 18],   # Song Bung 6   <- Song Bung 2, Song Bung 4, Dak Mi 2
}


def get_reservoirs_by_branch(branch_name: str) -> dict:
    """Trả về dict chứa các hồ thuộc nhánh sông chỉ định."""
    rids = RIVER_BRANCHES.get(branch_name.upper(), [])
    return {rid: RESERVOIRS[rid] for rid in rids if rid in RESERVOIRS}


def get_reservoirs_by_basin(basin_name: str, use_natural: bool = False) -> dict:
    """Trả về dict chứa các hồ thuộc lưu vực sông chỉ định."""
    basins = RIVER_BASINS_NATURAL if use_natural else RIVER_BASINS_EXPERIMENT
    rids = basins.get(basin_name, [])
    return {rid: RESERVOIRS[rid] for rid in rids if rid in RESERVOIRS}

