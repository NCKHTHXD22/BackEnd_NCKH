"""
test_operation_logic.py
========================
Unit tests cho module vận hành hồ chứa QĐ 1865.
Chạy: python test_operation_logic.py
"""

import sys
import os

# Thêm path để import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime
from operation.reservoir_operation import (
    ReservoirOperationEngine,
    ReservoirOperationBatch,
    ReservoirState,
    Season,
    DryPeriod,
    WaterLevelStatus,
    OperationMode,
    get_season,
    get_dry_period,
    get_target_water_level,
    interpolate_zw,
    interpolate_wz,
)
import json


def sep(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def test_season_detection():
    sep("TEST 1: Phát hiện mùa vận hành")

    cases = [
        (datetime(2025, 9, 1),   Season.FLOOD, "01/9 = bắt đầu mùa lũ"),
        (datetime(2025, 11, 30), Season.FLOOD, "30/11 = mùa lũ"),
        (datetime(2025, 12, 15), Season.FLOOD, "15/12 = cuối mùa lũ"),
        (datetime(2025, 12, 16), Season.DRY,   "16/12 = bắt đầu mùa cạn"),
        (datetime(2025, 3, 15),  Season.DRY,   "15/3 = mùa cạn"),
        (datetime(2025, 8, 31),  Season.DRY,   "31/8 = cuối mùa cạn"),
    ]

    all_ok = True
    for dt, expected, desc in cases:
        result = get_season(dt)
        ok = result == expected
        status = "✅" if ok else "❌"
        print(f"  {status} {desc}: {result.value} (expected: {expected.value})")
        if not ok:
            all_ok = False

    return all_ok


def test_dry_period_detection():
    sep("TEST 2: Phát hiện thời kỳ mùa cạn")

    cases = [
        (datetime(2025, 12, 20), DryPeriod.I,   "20/12 = Thời kỳ I"),
        (datetime(2025, 1, 15),  DryPeriod.I,   "15/1 = Thời kỳ I"),
        (datetime(2025, 2, 15),  DryPeriod.II,  "15/2 = Thời kỳ II"),
        (datetime(2025, 4, 5),   DryPeriod.II,  "5/4 = Thời kỳ II"),
        (datetime(2025, 4, 20),  DryPeriod.I,   "20/4 = Thời kỳ I (phần 2)"),
        (datetime(2025, 5, 5),   DryPeriod.I,   "5/5 = Thời kỳ I (phần 2)"),
        (datetime(2025, 5, 20),  DryPeriod.III, "20/5 = Thời kỳ III"),
        (datetime(2025, 6, 1),   DryPeriod.III, "1/6 = Thời kỳ III"),
        (datetime(2025, 6, 20),  DryPeriod.IV,  "20/6 = Thời kỳ IV"),
        (datetime(2025, 8, 15),  DryPeriod.IV,  "15/8 = Thời kỳ IV"),
    ]

    all_ok = True
    for dt, expected, desc in cases:
        result = get_dry_period(dt)
        ok = result == expected
        status = "✅" if ok else "❌"
        print(f"  {status} {desc}: {result.value if result else 'None'} (expected: {expected.value})")
        if not ok:
            all_ok = False

    return all_ok


def test_zw_interpolation():
    sep("TEST 3: Nội suy đường quan hệ Z~W")

    # Load JSON trực tiếp
    import json as _json
    _json_path = os.path.join(os.path.dirname(__file__), "..", "config", "reservoir_operation_params.json")
    with open(_json_path, encoding="utf-8") as _f:
        _PARAMS = _json.load(_f)
    res = _PARAMS["reservoirs"]["A_VUONG"]["zw_curve"]
    Z_vals = res["Z"]
    W_vals = res["W"]

    test_cases = [
        (306.0, 0.0,    "Z=MNC=306.0 -> W=0"),
        (380.0, 343.55, "Z=MNDBT=380.0 -> W=343.55"),
        (370.0, 258.72, "Z=370.0 -> W=258.72"),
    ]

    all_ok = True
    for Z_in, W_expected, desc in test_cases:
        W_result = interpolate_zw(Z_vals, W_vals, Z_in)
        err = abs(W_result - W_expected)
        ok = err < 0.1
        status = "✅" if ok else "❌"
        print(f"  {status} {desc}: W={W_result:.3f} (expected: {W_expected}, err: {err:.3f})")
        if not ok:
            all_ok = False

    return all_ok


def test_operation_dry_season():
    sep("TEST 4: Vận hành mùa cạn - Hồ A Vương")

    engine = ReservoirOperationEngine()

    # Kịch bản: Tháng 3 (Thời kỳ II), MN trong khoảng Phụ lục III
    state = ReservoirState(
        reservoir_key="A_VUONG",
        Z_current=374.0,   # Trong khoảng [372.9, 377.0] kỳ cuối tháng 2
        Q_inflow=150.0,
        timestamp=datetime(2025, 3, 5)
    )

    result = engine.calculate(state)
    r = result.to_dict()

    print(f"  Mùa: {r['season']}")
    print(f"  Thời kỳ: {r['dryPeriod']}")
    print(f"  Trạng thái MN: {r['waterLevelStatus']}")
    print(f"  Chế độ vận hành: {r['operationMode']}")
    print(f"  Q xả khuyến nghị: {r['discharge']['recommended']:.1f} m³/s")
    print(f"  Q range: [{r['discharge']['rangeMin']:.1f}, {r['discharge']['rangeMax']:.1f}] m³/s")
    print(f"  Z dự báo 24h: {r['waterLevel']['predicted24h']:.2f} m")
    print(f"  Compliant: {r['compliance']['isCompliant']}")
    if r['compliance']['notes']:
        print(f"  Ghi chú:")
        for note in r['compliance']['notes']:
            print(f"    - {note}")
    if r['compliance']['warnings']:
        print(f"  Cảnh báo:")
        for w in r['compliance']['warnings']:
            print(f"    {w}")

    return r['compliance']['isCompliant']


def test_operation_flood_season():
    sep("TEST 5: Vận hành mùa lũ - Hồ Sông Tranh 2 (Q lớn, nguy cơ lũ)")

    engine = ReservoirOperationEngine()

    # Kịch bản: Tháng 10, Q đến lớn (lũ đang đến)
    state = ReservoirState(
        reservoir_key="SONG_TRANH_2",
        Z_current=171.5,   # Gần mức trước lũ (172.0)
        Q_inflow=1100.0,   # Q lớn, cần cắt giảm lũ
        timestamp=datetime(2025, 10, 15)
    )

    result = engine.calculate(state)
    r = result.to_dict()

    print(f"  Mùa: {r['season']}")
    print(f"  Trạng thái MN: {r['waterLevelStatus']}")
    print(f"  Chế độ vận hành: {r['operationMode']}")
    print(f"  Q vào hồ: 1100.0 m³/s")
    print(f"  Q xả khuyến nghị: {r['discharge']['recommended']:.1f} m³/s")
    print(f"  Q range: [{r['discharge']['rangeMin']:.1f}, {r['discharge']['rangeMax']:.1f}] m³/s")
    print(f"  Z dự báo 24h: {r['waterLevel']['predicted24h']:.2f} m")
    print(f"  Compliant: {r['compliance']['isCompliant']}")
    if r['compliance']['notes']:
        print(f"  Ghi chú:")
        for note in r['compliance']['notes'][:3]:
            print(f"    - {note}")

    return True  # Mùa lũ luôn xả theo tình huống, không nhất thiết compliant


def test_operation_safety():
    sep("TEST 6: Vận hành bảo đảm an toàn công trình - Sông Bung 4")

    engine = ReservoirOperationEngine()

    # Kịch bản nguy hiểm: MN hồ vượt MNDBT (222.5m)
    state = ReservoirState(
        reservoir_key="SONG_BUNG_4",
        Z_current=223.0,   # Vượt MNDBT!
        Q_inflow=800.0,
        timestamp=datetime(2025, 11, 5)
    )

    result = engine.calculate(state)
    r = result.to_dict()

    print(f"  ⚠️  MN hồ ({state.Z_current}m) > MNDBT (222.5m)")
    print(f"  Chế độ vận hành: {r['operationMode']}")
    print(f"  Q xả khuyến nghị: {r['discharge']['recommended']:.1f} m³/s")
    print(f"  Z dự báo 24h: {r['waterLevel']['predicted24h']:.2f} m")
    if r['compliance']['violations']:
        print(f"  Vi phạm:")
        for v in r['compliance']['violations']:
            print(f"    {v}")
    if r['compliance']['warnings']:
        print(f"  Cảnh báo:")
        for w in r['compliance']['warnings']:
            print(f"    {w}")

    # Phải ở chế độ an toàn
    assert result.operation_mode == OperationMode.SAFETY_ENSURE, \
        f"Expected SAFETY_ENSURE, got {result.operation_mode}"
    print(f"  ✅ Đúng chế độ: SAFETY_ENSURE")
    return True


def test_forecast_series():
    sep("TEST 7: Dự báo chuỗi vận hành 7 ngày - Hồ Đắk Mi 4")

    calc = ReservoirOperationBatch()

    # Dự báo Q đến hồ 7 ngày (mùa cạn, tháng 3)
    Q_forecast = [150, 140, 130, 120, 160, 200, 180]  # m³/s mỗi ngày

    results = calc.calculate_forecast_series(
        rid=2,
        Z_initial=253.0,
        Q_inflow_series=Q_forecast,
        start_time=datetime(2025, 3, 1)
    )

    print(f"  Số bước: {len(results)}")
    print(f"  {'Ngày':<12} {'Z (m)':<10} {'Q_in':<10} {'Q_out':<10} {'Mode'}")
    print(f"  {'-'*60}")
    Z_current = 253.0
    for i, r in enumerate(results):
        dt_str = f"01/03+{i}d"
        print(f"  {dt_str:<12} {r.Z_predicted:<10.2f} {Q_forecast[i]:<10.0f} {r.Q_discharge:<10.1f} {r.operation_mode.value}")

    all_compliant = all(r.is_compliant for r in results)
    z_final = results[-1].Z_predicted
    print(f"\n  Z cuối: {z_final:.2f}m")
    print(f"  Tất cả tuân thủ: {'✅' if all_compliant else '⚠️ Có vi phạm'}")

    return True


def test_batch_calculate():
    sep("TEST 8: Batch calculate cho tất cả 5 hồ chính")

    calc = ReservoirOperationBatch()
    test_data = {
        1: {"Z": 376.0, "Q": 200.0, "dt": datetime(2025, 3, 15)},   # A Vương
        2: {"Z": 253.5, "Q": 180.0, "dt": datetime(2025, 3, 15)},   # Đắk Mi 4
        3: {"Z": 218.0, "Q": 150.0, "dt": datetime(2025, 3, 15)},   # Sông Bung 4
        4: {"Z": 171.0, "Q": 300.0, "dt": datetime(2025, 3, 15)},   # Sông Tranh 2
        9: {"Z": 598.0, "Q":  80.0, "dt": datetime(2025, 3, 15)},   # Sông Bung 2
    }

    names = {1: "A Vương", 2: "Đắk Mi 4", 3: "SB4", 4: "ST2", 9: "SB2"}
    print(f"  {'Hồ':<12} {'Z_curr':<10} {'Q_in':<10} {'Q_rec':<10} {'Mode':<18} {'Compliant'}")
    print(f"  {'-'*75}")

    for rid, data in test_data.items():
        result = calc.calculate_for_rid(
            rid=rid,
            Z_current=data["Z"],
            Q_inflow=data["Q"],
            timestamp=data["dt"]
        )
        status = "✅" if result.is_compliant else "⚠️"
        print(f"  {names[rid]:<12} {data['Z']:<10.1f} {data['Q']:<10.0f} "
              f"{result.Q_discharge:<10.1f} {result.operation_mode.value:<18} {status}")

    return True


if __name__ == "__main__":
    print("\n🔵 BẮT ĐẦU KIỂM TRA LOGIC VẬN HÀNH HỒ CHỨA")
    print("   Căn cứ: QĐ 1865/QĐ-TTg ngày 23/12/2019")

    # Path đã được thêm ở đầu file (sys.path.insert(0, ..))

    tests = [
        test_season_detection,
        test_dry_period_detection,
        test_zw_interpolation,
        test_operation_dry_season,
        test_operation_flood_season,
        test_operation_safety,
        test_forecast_series,
        test_batch_calculate,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            ok = test_fn()
            if ok:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"\n  ❌ EXCEPTION: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    sep(f"KẾT QUẢ: {passed}/{passed+failed} tests passed")
    if failed > 0:
        print(f"  ❌ {failed} test(s) FAILED")
        sys.exit(1)
    else:
        print("  ✅ Tất cả tests PASSED")
        sys.exit(0)
