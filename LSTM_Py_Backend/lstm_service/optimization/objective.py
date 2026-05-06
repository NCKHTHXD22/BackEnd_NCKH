"""
Objective function for SCE-UA optimization.
Kết hợp mô phỏng cân bằng nước + penalty cho vi phạm QĐ 1865.
Reference: Okamoto et al. (2023) - adapted for Vu Gia - Thu Bon basin.
"""
import numpy as np
from datetime import datetime
from typing import List, Optional

from .reservoir_model import simulate_reservoir, okamoto_discharge_policy
from .volume_calculator import get_volume
from .qd1865 import (
    get_max_allowed_level,
    get_min_allowed_level,
    MIN_DISCHARGE,
    FLOOD_THRESHOLDS,
)
from .reservoir_params import get_params


# Trọng số penalty mặc định
DEFAULT_WEIGHTS = {
    "w_upper_level": 1000.0,    # Vi phạm mực nước tối đa (Bảng 1)
    "w_lower_level": 1000.0,    # Vi phạm mực nước tối thiểu (Bảng 2)
    "w_min_discharge": 500.0,   # Vi phạm lưu lượng xả tối thiểu (Điều 13)
    "w_downstream": 2000.0,     # Mực nước hạ du vượt BĐ III
    "w_energy_loss": 10.0,      # Tổn thất năng lượng (nước xả không qua tua-bin)
    "w_end_storage": 50.0,      # Thưởng cho dung tích cuối cao (hồ đầy sau lũ)
}


def compute_objective(
    params: np.ndarray,
    reservoir_id: int,
    initial_volume: float,
    inflow_series: np.ndarray,
    start_time: datetime,
    dt_seconds: float = 3600.0,
    downstream_limit: Optional[float] = None,
    weights: Optional[dict] = None,
) -> float:
    """
    Hàm mục tiêu cho SCE-UA: minimize max(Qout) + penalties.

    Decision variables (params):
        params[0] = q_start: Ngưỡng lưu lượng bắt đầu kiểm soát lũ (m³/s)
        params[1] = q_max_power: Lưu lượng xả tối đa khi pre-release (m³/s)

    Args:
        reservoir_id: ID hồ (1-4)
        initial_volume: Dung tích ban đầu (triệu m³)
        inflow_series: Chuỗi Qin dự báo (m³/s), shape (T,)
        start_time: Thời điểm bắt đầu
        dt_seconds: Bước thời gian (giây)
        downstream_limit: Giới hạn lưu lượng hạ du (m³/s), None = không xét
        weights: Trọng số penalty (override DEFAULT_WEIGHTS)

    Returns:
        Giá trị hàm mục tiêu (càng nhỏ càng tốt)
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}

    q_start = params[0]
    q_max_power = params[1]

    rp = get_params(reservoir_id)

    # Tạo discharge policy theo Okamoto
    policy = okamoto_discharge_policy(q_start, q_max_power, reservoir_id)

    # Chạy mô phỏng
    result = simulate_reservoir(
        reservoir_id=reservoir_id,
        initial_volume=initial_volume,
        inflow_series=inflow_series,
        discharge_policy=policy,
        start_time=start_time,
        dt_seconds=dt_seconds,
    )

    # === MỤC TIÊU 1: minimize max outflow → không lụt hạ du ===
    f_flood = result.max_outflow

    # === MỤC TIÊU 2: maximize dung tích cuối → hồ đầy cho mùa khô ===
    # Dung tích mục tiêu = MNDBT (mực nước dâng bình thường)
    V_target = get_volume(reservoir_id, rp.MNDBT)
    V_end = result.volumes[-1] if len(result.volumes) > 0 else initial_volume
    # Phạt khi hồ KHÔNG đầy: càng xa MNDBT càng phạt nặng
    storage_deficit = max(V_target - V_end, 0.0)
    f_storage = w["w_end_storage"] * storage_deficit

    # === Penalties từ constraint violations ===
    penalty = 0.0

    for v in result.constraint_violations:
        if v.violation_type == "upper_level":
            penalty += w["w_upper_level"] * (v.severity ** 2)
        elif v.violation_type == "lower_level":
            penalty += w["w_lower_level"] * (v.severity ** 2)
        elif v.violation_type == "min_discharge":
            penalty += w["w_min_discharge"] * (v.severity ** 2)

    # Penalty cho mực nước hạ du (nếu có thông tin)
    if downstream_limit is not None:
        q_exceed = np.maximum(result.outflows - downstream_limit, 0.0)
        penalty += w["w_downstream"] * np.sum(q_exceed ** 2) / len(result.outflows)

    # Penalty cho tổn thất năng lượng
    penalty += w["w_energy_loss"] * result.energy_loss

    return f_flood + f_storage + penalty


def create_objective_for_ensemble(
    reservoir_id: int,
    initial_volume: float,
    ensemble_inflows: List[np.ndarray],
    start_time: datetime,
    dt_seconds: float = 3600.0,
    downstream_limit: Optional[float] = None,
    weights: Optional[dict] = None,
):
    """
    Tạo hàm mục tiêu tổng hợp cho ensemble forecast (P10/P50/P90).
    Theo Okamoto (2023): minimize max over ensemble members.

    Args:
        ensemble_inflows: List các chuỗi Qin dự báo [P10, P50, P90]

    Returns:
        Callable phù hợp cho sceua_optimize(objective_fn=...)
    """
    def objective_fn(params: np.ndarray) -> float:
        objectives = []
        for inflow in ensemble_inflows:
            obj = compute_objective(
                params=params,
                reservoir_id=reservoir_id,
                initial_volume=initial_volume,
                inflow_series=inflow,
                start_time=start_time,
                dt_seconds=dt_seconds,
                downstream_limit=downstream_limit,
                weights=weights,
            )
            objectives.append(obj)

        # Robust optimization: lấy max (worst-case) trên ensemble
        return max(objectives)

    return objective_fn


def get_optimization_bounds(reservoir_id: int) -> list:
    """
    Trả về bounds cho decision variables dựa trên thông số hồ.

    Returns:
        [(q_start_min, q_start_max), (q_max_power_min, q_max_power_max)]
    """
    rp = get_params(reservoir_id)
    flood_threshold = FLOOD_THRESHOLDS.get(reservoir_id, 500.0)
    q_min = MIN_DISCHARGE.get(reservoir_id, 0.0)

    # q_start: từ Qmin đến ngưỡng lũ × 1.5
    q_start_bounds = (q_min, flood_threshold * 1.5)

    # q_max_power: từ Qmin đến công suất tua-bin × 1.2
    q_max_power_bounds = (q_min, rp.max_turbine_discharge * 1.2)

    return [q_start_bounds, q_max_power_bounds]
