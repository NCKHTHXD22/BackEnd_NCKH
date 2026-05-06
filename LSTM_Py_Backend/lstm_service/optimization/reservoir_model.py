"""
Reservoir Water Balance Simulation Engine.
Nâng cấp từ RunSimulationLoop (C# ReservoirDetailViewModel.cs:2397-2434).
Khác biệt: hỗ trợ dynamic discharge policy thay vì constant Qout.
"""
import numpy as np
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Callable, List, Optional

from .volume_calculator import get_volume, get_water_level
from .qd1865 import get_max_allowed_level, get_min_allowed_level, MIN_DISCHARGE
from .reservoir_params import get_params


@dataclass
class ConstraintViolation:
    time: datetime
    violation_type: str   # "upper_level", "lower_level", "min_discharge"
    actual_value: float
    limit_value: float
    severity: float       # Mức độ vi phạm (actual - limit)


@dataclass
class SimulationResult:
    times: List[datetime]
    volumes: np.ndarray          # triệu m³
    water_levels: np.ndarray     # m
    inflows: np.ndarray          # m³/s
    outflows: np.ndarray         # m³/s
    max_outflow: float
    max_water_level: float
    min_water_level: float
    constraint_violations: List[ConstraintViolation] = field(default_factory=list)
    energy_loss: float = 0.0     # triệu m³ (tổn thất năng lượng - nước xả không qua tua-bin)
    end_volume: float = 0.0      # triệu m³ (dung tích cuối - quan trọng cho mùa khô)
    end_water_level: float = 0.0 # m (mực nước cuối)


def simulate_reservoir(
    reservoir_id: int,
    initial_volume: float,
    inflow_series: np.ndarray,
    discharge_policy: Callable[[datetime, float, float, float], float],
    start_time: datetime,
    dt_seconds: float = 3600.0,
) -> SimulationResult:
    """
    Mô phỏng cân bằng nước hồ chứa theo từng bước thời gian.

    Args:
        reservoir_id: ID hồ (1-4)
        initial_volume: Dung tích ban đầu (triệu m³)
        inflow_series: Chuỗi lưu lượng đến (m³/s), shape (T,)
        discharge_policy: Hàm quyết định lưu lượng xả
            f(time, volume, water_level, inflow) -> outflow (m³/s)
        start_time: Thời điểm bắt đầu
        dt_seconds: Bước thời gian (giây), mặc định 3600 (1 giờ)

    Returns:
        SimulationResult với toàn bộ trajectory và vi phạm
    """
    T = len(inflow_series)
    params = get_params(reservoir_id)

    times = []
    volumes = np.zeros(T)
    water_levels = np.zeros(T)
    inflows = np.zeros(T)
    outflows = np.zeros(T)
    violations = []

    V = initial_volume
    max_outflow = 0.0
    max_wl = 0.0
    min_wl = float("inf")
    total_spill = 0.0  # Nước xả vượt tua-bin (tổn thất năng lượng)

    for t in range(T):
        current_time = start_time + timedelta(seconds=(t + 1) * dt_seconds)
        qin = float(inflow_series[t])
        H = get_water_level(reservoir_id, V)

        # Gọi discharge policy
        qout = discharge_policy(current_time, V, H, qin)

        # Clamp: không xả âm, không xả nhiều hơn nước có
        qout = max(0.0, qout)
        max_possible_release = V * 1_000_000.0 / dt_seconds + qin
        qout = min(qout, max_possible_release)

        # Cân bằng nước: ΔV = (Qin - Qout) × dt / 10^6
        delta_v = (qin - qout) * dt_seconds / 1_000_000.0
        V = V + delta_v
        V = max(0.0, V)  # Không cho dung tích âm

        H_new = get_water_level(reservoir_id, V)
        max_h = get_max_allowed_level(reservoir_id, current_time)
        min_h = get_min_allowed_level(reservoir_id, current_time)
        q_min = MIN_DISCHARGE.get(reservoir_id, 0.0)

        # Ghi nhận vi phạm
        if H_new > max_h:
            violations.append(ConstraintViolation(
                current_time, "upper_level", H_new, max_h, H_new - max_h))
        if H_new < min_h:
            violations.append(ConstraintViolation(
                current_time, "lower_level", H_new, min_h, min_h - H_new))
        if qout < q_min:
            violations.append(ConstraintViolation(
                current_time, "min_discharge", qout, q_min, q_min - qout))

        # Tổn thất năng lượng = nước xả vượt công suất tua-bin
        spill = max(0.0, qout - params.max_turbine_discharge)
        total_spill += spill * dt_seconds / 1_000_000.0

        # Lưu kết quả
        times.append(current_time)
        volumes[t] = V
        water_levels[t] = H_new
        inflows[t] = qin
        outflows[t] = qout

        max_outflow = max(max_outflow, qout)
        max_wl = max(max_wl, H_new)
        min_wl = min(min_wl, H_new)

    return SimulationResult(
        times=times,
        volumes=volumes,
        water_levels=water_levels,
        inflows=inflows,
        outflows=outflows,
        max_outflow=max_outflow,
        max_water_level=max_wl,
        min_water_level=min_wl,
        constraint_violations=violations,
        energy_loss=total_spill,
        end_volume=V,
        end_water_level=get_water_level(reservoir_id, V),
    )


# ============================================================
# DISCHARGE POLICIES
# ============================================================

def constant_discharge_policy(qout: float):
    """Policy xả cố định (tương đương RunSimulationLoop C# hiện tại)."""
    def policy(t, V, H, qin):
        return qout
    return policy


def passthrough_policy():
    """Policy xả bằng lưu lượng đến (Qout = Qin)."""
    def policy(t, V, H, qin):
        return qin
    return policy


def okamoto_discharge_policy(
    q_start: float,
    q_max_power: float,
    reservoir_id: int,
):
    """
    Okamoto (2023) discharge policy - điều chỉnh cho vận hành thực tế VN.

    3 chế độ tự động chuyển đổi:
    1. PRE-RELEASE (Qin tăng, chưa đến đỉnh): Xả q_max_power hạ mực nước đón lũ
    2. FLOOD CONTROL (Qin >= q_start): Cắt giảm lũ - xả ít, giữ nước trong hồ
    3. RECOVERY (Qin giảm, sau đỉnh): Giữ nước tối đa → hồ đầy cho mùa khô

    Mục tiêu kép:
    - Lũ: Qout không gây lụt hạ du (min max Qout)
    - Sau lũ: Hồ đầy nhất có thể (max end volume)
    """
    q_min = MIN_DISCHARGE.get(reservoir_id, 0.0)
    rp = get_params(reservoir_id)
    peak_seen = [0.0]  # Track đỉnh Qin đã qua

    def policy(t: datetime, V: float, H: float, qin: float) -> float:
        max_h = get_max_allowed_level(reservoir_id, t)
        min_h = get_min_allowed_level(reservoir_id, t)
        V_max = get_volume(reservoir_id, max_h)
        V_min = get_volume(reservoir_id, min_h)

        # Theo dõi đỉnh lũ
        if qin > peak_seen[0]:
            peak_seen[0] = qin

        # Xác định pha: lũ đang lên hay đang rút?
        flood_is_rising = (qin >= peak_seen[0] * 0.95)  # Gần/tại đỉnh
        flood_is_receding = (peak_seen[0] > q_start and qin < peak_seen[0] * 0.7)  # Đã qua đỉnh rõ

        if flood_is_receding:
            # === PHA 3: RECOVERY - Lũ rút → GIỮ NƯỚC để hồ đầy ===
            # Chỉ xả tối thiểu (duy trì dòng chảy môi trường)
            # Phần lớn nước lũ rút được tích lại cho mùa khô
            if V >= V_max:
                # Hồ đã đầy → xả bằng Qin (không tràn)
                qout = qin
            elif V >= V_max * 0.95:
                # Gần đầy → xả tối thiểu
                qout = q_min
            else:
                # Còn chỗ → giữ tối đa, chỉ xả tối thiểu
                qout = q_min

        elif qin >= q_start:
            # === PHA 2: FLOOD CONTROL - Cắt giảm lũ ===
            available = max(V_max - V, 0.0)
            total_capacity = max(V_max - V_min, 1.0)
            fill_ratio = 1.0 - (available / total_capacity)

            if fill_ratio < 0.85:
                # Còn dung tích → tích nước mạnh (vừa cắt lũ, vừa tích cho mùa khô)
                release_ratio = 0.3 + 0.5 * fill_ratio
                qout = qin * release_ratio
            elif fill_ratio < 0.95:
                qout = qin * 0.9
            else:
                # Đầy → phải xả bằng Qin
                qout = qin

            # An toàn: không cho vượt mực nước tối đa
            if V > V_max:
                excess = (V - V_max) * 1_000_000.0 / 3600.0
                qout = max(qout, qin + excess * 0.5)

        else:
            # === PHA 1: PRE-RELEASE - Hạ mực nước trước lũ ===
            if V > V_min:
                qout = q_max_power
            else:
                qout = qin

        qout = max(qout, q_min)
        return qout

    return policy
