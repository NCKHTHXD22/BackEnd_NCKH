"""
reservoir_operation.py
======================
Module tính toán và kiểm tra quy trình vận hành hồ chứa
theo QĐ 1865/QĐ-TTg ngày 23/12/2019 của Thủ tướng Chính phủ.

Quy trình vận hành liên hồ chứa trên lưu vực sông Vu Gia - Thu Bồn.

Tác giả: NCKH Backend Team
"""

import json
import os
import numpy as np
from scipy.interpolate import interp1d
from datetime import date, datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple
from enum import Enum

# ─── Load Parameters ──────────────────────────────────────────────────────────
_PARAMS_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "reservoir_operation_params.json")

with open(_PARAMS_PATH, "r", encoding="utf-8") as f:
    OPERATION_PARAMS = json.load(f)


# ─── Enums & Constants ────────────────────────────────────────────────────────

class Season(str, Enum):
    FLOOD = "flood"       # Mùa lũ: 01/9 -> 15/12
    DRY   = "dry"         # Mùa cạn: 16/12 -> 31/8


class DryPeriod(str, Enum):
    """Bốn thời kỳ vận hành mùa cạn (Điều 17)."""
    I   = "I"    # 16/12 – 31/01 & 11/04 – 10/05
    II  = "II"   # 01/02 – 10/04
    III = "III"  # 11/05 – 10/06
    IV  = "IV"   # 11/06 – 31/08


class WaterLevelStatus(str, Enum):
    ABOVE_TARGET = "above_target"
    IN_TARGET    = "in_target"
    BELOW_TARGET = "below_target"
    ABOVE_NORMAL = "above_normal"   # Vượt mực nước dâng bình thường (mùa lũ)


class OperationMode(str, Enum):
    """Các chế độ vận hành mùa lũ (Điều 7, Khoản 1)."""
    LOWER_WATER_LEVEL = "ha_thap_mn"       # Vận hành hạ thấp mực nước hồ
    MAINTAIN_LEVEL    = "duy_tri_mn"       # Vận hành duy trì mực nước hồ
    CUT_FLOOD         = "cat_giam_lu"      # Vận hành cắt, giảm lũ cho hạ du
    SAFETY_ENSURE     = "an_toan_ct"       # Vận hành bảo đảm an toàn công trình
    END_FLOOD_STORE   = "tich_cuoi_lu"     # Vận hành tích nước cuối mùa lũ
    NORMAL            = "binh_thuong"      # Vận hành trong điều kiện bình thường
    DRY_SEASON        = "mua_can"          # Vận hành mùa cạn


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class ReservoirState:
    """Trạng thái hiện tại của hồ chứa."""
    reservoir_key: str          # VD: "A_VUONG", "DAK_MI_4", ...
    Z_current: float            # Mực nước hiện tại (m)
    Q_inflow: float             # Lưu lượng đến hồ (m³/s)
    timestamp: datetime         # Thời điểm quan trắc
    Q_inflow_forecast_24h: Optional[float] = None  # Dự báo Q trung bình tới
    Q_out_current: Optional[float] = None          # Lưu lượng xả giờ trước (để làm trơn)


@dataclass
class OperationResult:
    """Kết quả tính toán vận hành hồ."""
    reservoir_key: str
    timestamp: datetime

    # Outputs
    Q_discharge: float           # Lưu lượng xả khuyến nghị (m³/s)
    Q_discharge_range: Tuple[float, float]  # (Q_min, Q_max)
    Z_predicted: float           # Mực nước dự báo sau 1 kỳ (24h)
    W_change: float              # Thay đổi dung tích (triệu m³)

    # Classification
    season: Season
    dry_period: Optional[DryPeriod]
    water_level_status: WaterLevelStatus
    operation_mode: OperationMode

    # Compliance check
    is_compliant: bool
    violations: List[str] = field(default_factory=list)
    warnings: List[str]  = field(default_factory=list)
    notes: List[str]     = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "reservoirKey": self.reservoir_key,
            "timestamp": self.timestamp.isoformat(),
            "discharge": {
                "recommended": round(self.Q_discharge, 2),
                "rangeMin": round(self.Q_discharge_range[0], 2),
                "rangeMax": round(self.Q_discharge_range[1], 2),
                "unit": "m³/s"
            },
            "waterLevel": {
                "current": round(self.Z_current, 2) if hasattr(self, 'Z_current') else None,
                "predicted24h": round(self.Z_predicted, 2),
                "deltaVolume_Mm3": round(self.W_change, 3),
                "unit": "m"
            },
            "season": self.season.value,
            "dryPeriod": self.dry_period.value if self.dry_period else None,
            "waterLevelStatus": self.water_level_status.value,
            "operationMode": self.operation_mode.value,
            "compliance": {
                "isCompliant": self.is_compliant,
                "violations": self.violations,
                "warnings": self.warnings,
                "notes": self.notes
            }
        }


# ─── Helper Functions ──────────────────────────────────────────────────────────

def get_season(dt: datetime) -> Season:
    """
    Xác định mùa vận hành dựa trên ngày tháng.
    Mùa lũ: 01/9 -> 15/12
    Mùa cạn: 16/12 -> 31/8
    """
    month, day = dt.month, dt.day
    if (month == 9) or (month == 10) or (month == 11) or \
       (month == 12 and day <= 15):
        return Season.FLOOD
    return Season.DRY


def get_dry_period(dt: datetime) -> Optional[DryPeriod]:
    """
    Xác định thời kỳ trong mùa cạn (Điều 17).
    Trả về None nếu đang trong mùa lũ.
    """
    if get_season(dt) == Season.FLOOD:
        return None

    month, day = dt.month, dt.day

    # Thời kỳ I: 16/12 – 31/01
    if (month == 12 and day >= 16) or (month == 1):
        return DryPeriod.I

    # Thời kỳ II: 01/02 – 10/04
    if (month == 2) or (month == 3) or (month == 4 and day <= 10):
        return DryPeriod.II

    # Thời kỳ I (phần 2): 11/04 – 10/05
    if (month == 4 and day >= 11) or (month == 5 and day <= 10):
        return DryPeriod.I

    # Thời kỳ III: 11/05 – 10/06
    if (month == 5 and day >= 11) or (month == 6 and day <= 10):
        return DryPeriod.III

    # Thời kỳ IV: 11/06 – 31/08
    if (month == 6 and day >= 11) or month in [7, 8]:
        return DryPeriod.IV

    return None


def _remove_duplicates(x: np.ndarray, y: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Loại bỏ các giá trị x trùng lặp để scipy interp1d không báo lỗi."""
    _, idx = np.unique(x, return_index=True)
    idx = np.sort(idx)
    return x[idx], y[idx]


def interpolate_zw(Z_vals: List[float], W_vals: List[float], Z: float) -> float:
    """Nội suy bậc 2 (Quadratic Spline) W từ Z theo đường đặc tính hồ chứa."""
    if len(Z_vals) < 3:
        return float(np.interp(Z, Z_vals, W_vals))
    
    Z_arr, W_arr = _remove_duplicates(np.array(Z_vals), np.array(W_vals))
    
    # Nếu sau khi loại trùng lặp còn dưới 3 điểm, fallback về tuyến tính
    if len(Z_arr) < 3:
        return float(np.interp(Z, Z_arr, W_arr))

    # Giới hạn giá trị nằm ngoài vùng nội suy ở vạch min hoặc max
    f = interp1d(Z_arr, W_arr, kind='quadratic', bounds_error=False, fill_value=(W_arr[0], W_arr[-1]))
    return float(f(Z))


def interpolate_wz(Z_vals: List[float], W_vals: List[float], W: float) -> float:
    """Nội suy bậc 2 (Quadratic Spline) Z từ W (hàm nghịch đảo)."""
    if len(W_vals) < 3:
        return float(np.interp(W, W_vals, Z_vals))
        
    W_arr, Z_arr = _remove_duplicates(np.array(W_vals), np.array(Z_vals))
    
    if len(W_arr) < 3:
        return float(np.interp(W, W_arr, Z_arr))

    f = interp1d(W_arr, Z_arr, kind='quadratic', bounds_error=False, fill_value=(Z_arr[0], Z_arr[-1]))
    return float(f(W))


def get_target_water_level(reservoir_key: str, dt: datetime) -> Optional[Tuple[float, float]]:
    """
    Lấy khoảng mực nước điều hành (Z_from, Z_to) từ Phụ lục III.
    Trả về tuple (Z_from, Z_to) hoặc None nếu không tìm thấy.
    """
    phuluc3 = OPERATION_PARAMS.get("target_water_levels_dry_season_phuluc3", {})
    table = phuluc3.get(reservoir_key, [])

    month, day = dt.month, dt.day

    for row in table:
        # row = [period_idx, date_from_str, date_to_str, Z_from, Z_to]
        if len(row) < 5:
            continue
        _, date_from_str, date_to_str, Z_from, Z_to = row[0], row[1], row[2], row[3], row[4]

        # Parse date range
        try:
            df_parts = date_from_str.split("/")
            dt_parts = date_to_str.split("/")
            m_from, d_from = int(df_parts[1]), int(df_parts[0])
            m_to,   d_to   = int(dt_parts[1]), int(dt_parts[0])

            # Handle year boundary: if date_from is in Dec and date_to is Jan next year
            # Use simplified check
            in_range = _date_in_range(month, day, m_from, d_from, m_to, d_to)
            if in_range:
                return (float(Z_from), float(Z_to))
        except Exception:
            continue

    return None


def _date_in_range(month: int, day: int,
                   m_from: int, d_from: int,
                   m_to: int, d_to: int) -> bool:
    """Check if (month, day) is within [m_from/d_from, m_to/d_to]."""
    current = month * 100 + day
    start   = m_from * 100 + d_from

    # Handle Dec -> Jan wrap-around in dry season
    if m_to < m_from:
        end_in_year = 1231
        start_next  = 101
        end         = m_to * 100 + d_to
        return current >= start or current <= end
    else:
        end = m_to * 100 + d_to
        return start <= current <= end


def classify_water_level(
    reservoir_key: str,
    Z: float,
    dt: datetime,
    season: Season
) -> WaterLevelStatus:
    """Phân loại trạng thái mực nước hồ."""
    res_params = OPERATION_PARAMS["reservoirs"].get(reservoir_key, {})
    params = res_params.get("params", {})
    Z_normal = params.get("Z_normal", float("inf"))

    if season == Season.FLOOD:
        # Kiểm tra MNDBT (mực nước dâng bình thường)
        if Z > Z_normal:
            return WaterLevelStatus.ABOVE_NORMAL
        # Mùa lũ: so với mực nước cao nhất trước lũ (Bảng 1)
        flood_ctrl = res_params.get("flood_level_control", {})
        pre_flood_max = flood_ctrl.get("pre_flood_max", {})
        # Lấy ngưỡng phù hợp theo tháng
        month = dt.month
        if 9 <= month <= 11:
            threshold = pre_flood_max.get("01/9_to_15/11", Z_normal)
        else:
            threshold_range = pre_flood_max.get("16/11_to_15/12", {})
            if isinstance(threshold_range, dict):
                threshold = threshold_range.get("max", Z_normal)
            else:
                threshold = threshold_range

        if Z > threshold:
            return WaterLevelStatus.ABOVE_TARGET  # Vượt mức trước lũ
        return WaterLevelStatus.IN_TARGET
    else:
        # Mùa cạn: so với Phụ lục III
        target = get_target_water_level(reservoir_key, dt)
        if target is None:
            return WaterLevelStatus.IN_TARGET  # fallback

        Z_from, Z_to = target
        if Z > Z_to:
            return WaterLevelStatus.ABOVE_TARGET
        elif Z < Z_from:
            return WaterLevelStatus.BELOW_TARGET
        else:
            return WaterLevelStatus.IN_TARGET


# ─── Core Operation Logic ─────────────────────────────────────────────────────

class ReservoirOperationEngine:
    """
    Động cơ tính toán quy trình vận hành hồ chứa theo QĐ 1865/QĐ-TTg.
    """

    def __init__(self):
        self.params = OPERATION_PARAMS

    def calculate(
        self,
        state: ReservoirState,
        delta_t_hours: float = 24.0
    ) -> OperationResult:
        """
        Tính toán lưu lượng xả khuyến nghị và dự báo mực nước.

        Args:
            state: Trạng thái hiện tại của hồ
            delta_t_hours: Bước thời gian tính toán (mặc định 24h)

        Returns:
            OperationResult với đầy đủ thông tin vận hành
        """
        res_key = state.reservoir_key
        dt      = state.timestamp
        Z_curr  = state.Z_current
        Q_in    = state.Q_inflow

        # Lấy tham số hồ
        res_params = self.params["reservoirs"].get(res_key)
        if res_params is None:
            raise ValueError(f"Không tìm thấy tham số cho hồ '{res_key}'")

        params   = res_params["params"]
        zw_curve = res_params["zw_curve"]
        Z_vals   = zw_curve["Z"]
        W_vals   = zw_curve["W"]

        Z_normal = params["Z_normal"]
        Z_dead   = params["Z_dead"]
        W_dead   = params["W_dead"]

        # Xác định mùa và trạng thái
        season     = get_season(dt)
        dry_period = get_dry_period(dt)
        wl_status  = classify_water_level(res_key, Z_curr, dt, season)

        violations: List[str] = []
        warnings:   List[str] = []
        notes:      List[str] = []

        # ── Tính Q xả và mode vận hành ─────────────────────────────────────
        if season == Season.DRY:
            Q_rec_base, Q_range, op_mode = self._dry_season_discharge(
                res_key, res_params, dt, dry_period, wl_status,
                Z_curr, Q_in, warnings, notes
            )
            # Bổ sung logic Hourly Profile nếu có
            hq_profile = res_params.get("dry_season_discharge", {}).get("dry_season_hourly_profile", {})
            if hq_profile:
                active_hours = hq_profile.get("active_hours", [])
                min_env = hq_profile.get("min_env_flow", 0.0)
                
                # Biến đổi yêu cầu xả trung bình ngày -> xả theo khung giờ hoạt động (scale bù nghỉ đêm)
                if 0 < len(active_hours) < 24:
                    scale_factor = 24.0 / float(len(active_hours))
                    Q_rec_active = Q_rec_base * scale_factor
                else:
                    Q_rec_active = Q_rec_base

                # Không được scale vượt quá hạn mức công suất của tổ máy
                max_gen = hq_profile.get("max_generation", float('inf'))
                if Q_rec_active > max_gen:
                    Q_rec_active = max_gen

                if dt.hour in active_hours:
                    Q_rec_target = Q_rec_active
                    notes.append(f"Giờ xả máy ({dt.hour}h) → Q mục tiêu (max={max_gen}): {Q_rec_target:.1f} m³/s")
                else:
                    Q_rec_target = min_env
                    notes.append(f"Giờ nghỉ máy ({dt.hour}h) → Q mục tiêu (chỉ xả tràn): {Q_rec_target:.1f} m³/s")
            else:
                Q_rec_target = Q_rec_base
        else:
            Q_rec_target, Q_range, op_mode = self._flood_season_discharge(
                res_key, res_params, dt, wl_status,
                Z_curr, Q_in, params, warnings, notes
            )

        # ── Áp dụng Quán tính (Ramp Rate Smoothing) ───────────────────────
        Q_out_prev = state.Q_out_current
        ramp_rate = 150.0  # limit default fallback
        hq_profile = res_params.get("dry_season_discharge", {}).get("dry_season_hourly_profile", {})
        if hq_profile and "max_delta_Q" in hq_profile:
            ramp_rate = hq_profile["max_delta_Q"]

        if Q_out_prev is not None:
            Q_rec = max(Q_out_prev - ramp_rate, min(Q_rec_target, Q_out_prev + ramp_rate))
            if abs(Q_rec - Q_rec_target) > 0.1:
                notes.append(f"Smoothing (ramp={ramp_rate}): Chỉnh Q xả yêu cầu {Q_rec_target:.1f} thành {Q_rec:.1f} m³/s tránh sốc dòng chảy.")
        else:
            Q_rec = Q_rec_target

        # ── Tính mực nước sau 24h (phương trình cân bằng nước) ────────────
        W_curr      = interpolate_zw(Z_vals, W_vals, Z_curr)
        delta_t_sec = delta_t_hours * 3600.0
        # ΔW = (Q_in - Q_out) × Δt (m³) → chuyển sang triệu m³
        delta_W_Mm3 = (Q_in - Q_rec) * delta_t_sec / 1_000_000.0
        W_new       = W_curr + delta_W_Mm3

        # Giới hạn trong phạm vi vật lý của hồ
        W_max = interpolate_zw(Z_vals, W_vals, params.get("Z_design_flood", max(Z_vals)))
        W_new = max(W_dead, min(W_new, W_max))
        Z_new = interpolate_wz(Z_vals, W_vals, W_new)

        # ── Kiểm tra vi phạm quy trình ─────────────────────────────────────
        is_compliant = self._compliance_check(
            res_key, res_params, season, dry_period, wl_status,
            Z_curr, Z_new, Q_rec, params, violations, warnings, notes
        )

        # Thêm thông tin Z hiện tại vào result
        result = OperationResult(
            reservoir_key=res_key,
            timestamp=dt,
            Q_discharge=Q_rec,
            Q_discharge_range=Q_range,
            Z_predicted=Z_new,
            W_change=delta_W_Mm3,
            season=season,
            dry_period=dry_period,
            water_level_status=wl_status,
            operation_mode=op_mode,
            is_compliant=is_compliant,
            violations=violations,
            warnings=warnings,
            notes=notes
        )
        # Attach current Z to result object
        result.Z_current = Z_curr
        return result

    # ─── Dry Season Logic ──────────────────────────────────────────────────

    def _dry_season_discharge(
        self,
        res_key: str,
        res_params: dict,
        dt: datetime,
        dry_period: Optional[DryPeriod],
        wl_status: WaterLevelStatus,
        Z_curr: float,
        Q_in: float,
        warnings: List[str],
        notes: List[str]
    ) -> Tuple[float, Tuple[float, float], OperationMode]:
        """
        Tính lưu lượng xả mùa cạn theo Điều 19-23 (QĐ 1865).
        """
        dry_discharge = res_params.get("dry_season_discharge", {})
        periods = dry_discharge.get("periods", {})

        # Khe Diên & Sông Bung 2 có quy định đặc biệt
        if "note" in dry_discharge:
            notes.append(dry_discharge["note"])
            # Mặc định: xả bằng lưu vào để duy trì mực nước
            Q_rec = Q_in
            return Q_rec, (Q_in * 0.9, Q_in * 1.1), OperationMode.DRY_SEASON

        p_key = dry_period.value if dry_period else "I"
        period_rules = periods.get(p_key, {})

        # Đắk Mi 4: có quy định riêng theo trạm Ái Nghĩa
        if res_key == "DAK_MI_4":
            return self._dakmi4_dry_discharge(
                res_params, dry_period, wl_status, Q_in, warnings, notes
            )

        # Các hồ thông thường: A Vương, Sông Tranh 2, Sông Bung 4
        if wl_status == WaterLevelStatus.ABOVE_TARGET:
            rule = period_rules.get("above_target", {})
            Q_min = rule.get("min", Q_in)
            target = get_target_water_level(res_key, dt)
            
            if target is not None:
                _, Z_to = target
                # Tính lượng nước cần xả để đưa MN về giới hạn Z_to trong ~24h
                Z_vals = res_params["zw_curve"]["Z"]
                W_vals = res_params["zw_curve"]["W"]
                W_curr = interpolate_zw(Z_vals, W_vals, Z_curr)
                W_target = interpolate_zw(Z_vals, W_vals, Z_to)
                
                if W_curr > W_target:
                    delta_W_Mm3 = W_curr - W_target
                    # 1 triệu m3/ngày = ~11.57 m3/s
                    Q_extra = delta_W_Mm3 * 11.574
                    Q_rec = max(Q_min, Q_in + Q_extra)
                    notes.append(f"MN hồ {Z_curr:.2f}m > mục tiêu {Z_to}m. Cần đẩy xả mạnh ~{Q_rec:.1f} m³/s để hạ mực nước nhanh.")
                else:
                    Q_rec = max(Q_min, Q_in * 1.5)
            else:
                Q_rec = max(Q_min, Q_in * 1.5)
            
            # Capping cho Q_max tĩnh
            Q_max = rule.get("max", max(Q_min * 4.0, Q_rec * 1.5))
            Q_rec = min(Q_rec, Q_max)

        elif wl_status == WaterLevelStatus.IN_TARGET:
            rule = period_rules.get("in_target", {})
            Q_min = rule.get("min", Q_in * 0.9)
            Q_max = rule.get("max", Q_in * 1.1)
            Q_rec = (Q_min + Q_max) / 2.0  # Trung điểm khuyến nghị
            notes.append(f"MN hồ trong khoảng quy định. Xả từ {Q_min} đến {Q_max} m³/s")

        else:  # BELOW_TARGET
            rule = period_rules.get("below_target", {})
            Q_min = rule.get("min", Q_in * 0.8)
            Q_max = rule.get("max", Q_in * 0.95)
            Q_rec = Q_min  # Giảm xả để dưỡng mực nước
            warnings.append(f"MN hồ THẤP hơn khoảng quy định (Phụ lục III). Giảm xả còn {Q_min}-{Q_max} m³/s")
            notes.append("Cần căn cứ dự báo dòng chảy đến hồ và nhu cầu sử dụng nước tối thiểu ở hạ du")

        if isinstance(Q_max, type(None)):
            Q_max = Q_rec * 1.5

        return Q_rec, (Q_min, Q_max), OperationMode.DRY_SEASON

    def _dakmi4_dry_discharge(
        self,
        res_params: dict,
        dry_period: Optional[DryPeriod],
        wl_status: WaterLevelStatus,
        Q_in: float,
        warnings: List[str],
        notes: List[str]
    ) -> Tuple[float, Tuple[float, float], OperationMode]:
        """
        Vận hành Đắk Mi 4 mùa cạn (Điều 22):
        - Vu Gia: xả theo mực nước trạm Ái Nghĩa (21h-09h)
        - Thu Bồn: duy trì MN hồ trong Phụ lục III
        """
        # Quy định xả về Vu Gia theo trạm Ái Nghĩa
        notes.append("[Đắk Mi 4 - Mùa cạn] Điều 22 QĐ 1865:")
        notes.append("  Vu Gia: Xả 25 m³/s nếu H(Ái Nghĩa) < 2.67m; ≥16 m³/s nếu 2.67-2.80m; ≥6 m³/s nếu >2.80m")
        notes.append("  Thu Bồn: Duy trì MN hồ trong khoảng Phụ lục III. Điều chỉnh phát điện phù hợp.")

        if wl_status == WaterLevelStatus.ABOVE_TARGET:
            Q_rec = 25.0  # Tăng xả về Vu Gia
            notes.append("  MN hồ cao hơn mục tiêu → có thể tăng phát điện về Thu Bồn")
        elif wl_status == WaterLevelStatus.BELOW_TARGET:
            Q_rec = 6.0   # Giảm xả tối thiểu
            warnings.append("  MN hồ thấp hơn mục tiêu → giảm phát điện về Thu Bồn để tích nước")
        else:
            Q_rec = 25.0  # Trong khoảng: xả bình thường về Vu Gia (ban đêm)

        # Tổng Q ra cả hai phía
        notes.append(f"  Q xả khuyến nghị về Vu Gia (Ái Nghĩa): ~{Q_rec} m³/s")

        return Q_rec, (6.0, Q_in * 1.2), OperationMode.DRY_SEASON

    # ─── Flood Season Logic ────────────────────────────────────────────────

    def _flood_season_discharge(
        self,
        res_key: str,
        res_params: dict,
        dt: datetime,
        wl_status: WaterLevelStatus,
        Z_curr: float,
        Q_in: float,
        params: dict,
        warnings: List[str],
        notes: List[str]
    ) -> Tuple[float, Tuple[float, float], OperationMode]:
        """
        Tính lưu lượng xả mùa lũ theo Điều 7, 8, 9, 11 (QĐ 1865).
        Áp dụng cho: A Vương, Đắk Mi 4, Sông Bung 4, Sông Bung 2.
        """
        flood_ctrl = res_params.get("flood_level_control", {})
        Z_normal   = params["Z_normal"]
        Z_dead     = params["Z_dead"]

        # Ngưỡng lưu lượng đến hồ để chuyển chế độ
        Q_flood_threshold = flood_ctrl.get("flood_threshold_inflow", 500.0)
        spillway_maintain  = flood_ctrl.get("spillway_inflow_maintain", {})
        Q_maintain_min    = spillway_maintain.get("min", Q_flood_threshold)
        Q_maintain_max    = spillway_maintain.get("max", Q_flood_threshold * 1.5)
        Q_cut_threshold   = flood_ctrl.get("spillway_inflow_cut", Q_flood_threshold * 2)

        # ── CASE 1: Vượt MNDBT → Bảo đảm an toàn công trình (Điều 11) ─────
        if wl_status == WaterLevelStatus.ABOVE_NORMAL:
            Q_rec = Q_in * 1.1  # Xả lớn hơn lưu vào để hạ mực nước
            warnings.append(f"⚠️ MN hồ ({Z_curr:.1f}m) vượt MNDBT ({Z_normal}m)! Vận hành bảo đảm an toàn công trình (Điều 11)")
            notes.append("Xả tối đa cho phép để hạ mực nước hồ về dưới MNDBT")
            return Q_rec, (Q_in, Q_rec * 1.5), OperationMode.SAFETY_ENSURE

        # ── CASE 2: Lưu lượng đến lớn → Cắt/Giảm lũ cho hạ du (Điều 8c) ──
        if Q_in > Q_cut_threshold:
            # Cắt giảm lũ: xả ít hơn lưu vào để tích nước cắt lũ
            Q_rec = min(Q_in * 0.85, Q_cut_threshold * 1.1)
            notes.append(f"🌊 Q đến ({Q_in:.0f} m³/s) > ngưỡng cắt lũ ({Q_cut_threshold:.0f} m³/s) → Vận hành cắt, giảm lũ")
            warnings.append("Kiểm tra mực nước tại Hội Khách, Ái Nghĩa để quyết định cường độ giảm lũ")
            return Q_rec, (Q_in * 0.5, Q_rec * 1.2), OperationMode.CUT_FLOOD

        # ── CASE 3: Lưu lượng đến trung bình → Duy trì mực nước (Điều 8b) ─
        if Q_maintain_min <= Q_in <= Q_maintain_max:
            # Duy trì: xả ≈ lưu vào (sai số ±10%)
            Q_rec = Q_in
            notes.append(f"Duy trì mực nước hồ (Q_in={Q_in:.0f} m³/s trong [{Q_maintain_min:.0f}, {Q_maintain_max:.0f}] m³/s)")
            return Q_rec, (Q_in * 0.9, Q_in * 1.1), OperationMode.MAINTAIN_LEVEL

        # ── CASE 4: Mực nước cao hơn mức trước lũ → Hạ thấp (Điều 8a) ────
        if wl_status == WaterLevelStatus.ABOVE_TARGET:
            # Hạ thấp mực nước hồ về mức đón lũ thấp nhất (Bảng 2)
            Q_rec = Q_in * 1.15  # Xả nhiều hơn lưu vào
            notes.append(f"MN hồ ({Z_curr:.1f}m) vượt mức cao nhất trước lũ → Hạ thấp MN hồ (Điều 8a)")
            return Q_rec, (Q_in, Q_rec * 1.3), OperationMode.LOWER_WATER_LEVEL

        # ── CASE 5: Bình thường - Không lũ, không cạn ─────────────────────
        # Vận hành điều kiện bình thường: đảm bảo nhu cầu hạ du + phát điện
        Q_rec = Q_in  # Cân bằng: duy trì mực nước
        notes.append("Vận hành điều kiện bình thường (Điều 13): cân bằng cấp nước và phát điện")
        return Q_rec, (Q_in * 0.8, Q_in * 1.2), OperationMode.NORMAL

    # ─── Compliance Check ──────────────────────────────────────────────────

    def _compliance_check(
        self,
        res_key: str,
        res_params: dict,
        season: Season,
        dry_period: Optional[DryPeriod],
        wl_status: WaterLevelStatus,
        Z_curr: float,
        Z_predicted: float,
        Q_discharge: float,
        params: dict,
        violations: List[str],
        warnings: List[str],
        notes: List[str]
    ) -> bool:
        """
        Kiểm tra toàn bộ điều kiện tuân thủ theo QĐ 1865.
        Trả về True nếu hợp lệ.
        """
        is_ok = True
        Z_normal  = params["Z_normal"]
        Z_dead    = params["Z_dead"]
        Z_design  = params.get("Z_design_flood", Z_normal + 10)

        # ── Vi phạm nghiêm trọng (CRITICAL) ──────────────────────────────
        # 1. Mực nước vượt mực nước thiết kế
        if Z_predicted > Z_design:
            violations.append(
                f"🚨 CRITICAL: Mực nước dự báo ({Z_predicted:.2f}m) vượt MNLT ({Z_design:.2f}m)! Nguy cơ vỡ đập!"
            )
            is_ok = False

        # 2. Mực nước dưới mực nước chết
        if Z_predicted < Z_dead:
            violations.append(
                f"🚨 CRITICAL: Mực nước dự báo ({Z_predicted:.2f}m) thấp hơn MNC ({Z_dead:.2f}m)!"
            )
            is_ok = False

        # 3. Mực nước vượt MNDBT trong mùa lũ khi chưa cần xả
        if season == Season.FLOOD and Z_curr > Z_normal and Q_discharge < 0:
            violations.append(
                f"Vi phạm: MN hồ ({Z_curr:.2f}m) > MNDBT ({Z_normal}m) nhưng Q xả âm!"
            )
            is_ok = False

        # ── Cảnh báo (WARNING) ────────────────────────────────────────────
        # 4. Mùa lũ: MN hồ tiệm cận MNDBT
        if season == Season.FLOOD and Z_curr >= Z_normal * 0.99:
            warnings.append(
                f"⚠️ MN hồ ({Z_curr:.2f}m) tiệm cận MNDBT ({Z_normal}m). Sẵn sàng vận hành an toàn công trình."
            )

        # 5. Mùa cạn: MN hồ thấp hơn khoảng quy định Phụ lục III
        if season == Season.DRY and wl_status == WaterLevelStatus.BELOW_TARGET:
            target = get_target_water_level(res_key, self._get_dt_from_state(dry_period))
            if target:
                Z_from, Z_to = target
                warnings.append(
                    f"⚠️ MN hồ ({Z_curr:.2f}m) thấp hơn khoảng Phụ lục III ({Z_from}-{Z_to}m). "
                    f"Căn cứ Điều 16 khoản 3 để điều chỉnh."
                )

        # ── Lưu ý (INFO) ─────────────────────────────────────────────────
        # 6. Nhắc lịch thời gian vận hành xả
        if season == Season.DRY:
            op_time = res_params.get("dry_season_discharge", {}).get("operation_time", "")
            if op_time:
                notes.append(f"Thời gian vận hành: {op_time}")

        # 7. Nhắc quy định không xả gây dòng chảy đột biến (Điều 5 khoản 2)
        if season == Season.FLOOD and Q_discharge > 1000:
            notes.append(
                "Lưu ý Điều 5 khoản 2: Không vận hành gây dòng chảy đột biến, bất thường đe dọa "
                "tính mạng và tài sản của người dân ở khu vực ven sông hạ du."
            )

        return is_ok

    def _get_dt_from_state(self, dry_period: Optional[DryPeriod]) -> datetime:
        """Helper: tạo datetime đại diện cho thời kỳ mùa cạn (dùng cho tra bảng)."""
        # Map dry period sang tháng đại diện
        mapping = {
            DryPeriod.I:   datetime(2024, 1, 15),
            DryPeriod.II:  datetime(2024, 3, 1),
            DryPeriod.III: datetime(2024, 5, 20),
            DryPeriod.IV:  datetime(2024, 7, 15),
        }
        return mapping.get(dry_period, datetime(2024, 1, 15))


# ─── Batch Calculator ─────────────────────────────────────────────────────────

class ReservoirOperationBatch:
    """
    Tính toán vận hành cho nhiều hồ hoặc theo chuỗi thời gian.
    """

    def __init__(self):
        self.engine = ReservoirOperationEngine()
        # Map từ rid (trong DB) sang reservoir_key
        self.RID_TO_KEY = {
            1:  "A_VUONG",
            2:  "DAK_MI_4",
            3:  "SONG_BUNG_4",
            4:  "SONG_TRANH_2",
            9:  "SONG_BUNG_2",
        }

    def calculate_for_rid(
        self,
        rid: int,
        Z_current: float,
        Q_inflow: float,
        timestamp: datetime,
        Q_inflow_forecast_24h: Optional[float] = None,
        Q_out_current: Optional[float] = None,
        delta_t_hours: float = 24.0
    ) -> OperationResult:
        """
        Tính vận hành cho một hồ bằng reservoir ID (rid từ DB).
        """
        res_key = self.RID_TO_KEY.get(rid)
        if res_key is None:
            raise ValueError(f"Không có quy trình vận hành cho hồ rid={rid} (QĐ 1865 chỉ áp dụng cho 5 hồ chính)")

        state = ReservoirState(
            reservoir_key=res_key,
            Z_current=Z_current,
            Q_inflow=Q_inflow,
            timestamp=timestamp,
            Q_inflow_forecast_24h=Q_inflow_forecast_24h,
            Q_out_current=Q_out_current
        )
        return self.engine.calculate(state, delta_t_hours=delta_t_hours)

    def calculate_forecast_series(
        self,
        rid: int,
        Z_initial: float,
        Q_inflow_series: List[float],
        start_time: datetime,
        delta_t_hours: float = 1.0,  # Now defaults to 1.0 for hourly
        Q_out_initial: Optional[float] = None
    ) -> List[OperationResult]:
        """
        Tính toán vận hành theo chuỗi dự báo (mỗi bước delta_t_hours).
        Sử dụng mực nước dự báo từ bước trước làm đầu vào bước sau.
        """
        results = []
        Z_curr = Z_initial
        Q_out_curr = Q_out_initial

        for i, Q_in in enumerate(Q_inflow_series):
            ts = start_time + timedelta(hours=i * delta_t_hours)

            # Nếu có dự báo bước tiếp theo
            Q_forecast = Q_inflow_series[i + 1] if i + 1 < len(Q_inflow_series) else None

            result = self.calculate_for_rid(
                rid=rid,
                Z_current=Z_curr,
                Q_inflow=Q_in,
                timestamp=ts,
                Q_inflow_forecast_24h=Q_forecast,
                Q_out_current=Q_out_curr,
                delta_t_hours=delta_t_hours
            )
            results.append(result)

            # Cập nhật state cho bước tiếp theo
            Z_curr = result.Z_predicted
            Q_out_curr = result.Q_discharge

        return results


# ─── Singleton Instance ───────────────────────────────────────────────────────
_batch_calculator = None

def get_operation_calculator() -> ReservoirOperationBatch:
    """Lấy singleton instance của batch calculator."""
    global _batch_calculator
    if _batch_calculator is None:
        _batch_calculator = ReservoirOperationBatch()
    return _batch_calculator
