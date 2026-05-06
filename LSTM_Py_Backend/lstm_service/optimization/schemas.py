"""
Pydantic schemas cho API endpoints tối ưu hóa vận hành hồ chứa.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class OptimizeRequest(BaseModel):
    reservoir_id: int = Field(..., ge=1, le=4, description="ID hồ (1=A Vương, 2=Đắk Mi 4, 3=Sông Bung 4, 4=Sông Tranh 2)")
    current_water_level: float = Field(..., description="Mực nước hiện tại (m)")
    current_inflow: float = Field(..., ge=0, description="Lưu lượng đến hiện tại (m³/s)")
    downstream_limit: Optional[float] = Field(None, ge=0, description="Giới hạn lưu lượng hạ du (m³/s)")

    class Config:
        json_schema_extra = {
            "example": {
                "reservoir_id": 1,
                "current_water_level": 375.0,
                "current_inflow": 120.0,
                "downstream_limit": 600.0,
            }
        }


class SimulateRequest(BaseModel):
    reservoir_id: int = Field(..., ge=1, le=4)
    current_water_level: float = Field(..., description="Mực nước hiện tại (m)")
    discharge_rate: float = Field(..., ge=0, description="Lưu lượng xả cố định (m³/s)")

    class Config:
        json_schema_extra = {
            "example": {
                "reservoir_id": 1,
                "current_water_level": 375.0,
                "discharge_rate": 50.0,
            }
        }


# ============================================================
# RESPONSE SCHEMAS
# ============================================================

class DischargeRecommendation(BaseModel):
    time: str
    recommended_discharge: float
    forecast_inflow: float
    water_level: float
    volume: float


class ConstraintViolationResponse(BaseModel):
    time: str
    violation_type: str
    actual_value: float
    limit_value: float
    severity: float


class OptimizationSummary(BaseModel):
    converged: bool
    convergence_reason: str
    n_iterations: int
    n_func_evals: int
    best_value: float


class OptimizeResponse(BaseModel):
    reservoir_id: int
    reservoir_name: str
    current_step: str

    # Tham số tối ưu
    optimal_q_start: float = Field(..., description="Ngưỡng Qin bắt đầu kiểm soát lũ (m³/s)")
    optimal_q_max_power: float = Field(..., description="Xả tối đa khi pre-release (m³/s)")

    # So sánh hiệu quả
    baseline_max_outflow: float = Field(..., description="Đỉnh xả nếu không tối ưu (m³/s)")
    optimized_max_outflow: float = Field(..., description="Đỉnh xả sau tối ưu (m³/s)")
    reduction_percent: float = Field(..., description="% giảm đỉnh lũ")

    # Dung tích cuối (hồ đầy cho mùa khô)
    optimized_end_volume: float = Field(0, description="Dung tích cuối sau lũ (triệu m³)")
    optimized_end_water_level: float = Field(0, description="Mực nước cuối (m)")
    target_volume: float = Field(0, description="Dung tích mục tiêu MNDBT (triệu m³)")
    fill_percent: float = Field(0, description="% đầy so với MNDBT")

    # Chi tiết
    optimization_summary: OptimizationSummary
    recommendations: List[DischargeRecommendation]
    violations: List[ConstraintViolationResponse]
    steps: List[dict]


class SimulateResponse(BaseModel):
    reservoir_id: int
    reservoir_name: str
    max_outflow: float
    max_water_level: float
    min_water_level: float
    energy_loss: float
    n_violations: int
    timeline: List[dict]
    violations: List[ConstraintViolationResponse]
