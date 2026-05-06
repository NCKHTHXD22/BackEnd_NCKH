"""
QĐ 1865/QĐ-TTg - Quy trình vận hành liên hồ chứa lưu vực sông Vu Gia - Thu Bồn.
Port from VuGiaThuBonDSS/Model/QD1865Config.cs (214 lines)
"""
from dataclasses import dataclass
from datetime import datetime
from typing import List, Dict, Optional


@dataclass
class OperationPeriod:
    start_month: int
    start_day: int
    end_month: int
    end_day: int
    max_water_level: float  # m
    min_water_level: float  # m
    description: str


@dataclass
class QD1865Rule:
    reservoir_id: int
    reservoir_name: str
    periods: List[OperationPeriod]


# ============================================================
# QĐ 1865 RULES - Port chính xác từ QD1865Config.cs lines 42-141
# ============================================================

def _build_rules() -> List[QD1865Rule]:
    rules = []

    # --- 1. A VƯƠNG (ID = 1) ---
    a_vuong = QD1865Rule(1, "A Vương", [
        OperationPeriod(9, 1, 11, 15, 376.0, 370.0, "Mùa lũ"),
        OperationPeriod(11, 16, 12, 15, 380.0, 377.0, "Cuối mùa lũ"),
        OperationPeriod(12, 16, 2, 10, 378.3, 375.5, "Mùa cạn"),
        OperationPeriod(2, 11, 2, 20, 378.1, 375.2, "Mùa cạn"),
        OperationPeriod(2, 21, 2, 29, 377.6, 374.5, "Mùa cạn"),
        OperationPeriod(3, 1, 3, 10, 377.0, 373.7, "Mùa cạn"),
        OperationPeriod(3, 11, 3, 20, 376.0, 372.9, "Mùa cạn"),
        OperationPeriod(3, 21, 3, 31, 374.6, 371.9, "Mùa cạn"),
        OperationPeriod(4, 1, 4, 10, 373.4, 370.8, "Mùa cạn"),
        OperationPeriod(4, 11, 4, 20, 372.2, 369.4, "Mùa cạn"),
        OperationPeriod(4, 21, 4, 30, 371.3, 368.5, "Mùa cạn"),
        OperationPeriod(5, 1, 5, 10, 370.6, 367.4, "Mùa cạn"),
        OperationPeriod(5, 11, 5, 20, 369.5, 366.3, "Mùa cạn"),
        OperationPeriod(5, 21, 5, 31, 366.8, 364.1, "Mùa cạn"),
        OperationPeriod(6, 1, 6, 10, 363.7, 361.5, "Mùa cạn"),
        OperationPeriod(6, 11, 6, 20, 360.8, 358.5, "Mùa cạn"),
        OperationPeriod(6, 21, 6, 30, 359.2, 356.3, "Mùa cạn"),
        OperationPeriod(7, 1, 7, 10, 357.1, 354.8, "Mùa cạn"),
        OperationPeriod(7, 11, 7, 20, 354.9, 352.8, "Mùa cạn"),
        OperationPeriod(7, 21, 7, 31, 353.0, 351.3, "Mùa cạn"),
        OperationPeriod(8, 1, 8, 10, 350.7, 348.9, "Mùa cạn"),
        OperationPeriod(8, 11, 8, 20, 348.0, 346.1, "Mùa cạn"),
        OperationPeriod(8, 21, 8, 31, 345.4, 343.3, "Mùa cạn"),
    ])
    rules.append(a_vuong)

    # --- 2. ĐẮK MI 4 (ID = 2) ---
    dak_mi_4 = QD1865Rule(2, "Đắk Mi 4", [
        OperationPeriod(9, 1, 11, 15, 255.0, 251.5, "Mùa lũ"),
        OperationPeriod(11, 16, 12, 15, 258.0, 256.0, "Cuối mùa lũ"),
        OperationPeriod(12, 16, 2, 29, 256.4, 254.7, "Mùa cạn"),
        OperationPeriod(3, 1, 3, 20, 256.4, 254.7, "Mùa cạn"),
        OperationPeriod(3, 21, 3, 31, 256.2, 254.6, "Mùa cạn"),
        OperationPeriod(4, 1, 4, 10, 255.9, 254.3, "Mùa cạn"),
        OperationPeriod(4, 11, 4, 20, 255.5, 253.9, "Mùa cạn"),
        OperationPeriod(4, 21, 4, 30, 255.1, 253.6, "Mùa cạn"),
        OperationPeriod(5, 1, 5, 10, 254.8, 253.3, "Mùa cạn"),
        OperationPeriod(5, 11, 5, 20, 254.6, 253.1, "Mùa cạn"),
        OperationPeriod(5, 21, 5, 31, 253.8, 252.5, "Mùa cạn"),
        OperationPeriod(6, 1, 6, 10, 252.7, 251.5, "Mùa cạn"),
        OperationPeriod(6, 11, 6, 20, 251.4, 250.1, "Mùa cạn"),
        OperationPeriod(6, 21, 6, 30, 250.0, 248.6, "Mùa cạn"),
        OperationPeriod(7, 1, 7, 10, 248.9, 247.5, "Mùa cạn"),
        OperationPeriod(7, 11, 7, 20, 247.9, 246.5, "Mùa cạn"),
        OperationPeriod(7, 21, 7, 31, 246.7, 245.3, "Mùa cạn"),
        OperationPeriod(8, 1, 8, 10, 245.4, 243.8, "Mùa cạn"),
        OperationPeriod(8, 11, 8, 20, 244.0, 242.4, "Mùa cạn"),
        OperationPeriod(8, 21, 8, 31, 242.5, 240.5, "Mùa cạn"),
    ])
    rules.append(dak_mi_4)

    # --- 3. SÔNG BUNG 4 (ID = 3) ---
    song_bung_4 = QD1865Rule(3, "Sông Bung 4", [
        OperationPeriod(9, 1, 11, 15, 217.0, 216.0, "Mùa lũ"),
        OperationPeriod(11, 16, 12, 15, 222.5, 218.5, "Cuối mùa lũ"),
        OperationPeriod(12, 16, 2, 29, 219.6, 218.0, "Mùa cạn"),
        OperationPeriod(3, 1, 3, 10, 219.4, 217.8, "Mùa cạn"),
        OperationPeriod(3, 11, 3, 20, 219.2, 217.6, "Mùa cạn"),
        OperationPeriod(3, 21, 3, 31, 218.9, 217.4, "Mùa cạn"),
        OperationPeriod(4, 1, 4, 10, 218.6, 217.0, "Mùa cạn"),
        OperationPeriod(4, 11, 4, 20, 218.2, 216.6, "Mùa cạn"),
        OperationPeriod(4, 21, 4, 30, 217.9, 216.3, "Mùa cạn"),
        OperationPeriod(5, 1, 5, 10, 217.6, 216.1, "Mùa cạn"),
        OperationPeriod(5, 11, 5, 20, 217.1, 215.7, "Mùa cạn"),
        OperationPeriod(5, 21, 5, 31, 216.1, 214.7, "Mùa cạn"),
        OperationPeriod(6, 1, 6, 10, 215.2, 213.5, "Mùa cạn"),
        OperationPeriod(6, 11, 6, 20, 214.1, 212.5, "Mùa cạn"),
        OperationPeriod(6, 21, 6, 30, 212.8, 211.3, "Mùa cạn"),
        OperationPeriod(7, 1, 7, 10, 212.0, 210.8, "Mùa cạn"),
        OperationPeriod(7, 11, 7, 20, 211.2, 210.1, "Mùa cạn"),
        OperationPeriod(7, 21, 7, 31, 210.4, 209.2, "Mùa cạn"),
        OperationPeriod(8, 1, 8, 10, 209.8, 208.6, "Mùa cạn"),
        OperationPeriod(8, 11, 8, 20, 208.7, 207.5, "Mùa cạn"),
        OperationPeriod(8, 21, 8, 31, 207.5, 206.3, "Mùa cạn"),
    ])
    rules.append(song_bung_4)

    # --- 4. SÔNG TRANH 2 (ID = 4) ---
    song_tranh_2 = QD1865Rule(4, "Sông Tranh 2", [
        OperationPeriod(9, 1, 11, 15, 172.0, 165.0, "Mùa lũ"),
        OperationPeriod(11, 16, 12, 15, 175.0, 173.0, "Cuối mùa lũ"),
        OperationPeriod(12, 16, 2, 10, 173.5, 171.4, "Mùa cạn"),
        OperationPeriod(2, 11, 2, 20, 173.4, 171.3, "Mùa cạn"),
        OperationPeriod(2, 21, 2, 29, 173.3, 171.2, "Mùa cạn"),
        OperationPeriod(3, 1, 3, 10, 172.9, 170.8, "Mùa cạn"),
        OperationPeriod(3, 11, 3, 20, 172.3, 170.3, "Mùa cạn"),
        OperationPeriod(3, 21, 3, 31, 171.6, 169.5, "Mùa cạn"),
        OperationPeriod(4, 1, 4, 10, 171.3, 169.1, "Mùa cạn"),
        OperationPeriod(4, 11, 4, 20, 170.5, 168.3, "Mùa cạn"),
        OperationPeriod(4, 21, 4, 30, 169.8, 167.6, "Mùa cạn"),
        OperationPeriod(5, 1, 5, 10, 169.0, 167.0, "Mùa cạn"),
        OperationPeriod(5, 11, 5, 20, 168.1, 166.3, "Mùa cạn"),
        OperationPeriod(5, 21, 5, 31, 164.9, 163.1, "Mùa cạn"),
        OperationPeriod(6, 1, 6, 10, 161.2, 159.6, "Mùa cạn"),
        OperationPeriod(6, 11, 6, 20, 157.4, 156.3, "Mùa cạn"),
        OperationPeriod(6, 21, 6, 30, 155.9, 154.8, "Mùa cạn"),
        OperationPeriod(7, 1, 7, 10, 154.1, 152.9, "Mùa cạn"),
        OperationPeriod(7, 11, 7, 20, 152.3, 151.1, "Mùa cạn"),
        OperationPeriod(7, 21, 7, 31, 150.7, 149.5, "Mùa cạn"),
        OperationPeriod(8, 1, 8, 10, 148.8, 147.5, "Mùa cạn"),
        OperationPeriod(8, 11, 8, 20, 147.0, 145.7, "Mùa cạn"),
        OperationPeriod(8, 21, 8, 31, 145.1, 143.2, "Mùa cạn"),
    ])
    rules.append(song_tranh_2)

    return rules


RULES: List[QD1865Rule] = _build_rules()
_RULES_MAP: Dict[int, QD1865Rule] = {r.reservoir_id: r for r in RULES}

# ============================================================
# Fallback MNDBT / MNC (từ ReservoirConfig.cs)
# ============================================================
_FALLBACK_MNDBT = {1: 380.0, 2: 258.0, 3: 222.5, 4: 175.0}
_FALLBACK_MNC = {1: 340.0, 2: 240.0, 3: 205.0, 4: 140.0}


def _in_period(period: OperationPeriod, month: int, day: int) -> bool:
    """
    Kiểm tra ngày (month, day) có nằm trong period không.
    Port chính xác logic từ QD1865Config.cs lines 155-176.
    Xử lý 3 trường hợp: startMonth < endMonth, ==, > (vòng năm).
    """
    sm, sd = period.start_month, period.start_day
    em, ed = period.end_month, period.end_day

    if sm < em:
        if sm < month < em:
            return True
        if month == sm and day >= sd:
            return True
        if month == em and day <= ed:
            return True
    elif sm == em:
        if month == sm and sd <= day <= ed:
            return True
    else:  # Vòng năm (vd: 12/16 → 2/10)
        if month > sm or month < em:
            return True
        if month == sm and day >= sd:
            return True
        if month == em and day <= ed:
            return True
    return False


def get_max_allowed_level(reservoir_id: int, dt: datetime) -> float:
    """Trả về mực nước cao nhất cho phép (m) theo QĐ 1865 tại thời điểm dt."""
    rule = _RULES_MAP.get(reservoir_id)
    if rule is None:
        return _FALLBACK_MNDBT.get(reservoir_id, float("inf"))

    month, day = dt.month, dt.day
    for period in rule.periods:
        if _in_period(period, month, day):
            return period.max_water_level

    return _FALLBACK_MNDBT.get(reservoir_id, float("inf"))


def get_min_allowed_level(reservoir_id: int, dt: datetime) -> float:
    """Trả về mực nước thấp nhất cho phép (m) theo QĐ 1865 tại thời điểm dt."""
    rule = _RULES_MAP.get(reservoir_id)
    if rule is None:
        return _FALLBACK_MNC.get(reservoir_id, 0.0)

    month, day = dt.month, dt.day
    for period in rule.periods:
        if _in_period(period, month, day):
            return period.min_water_level

    return _FALLBACK_MNC.get(reservoir_id, 0.0)


# ============================================================
# CONSTANTS BỔ SUNG TỪ QĐ 1865 (Điều 7, 8, 13)
# ============================================================

# Điều 7.2a: Ngưỡng lưu lượng kích hoạt chế độ giảm lũ (m³/s)
FLOOD_THRESHOLDS: Dict[int, float] = {
    1: 450.0,   # A Vương
    2: 550.0,   # Đắk Mi 4
    3: 550.0,   # Sông Bung 4
    4: 900.0,   # Sông Tranh 2
}

# Điều 13: Lưu lượng xả tối thiểu (m³/s) - chế độ bình thường mùa lũ
MIN_DISCHARGE: Dict[int, float] = {
    1: 15.0,    # A Vương
    2: 3.0,     # Đắk Mi 4 (liên tục về hạ du sông Vu Gia)
    3: 25.0,    # Sông Bung 4
    4: 27.0,    # Sông Tranh 2
}

# Điều 8: Ngưỡng chuyển chế độ vận hành (m³/s)
# maintain = (min, max) lưu lượng khi duy trì mực nước
# cut_flood = ngưỡng bắt đầu cắt giảm lũ
FLOOD_MODE_THRESHOLDS: Dict[int, dict] = {
    1: {"maintain_min": 450, "maintain_max": 600, "cut_flood": 600},
    2: {"maintain_min": 550, "maintain_max": 700, "cut_flood": 700},
    3: {"maintain_min": 550, "maintain_max": 700, "cut_flood": 700},
    4: {"maintain_min": 900, "maintain_max": 1500, "cut_flood": 1500},
}

# Bảng 1: Mực nước cao nhất trước lũ (m) - subset cho tra nhanh
PRE_FLOOD_MAX_LEVELS: Dict[int, dict] = {
    1: {"early": 376.0, "late": 380.0},  # 01/9-15/11, 16/11-15/12
    2: {"early": 255.0, "late": 258.0},
    3: {"early": 217.0, "late": 222.5},
    4: {"early": 172.0, "late": 175.0},
}

# Bảng 2: Mực nước đón lũ thấp nhất (m)
FLOOD_RECEPTION_MIN_LEVELS: Dict[int, dict] = {
    1: {"early": 370.0, "late": 377.0},
    2: {"early": 251.5, "late": 256.0},
    3: {"early": 216.0, "late": 218.5},
    4: {"early": 165.0, "late": 173.0},
}
