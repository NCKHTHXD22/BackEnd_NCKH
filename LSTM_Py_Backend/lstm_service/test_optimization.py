"""
Demo: So sánh vận hành hồ A Vương TRƯỚC và SAU tối ưu SCE-UA.
Chạy: python test_optimization.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
from datetime import datetime

from optimization.volume_calculator import get_volume, get_water_level
from optimization.reservoir_params import get_params
from optimization.qd1865 import get_max_allowed_level, get_min_allowed_level, FLOOD_THRESHOLDS
from optimization.reservoir_model import simulate_reservoir, passthrough_policy, okamoto_discharge_policy
from optimization.sceua import sceua_optimize, SCEUAConfig
from optimization.objective import create_objective_for_ensemble, get_optimization_bounds


def generate_flood_hydrograph(peak=800, duration=12, base=50):
    """Tạo đường quá trình lũ giả lập (hình tam giác)."""
    t_rise = duration // 3
    t_fall = duration - t_rise
    rising = np.linspace(base, peak, t_rise)
    falling = np.linspace(peak, base, t_fall)
    return np.concatenate([rising, falling])


def main():
    RID = 1  # A Vương
    rp = get_params(RID)

    print("=" * 65)
    print(f"  DEMO TỐI ƯU VẬN HÀNH HỒ {rp.name} (SCE-UA + Okamoto)")
    print("=" * 65)

    # Điều kiện ban đầu
    current_wl = 375.0  # m
    initial_vol = get_volume(RID, current_wl)
    start_time = datetime(2025, 10, 15, 6, 0)  # Mùa lũ
    flood_threshold = FLOOD_THRESHOLDS[RID]
    max_wl = get_max_allowed_level(RID, start_time)
    min_wl = get_min_allowed_level(RID, start_time)

    print(f"\n📋 Thông số hồ {rp.name}:")
    print(f"   MNDBT = {rp.MNDBT}m, MNC = {rp.MNC}m")
    print(f"   Dung tích thiết kế = {rp.design_capacity} triệu m³")
    print(f"   Công suất tua-bin = {rp.max_turbine_discharge} m³/s")
    print(f"   Ngưỡng lũ QĐ1865 = {flood_threshold} m³/s")

    print(f"\n📊 Điều kiện ban đầu:")
    print(f"   Mực nước = {current_wl}m (cho phép: {min_wl}m - {max_wl}m)")
    print(f"   Dung tích = {initial_vol:.1f} triệu m³")

    # Tạo 3 kịch bản lũ (ensemble P10/P50/P90)
    p10 = generate_flood_hydrograph(peak=500, duration=12, base=40)
    p50 = generate_flood_hydrograph(peak=800, duration=12, base=60)
    p90 = generate_flood_hydrograph(peak=1200, duration=12, base=80)
    ensemble = [p10, p50, p90]

    print(f"\n🌊 Dự báo lũ (ensemble {len(p50)} giờ):")
    print(f"   P10 (lạc quan):  đỉnh = {p10.max():.0f} m³/s")
    print(f"   P50 (trung bình): đỉnh = {p50.max():.0f} m³/s")
    print(f"   P90 (bi quan):   đỉnh = {p90.max():.0f} m³/s")

    # ===== KỊCH BẢN 1: Không tối ưu (Qout = Qin) =====
    print("\n" + "-" * 65)
    print("  KỊCH BẢN 1: KHÔNG TỐI ƯU (xả bằng lưu lượng đến)")
    print("-" * 65)

    sim_baseline = simulate_reservoir(
        reservoir_id=RID,
        initial_volume=initial_vol,
        inflow_series=p50,
        discharge_policy=passthrough_policy(),
        start_time=start_time,
    )
    print(f"   Đỉnh xả (max Qout) = {sim_baseline.max_outflow:.1f} m³/s")
    print(f"   Mực nước cao nhất   = {sim_baseline.max_water_level:.2f}m")
    print(f"   Mực nước thấp nhất  = {sim_baseline.min_water_level:.2f}m")
    print(f"   Vi phạm QĐ1865     = {len(sim_baseline.constraint_violations)} lần")

    # ===== KỊCH BẢN 2: Tối ưu SCE-UA =====
    print("\n" + "-" * 65)
    print("  KỊCH BẢN 2: TỐI ƯU SCE-UA (Okamoto 2023 + QĐ 1865)")
    print("-" * 65)

    bounds = get_optimization_bounds(RID)
    print(f"   Bounds: q_start ∈ [{bounds[0][0]:.0f}, {bounds[0][1]:.0f}] m³/s")
    print(f"           q_max_power ∈ [{bounds[1][0]:.0f}, {bounds[1][1]:.0f}] m³/s")

    objective_fn = create_objective_for_ensemble(
        reservoir_id=RID,
        initial_volume=initial_vol,
        ensemble_inflows=ensemble,
        start_time=start_time,
    )

    config = SCEUAConfig(
        n_complexes=5,
        max_iterations=200,
        max_func_evals=3000,
        tol_func=1e-3,
    )

    print("   Đang chạy SCE-UA...", end=" ", flush=True)
    opt = sceua_optimize(objective_fn, bounds, config)
    print(f"xong! ({opt.n_func_evals} evaluations)")

    q_start_opt = opt.best_params[0]
    q_max_power_opt = opt.best_params[1]
    print(f"   Tham số tối ưu:")
    print(f"     q_start     = {q_start_opt:.1f} m³/s (ngưỡng chuyển chế độ)")
    print(f"     q_max_power = {q_max_power_opt:.1f} m³/s (xả pre-release)")
    print(f"   Hội tụ: {opt.converged} ({opt.convergence_reason})")

    # Mô phỏng với tham số tối ưu
    optimal_policy = okamoto_discharge_policy(q_start_opt, q_max_power_opt, RID)
    sim_optimal = simulate_reservoir(
        reservoir_id=RID,
        initial_volume=initial_vol,
        inflow_series=p50,
        discharge_policy=optimal_policy,
        start_time=start_time,
    )
    print(f"\n   Đỉnh xả (max Qout) = {sim_optimal.max_outflow:.1f} m³/s")
    print(f"   Mực nước cao nhất   = {sim_optimal.max_water_level:.2f}m")
    print(f"   Mực nước thấp nhất  = {sim_optimal.min_water_level:.2f}m")
    print(f"   Vi phạm QĐ1865     = {len(sim_optimal.constraint_violations)} lần")
    print(f"   Tổn thất năng lượng = {sim_optimal.energy_loss:.2f} triệu m³")

    # ===== SO SÁNH =====
    print("\n" + "=" * 65)
    print("  SO SÁNH KẾT QUẢ")
    print("=" * 65)

    reduction = (sim_baseline.max_outflow - sim_optimal.max_outflow) / sim_baseline.max_outflow * 100
    print(f"   {'':30s} {'Không tối ưu':>14s} {'SCE-UA':>14s}")
    print(f"   {'─' * 60}")
    print(f"   {'Đỉnh xả (m³/s)':30s} {sim_baseline.max_outflow:>14.1f} {sim_optimal.max_outflow:>14.1f}")
    print(f"   {'Mực nước cao nhất (m)':30s} {sim_baseline.max_water_level:>14.2f} {sim_optimal.max_water_level:>14.2f}")
    print(f"   {'Mực nước thấp nhất (m)':30s} {sim_baseline.min_water_level:>14.2f} {sim_optimal.min_water_level:>14.2f}")
    print(f"   {'Vi phạm QĐ1865':30s} {len(sim_baseline.constraint_violations):>14d} {len(sim_optimal.constraint_violations):>14d}")
    print(f"   {'─' * 60}")
    print(f"   >>> GIẢM ĐỈNH LŨ: {reduction:.1f}%")

    # Timeline chi tiết
    print(f"\n📈 Timeline vận hành tối ưu (12 giờ):")
    print(f"   {'Giờ':>4s} | {'Qin (m³/s)':>10s} | {'Qout (m³/s)':>11s} | {'WL (m)':>8s} | {'V (tr.m³)':>10s}")
    print(f"   {'─' * 55}")
    for i in range(len(sim_optimal.times)):
        print(f"   {i+1:>4d} | {sim_optimal.inflows[i]:>10.1f} | {sim_optimal.outflows[i]:>11.1f} | {sim_optimal.water_levels[i]:>8.2f} | {sim_optimal.volumes[i]:>10.2f}")

    print(f"\n✅ Demo hoàn tất. Module sẵn sàng tích hợp vào API endpoint /optimize")


if __name__ == "__main__":
    main()
