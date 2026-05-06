"""
Volume Calculator - Port from VolumeCalculator.cs
Bảng tra nội suy H (mực nước) ↔ V (dung tích) cho 4 hồ chính.
Source: VuGiaThuBonDSS/Model/VolumeCalculator.cs
"""
import numpy as np
from typing import Dict, List, Tuple

# === BẢNG TRA Z-W (Mực nước → Dung tích, triệu m³) ===
# Port chính xác từ VolumeCalculator.cs lines 10-128

ZW_TABLES: Dict[int, Tuple[np.ndarray, np.ndarray]] = {}

_ZW_RAW = {
    # HỒ 1: A VƯƠNG
    1: [
        (306.0, 0.0), (310, 0.66), (320, 11.96), (330, 38.9),
        (340, 77.07), (345, 100.13), (350, 126.01), (355, 154.73),
        (360, 186.29), (365, 220.9), (370, 258.72), (375, 299.63),
        (380, 343.55), (385, 390.64), (390, 441.01), (395, 494.62),
        (400, 551.39),
    ],
    # HỒ 2: ĐẮK MI 4
    2: [
        (175.0, 0.0), (180.0, 0.22), (185.0, 1.14), (190.0, 3.49),
        (195.0, 7.39), (200.0, 12.81), (205.0, 19.87), (210.0, 28.57),
        (215.0, 39.19), (220.0, 52.39), (225.0, 69.60), (230.0, 92.14),
        (235.0, 120.61), (240.0, 154.12), (245.0, 191.86), (250.0, 234.13),
        (255.0, 281.31), (260.0, 333.09), (265.0, 389.68), (270.0, 451.45),
    ],
    # HỒ 3: SÔNG BUNG 4
    3: [
        (125, 0.265), (130, 1.48), (135, 3.438), (140, 6.022),
        (145, 9.443), (150, 14.02), (155, 19.89), (160, 27.24),
        (165, 36.91), (170, 50.18), (175, 67.72), (180, 88.99),
        (185, 114.6), (190, 145.7), (195, 182.8), (200, 226.4),
        (205, 276.8), (210, 334.4), (215, 399.3), (220, 471.7),
        (225, 549.9), (230, 636.9), (235, 735.1), (240, 841.8),
        (245, 957.8), (250, 1084),
    ],
    # HỒ 4: SÔNG TRANH 2
    4: [
        (89.5, 0), (90, 0), (95, 1.02), (100, 4.8),
        (105, 12.26), (110, 24.99), (115, 43.21), (120, 66.08),
        (125, 93.64), (130, 126.38), (135, 164.45), (140, 207.97),
        (145, 257.34), (150, 313.96), (155, 379.04), (160, 452.5),
        (165, 534.81), (170, 626.83), (175, 729.14), (180, 842.05),
        (185, 966.1), (190, 1102.87), (195, 1252.48), (200, 1414.73),
    ],
}

# === BẢNG TRA Z-F (Mực nước → Diện tích mặt hồ, km²) ===
# Port từ VolumeCalculator.cs lines 133-183

_ZF_RAW = {
    1: [
        (306.0, 0.0), (310.0, 0.31), (320.0, 1.89), (330.0, 3.30),
        (340.0, 4.34), (345.0, 4.89), (350.0, 5.47), (355.0, 6.02),
        (360.0, 6.61), (365.0, 7.24), (370.0, 7.89), (375.0, 8.48),
        (380.0, 9.09), (385.0, 9.75), (390.0, 10.40), (395.0, 11.05),
        (400.0, 11.66),
    ],
    2: [
        (175.0, 0.0), (180.0, 0.09), (185.0, 0.28), (190.0, 0.66),
        (195.0, 0.91), (200.0, 1.26), (205.0, 1.56), (210.0, 1.92),
        (215.0, 2.33), (220.0, 2.95), (225.0, 3.93), (230.0, 5.08),
        (235.0, 6.31), (240.0, 7.10), (245.0, 8.00), (250.0, 8.91),
        (255.0, 9.97), (260.0, 10.80), (265.0, 11.84), (270.0, 12.87),
    ],
}

# Pre-process thành sorted numpy arrays
for rid, pairs in _ZW_RAW.items():
    h_arr = np.array([p[0] for p in pairs])
    v_arr = np.array([p[1] for p in pairs])
    ZW_TABLES[rid] = (h_arr, v_arr)

ZF_TABLES: Dict[int, Tuple[np.ndarray, np.ndarray]] = {}
for rid, pairs in _ZF_RAW.items():
    h_arr = np.array([p[0] for p in pairs])
    f_arr = np.array([p[1] for p in pairs])
    ZF_TABLES[rid] = (h_arr, f_arr)


def get_volume(reservoir_id: int, water_level: float) -> float:
    """Tính dung tích (triệu m³) từ mực nước (m). Nội suy tuyến tính."""
    if reservoir_id not in ZW_TABLES:
        return 0.0
    h_arr, v_arr = ZW_TABLES[reservoir_id]
    return float(np.interp(water_level, h_arr, v_arr))


def get_water_level(reservoir_id: int, volume: float) -> float:
    """Tính mực nước (m) từ dung tích (triệu m³). Nội suy ngược."""
    if reservoir_id not in ZW_TABLES:
        return 0.0
    h_arr, v_arr = ZW_TABLES[reservoir_id]
    # np.interp yêu cầu xp tăng dần → dùng v_arr làm xp, h_arr làm fp
    return float(np.interp(volume, v_arr, h_arr))


def get_surface_area(reservoir_id: int, water_level: float) -> float:
    """Tính diện tích mặt hồ (km²) từ mực nước (m)."""
    if reservoir_id not in ZF_TABLES:
        return 0.0
    h_arr, f_arr = ZF_TABLES[reservoir_id]
    return float(np.interp(water_level, h_arr, f_arr))
