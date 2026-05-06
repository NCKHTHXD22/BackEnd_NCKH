"""
Okamoto (2023) 5-Step Workflow Orchestrator.
Điều chỉnh cho lưu vực Vu Gia - Thu Bồn tuân thủ QĐ 1865.

5 bước:
  Step 1: Pre-release (QĐ 1865 Điều 8.1a) - hạ mực nước trước lũ
  Step 2: SCE-UA Optimize - tìm tham số xả tối ưu
  Step 3: Lock params - khóa tham số khi Qin > flood threshold
  Step 4: Flood control (Điều 8.1c) - cắt/giảm lũ theo tham số tối ưu
  Step 5: Recovery (Điều 8.1d) - Qout = Qin, hạ dần về mực nước trước lũ
"""
import numpy as np
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict

from .sceua import sceua_optimize, SCEUAConfig, OptimizationResult
from .objective import (
    create_objective_for_ensemble,
    get_optimization_bounds,
    compute_objective,
)
from .reservoir_model import (
    simulate_reservoir,
    okamoto_discharge_policy,
    passthrough_policy,
    SimulationResult,
)
from .volume_calculator import get_volume, get_water_level
from .qd1865 import (
    get_max_allowed_level,
    get_min_allowed_level,
    FLOOD_THRESHOLDS,
    MIN_DISCHARGE,
)
from .reservoir_params import get_params


class WorkflowStep(str, Enum):
    PRE_RELEASE = "pre_release"
    OPTIMIZE = "optimize"
    LOCK_PARAMS = "lock_params"
    FLOOD_CONTROL = "flood_control"
    RECOVERY = "recovery"


@dataclass
class StepResult:
    step: WorkflowStep
    description: str
    params: Optional[dict] = None


@dataclass
class OkamotoResult:
    reservoir_id: int
    reservoir_name: str
    current_step: WorkflowStep
    steps_completed: List[StepResult] = field(default_factory=list)

    # Kết quả tối ưu
    optimal_q_start: Optional[float] = None
    optimal_q_max_power: Optional[float] = None
    optimization_result: Optional[OptimizationResult] = None

    # Mô phỏng với tham số tối ưu
    simulation: Optional[SimulationResult] = None

    # So sánh kịch bản
    baseline_max_outflow: Optional[float] = None   # Không tối ưu (Qout=Qin)
    optimized_max_outflow: Optional[float] = None   # Với SCE-UA
    reduction_percent: Optional[float] = None        # % giảm đỉnh lũ

    # Dung tích cuối (hồ đầy hay không sau lũ)
    baseline_end_volume: Optional[float] = None
    optimized_end_volume: Optional[float] = None
    optimized_end_water_level: Optional[float] = None
    target_volume: Optional[float] = None            # MNDBT volume
    fill_percent: Optional[float] = None             # % đầy so với MNDBT

    # Khuyến nghị cho vận hành
    recommended_discharge: Optional[List[dict]] = None  # [{time, qout}]


def determine_current_step(
    reservoir_id: int,
    current_water_level: float,
    current_inflow: float,
    current_time: datetime,
) -> WorkflowStep:
    """
    Xác định bước hiện tại dựa trên trạng thái hồ và lưu lượng đến.

    Logic (QĐ 1865):
    - Qin < flood_threshold → có thể pre-release hoặc đã recovery
    - Qin >= flood_threshold → flood control
    - Mực nước > max allowed → cần xả khẩn cấp
    """
    flood_threshold = FLOOD_THRESHOLDS.get(reservoir_id, 500.0)
    max_h = get_max_allowed_level(reservoir_id, current_time)
    min_h = get_min_allowed_level(reservoir_id, current_time)

    if current_inflow >= flood_threshold:
        return WorkflowStep.FLOOD_CONTROL

    if current_water_level > max_h:
        # Mực nước cao hơn cho phép → pre-release để hạ
        return WorkflowStep.PRE_RELEASE

    if current_water_level <= min_h:
        # Đã hạ đủ thấp → sẵn sàng optimize
        return WorkflowStep.OPTIMIZE

    # Trạng thái bình thường, dự báo có lũ → optimize
    return WorkflowStep.OPTIMIZE


def run_okamoto_workflow(
    reservoir_id: int,
    current_water_level: float,
    current_inflow: float,
    current_time: datetime,
    ensemble_inflows: List[np.ndarray],
    dt_seconds: float = 3600.0,
    downstream_limit: Optional[float] = None,
    sceua_config: Optional[SCEUAConfig] = None,
) -> OkamotoResult:
    """
    Chạy toàn bộ workflow Okamoto 5 bước.

    Args:
        reservoir_id: ID hồ (1-4)
        current_water_level: Mực nước hiện tại (m)
        current_inflow: Lưu lượng đến hiện tại (m³/s)
        current_time: Thời điểm hiện tại
        ensemble_inflows: Dự báo ensemble [P10, P50, P90], shape (T,) mỗi cái
        dt_seconds: Bước thời gian (giây)
        downstream_limit: Giới hạn lưu lượng hạ du (m³/s)
        sceua_config: Cấu hình SCE-UA (None = mặc định)

    Returns:
        OkamotoResult với tham số tối ưu và khuyến nghị
    """
    rp = get_params(reservoir_id)
    initial_volume = get_volume(reservoir_id, current_water_level)
    flood_threshold = FLOOD_THRESHOLDS.get(reservoir_id, 500.0)

    result = OkamotoResult(
        reservoir_id=reservoir_id,
        reservoir_name=rp.name,
        current_step=WorkflowStep.PRE_RELEASE,
    )

    # ========== STEP 1: Pre-release assessment ==========
    step = determine_current_step(
        reservoir_id, current_water_level, current_inflow, current_time
    )
    result.current_step = step
    result.steps_completed.append(StepResult(
        step=WorkflowStep.PRE_RELEASE,
        description=f"Assessed state: WL={current_water_level:.1f}m, "
                    f"Qin={current_inflow:.1f}m³/s → {step.value}",
        params={"water_level": current_water_level, "inflow": current_inflow},
    ))

    # ========== STEP 2: SCE-UA Optimization ==========
    # Lấy bounds dựa trên thông số hồ
    bounds = get_optimization_bounds(reservoir_id)

    # Tạo hàm mục tiêu ensemble
    objective_fn = create_objective_for_ensemble(
        reservoir_id=reservoir_id,
        initial_volume=initial_volume,
        ensemble_inflows=ensemble_inflows,
        start_time=current_time,
        dt_seconds=dt_seconds,
        downstream_limit=downstream_limit,
    )

    # Chạy SCE-UA
    if sceua_config is None:
        sceua_config = SCEUAConfig(
            n_complexes=5,
            max_iterations=200,
            max_func_evals=3000,
            tol_func=1e-3,
        )

    opt_result = sceua_optimize(
        objective_fn=objective_fn,
        bounds=bounds,
        config=sceua_config,
    )

    result.optimal_q_start = float(opt_result.best_params[0])
    result.optimal_q_max_power = float(opt_result.best_params[1])
    result.optimization_result = opt_result
    result.steps_completed.append(StepResult(
        step=WorkflowStep.OPTIMIZE,
        description=f"SCE-UA converged: q_start={result.optimal_q_start:.1f}, "
                    f"q_max_power={result.optimal_q_max_power:.1f}, "
                    f"evals={opt_result.n_func_evals}",
        params={
            "q_start": result.optimal_q_start,
            "q_max_power": result.optimal_q_max_power,
            "converged": opt_result.converged,
            "reason": opt_result.convergence_reason,
        },
    ))

    # ========== STEP 3 & 4: Simulate with optimal params ==========
    # Dùng P50 (median) cho mô phỏng chính
    p50_inflow = ensemble_inflows[len(ensemble_inflows) // 2]

    # Mô phỏng với tham số tối ưu
    optimal_policy = okamoto_discharge_policy(
        result.optimal_q_start, result.optimal_q_max_power, reservoir_id
    )
    sim_optimal = simulate_reservoir(
        reservoir_id=reservoir_id,
        initial_volume=initial_volume,
        inflow_series=p50_inflow,
        discharge_policy=optimal_policy,
        start_time=current_time,
        dt_seconds=dt_seconds,
    )
    result.simulation = sim_optimal
    result.optimized_max_outflow = sim_optimal.max_outflow

    # Baseline: Qout = Qin (không can thiệp)
    sim_baseline = simulate_reservoir(
        reservoir_id=reservoir_id,
        initial_volume=initial_volume,
        inflow_series=p50_inflow,
        discharge_policy=passthrough_policy(),
        start_time=current_time,
        dt_seconds=dt_seconds,
    )
    result.baseline_max_outflow = sim_baseline.max_outflow
    result.baseline_end_volume = sim_baseline.end_volume

    # Tính % giảm đỉnh lũ
    if result.baseline_max_outflow > 0:
        result.reduction_percent = (
            (result.baseline_max_outflow - result.optimized_max_outflow)
            / result.baseline_max_outflow * 100.0
        )
    else:
        result.reduction_percent = 0.0

    # Tính dung tích cuối (hồ đầy bao nhiêu %)
    V_mndbt = get_volume(reservoir_id, rp.MNDBT)
    result.target_volume = V_mndbt
    result.optimized_end_volume = sim_optimal.end_volume
    result.optimized_end_water_level = sim_optimal.end_water_level
    result.fill_percent = (sim_optimal.end_volume / V_mndbt * 100.0) if V_mndbt > 0 else 0.0

    result.steps_completed.append(StepResult(
        step=WorkflowStep.FLOOD_CONTROL,
        description=f"Flood: baseline peak={result.baseline_max_outflow:.1f}, "
                    f"optimized peak={result.optimized_max_outflow:.1f} "
                    f"(giảm {result.reduction_percent:.1f}%). "
                    f"Storage: end={sim_optimal.end_volume:.1f}/{V_mndbt:.1f} triệu m³ "
                    f"({result.fill_percent:.0f}% MNDBT)",
    ))

    # ========== STEP 5: Generate recommended discharge schedule ==========
    recommended = []
    for i, t in enumerate(sim_optimal.times):
        recommended.append({
            "time": t.isoformat(),
            "recommended_discharge": float(sim_optimal.outflows[i]),
            "forecast_inflow": float(sim_optimal.inflows[i]),
            "water_level": float(sim_optimal.water_levels[i]),
            "volume": float(sim_optimal.volumes[i]),
        })
    result.recommended_discharge = recommended

    result.steps_completed.append(StepResult(
        step=WorkflowStep.RECOVERY,
        description=f"Generated {len(recommended)} hourly discharge recommendations",
    ))

    return result
