"""
Thông số vật lý 4 hồ chính trên lưu vực Vu Gia - Thu Bồn.
Source: ReservoirConfig.cs + reservoirs.py
"""
from dataclasses import dataclass
from typing import Dict


@dataclass
class ReservoirParams:
    id: int
    name: str
    lat: float
    lon: float
    design_capacity: float      # Dung tích thiết kế (triệu m³)
    useful_capacity: float      # Dung tích hữu ích (triệu m³)
    dead_capacity: float        # Dung tích chết (triệu m³)
    MNDBT: float                # Mực nước dâng bình thường (m)
    MNC: float                  # Mực nước chết (m)
    dam_height: float           # Chiều cao đập (m)
    basin_area: float           # Diện tích lưu vực (km²)
    max_turbine_discharge: float  # Lưu lượng tối đa qua tua-bin (m³/s)
    num_turbines: int           # Số tổ máy


RESERVOIR_PARAMS: Dict[int, ReservoirParams] = {
    1: ReservoirParams(
        id=1, name="A Vương",
        lat=15.815, lon=107.63,
        design_capacity=343.55, useful_capacity=266.5, dead_capacity=77.07,
        MNDBT=380.0, MNC=340.0,
        dam_height=80, basin_area=682,
        max_turbine_discharge=76.0,   # 2 tổ máy × 38 m³/s
        num_turbines=2,
    ),
    2: ReservoirParams(
        id=2, name="Đắk Mi 4",
        lat=15.45285, lon=107.83250,
        design_capacity=312.38, useful_capacity=158.0, dead_capacity=154.12,
        MNDBT=258.0, MNC=240.0,
        dam_height=90, basin_area=1125,
        max_turbine_discharge=58.0,   # 2 tổ máy × 29 m³/s
        num_turbines=2,
    ),
    3: ReservoirParams(
        id=3, name="Sông Bung 4",
        lat=15.726, lon=107.637,
        design_capacity=510.8, useful_capacity=234.0, dead_capacity=276.8,
        MNDBT=222.5, MNC=205.0,
        dam_height=114, basin_area=1448,
        max_turbine_discharge=82.0,   # 2 tổ máy × 41 m³/s
        num_turbines=2,
    ),
    4: ReservoirParams(
        id=4, name="Sông Tranh 2",
        lat=15.326, lon=108.125,
        design_capacity=730.3, useful_capacity=521.1, dead_capacity=207.97,
        MNDBT=175.0, MNC=140.0,
        dam_height=96, basin_area=1100,
        max_turbine_discharge=100.0,  # 2 tổ máy × 50 m³/s
        num_turbines=2,
    ),
}


def get_params(reservoir_id: int) -> ReservoirParams:
    """Lấy thông số hồ theo ID. Raise KeyError nếu không tìm thấy."""
    return RESERVOIR_PARAMS[reservoir_id]
