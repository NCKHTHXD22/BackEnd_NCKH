"""
SCE-UA (Shuffled Complex Evolution - University of Arizona)
Thuật toán tối ưu hóa toàn cục cho bài toán vận hành hồ chứa.
Reference: Duan et al. (1992, 1993)
Implementation: Pure NumPy, không dependency ngoài.
"""
import numpy as np
from dataclasses import dataclass, field
from typing import Callable, List, Tuple, Optional


@dataclass
class SCEUAConfig:
    n_complexes: int = 5            # p: số complex
    n_points_per_complex: int = 0   # m: điểm/complex (0 = auto: 2*ndim+1)
    n_evolution_steps: int = 0      # alpha: bước tiến hóa/complex (0 = auto: 1)
    min_complexes: int = 2          # p_min: số complex tối thiểu
    max_iterations: int = 500       # Số vòng lặp tối đa
    max_func_evals: int = 5000      # Số lần gọi hàm mục tiêu tối đa
    tol_func: float = 1e-4          # Ngưỡng hội tụ giá trị hàm
    tol_param: float = 1e-3         # Ngưỡng hội tụ tham số
    seed: int = 42                  # Random seed


@dataclass
class OptimizationResult:
    best_params: np.ndarray         # Tham số tối ưu
    best_value: float               # Giá trị hàm mục tiêu tối ưu
    n_iterations: int               # Số vòng lặp đã chạy
    n_func_evals: int               # Số lần gọi hàm mục tiêu
    converged: bool                 # Đã hội tụ chưa
    convergence_reason: str         # Lý do dừng
    history: List[float] = field(default_factory=list)  # Lịch sử best value


def sceua_optimize(
    objective_fn: Callable[[np.ndarray], float],
    bounds: List[Tuple[float, float]],
    config: Optional[SCEUAConfig] = None,
) -> OptimizationResult:
    """
    Tối ưu hóa toàn cục bằng thuật toán SCE-UA.

    Args:
        objective_fn: Hàm mục tiêu f(x) -> float (minimize)
        bounds: Giới hạn mỗi biến [(lb1, ub1), (lb2, ub2), ...]
        config: Cấu hình thuật toán

    Returns:
        OptimizationResult
    """
    if config is None:
        config = SCEUAConfig()

    rng = np.random.default_rng(config.seed)
    ndim = len(bounds)
    lb = np.array([b[0] for b in bounds])
    ub = np.array([b[1] for b in bounds])

    p = config.n_complexes
    m = config.n_points_per_complex if config.n_points_per_complex > 0 else 2 * ndim + 1
    alpha = config.n_evolution_steps if config.n_evolution_steps > 0 else 1
    q = ndim + 1  # Số điểm trong subcomplex

    n_points = p * m  # Tổng số điểm
    n_evals = 0
    history = []

    # === BƯỚC 1: Khởi tạo population ngẫu nhiên ===
    population = lb + rng.random((n_points, ndim)) * (ub - lb)
    fitness = np.zeros(n_points)
    for i in range(n_points):
        fitness[i] = objective_fn(population[i])
        n_evals += 1

    # Sắp xếp theo fitness
    sort_idx = np.argsort(fitness)
    population = population[sort_idx]
    fitness = fitness[sort_idx]
    best_value = fitness[0]
    best_params = population[0].copy()
    history.append(best_value)

    converged = False
    reason = "max_iterations"

    for iteration in range(config.max_iterations):
        # === BƯỚC 2: Chia thành p complexes (interleaved) ===
        complexes = []
        complex_fitness = []
        for j in range(p):
            idx = list(range(j, n_points, p))
            complexes.append(population[idx].copy())
            complex_fitness.append(fitness[idx].copy())

        # === BƯỚC 3: CCE cho mỗi complex ===
        for j in range(p):
            cx = complexes[j]
            cf = complex_fitness[j]

            for _ in range(alpha):
                cx, cf, evals = _cce_step(
                    cx, cf, q, objective_fn, lb, ub, rng
                )
                n_evals += evals

                if n_evals >= config.max_func_evals:
                    break

            complexes[j] = cx
            complex_fitness[j] = cf

            if n_evals >= config.max_func_evals:
                break

        # === BƯỚC 4: Shuffle - gộp lại, sắp xếp ===
        population = np.vstack(complexes)
        fitness = np.concatenate(complex_fitness)
        sort_idx = np.argsort(fitness)
        population = population[sort_idx]
        fitness = fitness[sort_idx]

        # Cập nhật best
        if fitness[0] < best_value:
            best_value = fitness[0]
            best_params = population[0].copy()
        history.append(best_value)

        # === BƯỚC 5: Kiểm tra hội tụ ===
        if n_evals >= config.max_func_evals:
            reason = "max_func_evals"
            converged = True
            break

        # Hội tụ giá trị hàm (quần thể đã hội tụ về một mức fitness)
        if np.max(fitness) - np.min(fitness) < config.tol_func:
            reason = "func_convergence"
            converged = True
            break

        # Hội tụ tham số
        param_range = np.max(population, axis=0) - np.min(population, axis=0)
        if np.all(param_range / (ub - lb + 1e-12) < config.tol_param):
            reason = "param_convergence"
            converged = True
            break

    return OptimizationResult(
        best_params=best_params,
        best_value=best_value,
        n_iterations=iteration + 1,
        n_func_evals=n_evals,
        converged=converged,
        convergence_reason=reason,
        history=history,
    )


def _cce_step(
    cx: np.ndarray,
    cf: np.ndarray,
    q: int,
    objective_fn: Callable,
    lb: np.ndarray,
    ub: np.ndarray,
    rng: np.random.Generator,
) -> Tuple[np.ndarray, np.ndarray, int]:
    """
    Competitive Complex Evolution (CCE) - 1 bước tiến hóa cho 1 complex.

    Chọn subcomplex q điểm bằng phân phối hình thang (trapezoidal),
    sau đó thử: reflection → contraction → random.
    """
    m = len(cx)
    ndim = cx.shape[1]
    n_evals = 0

    # Sắp xếp complex theo fitness
    sort_idx = np.argsort(cf)
    cx = cx[sort_idx]
    cf = cf[sort_idx]

    # Chọn subcomplex q điểm bằng trapezoidal distribution
    # Điểm tốt hơn (index nhỏ) có xác suất được chọn cao hơn
    weights = 2.0 * (m - np.arange(m)) / (m * (m + 1))
    weights = weights / np.sum(weights)  # Fix sai số dấu phẩy động
    chosen = rng.choice(m, size=min(q, m), replace=False, p=weights)
    chosen.sort()

    # Subcomplex
    sub_x = cx[chosen]
    sub_f = cf[chosen]

    # Centroid (trừ điểm tệ nhất)
    worst_idx = np.argmax(sub_f)
    centroid = np.mean(np.delete(sub_x, worst_idx, axis=0), axis=0)
    worst_x = sub_x[worst_idx].copy()
    worst_f = sub_f[worst_idx]

    # === Reflection ===
    reflected = 2.0 * centroid - worst_x
    reflected = np.clip(reflected, lb, ub)
    reflected_f = objective_fn(reflected)
    n_evals += 1

    if reflected_f < worst_f:
        # Reflection thành công
        cx[chosen[worst_idx]] = reflected
        cf[chosen[worst_idx]] = reflected_f
        return cx, cf, n_evals

    # === Contraction ===
    contracted = 0.5 * (centroid + worst_x)
    contracted = np.clip(contracted, lb, ub)
    contracted_f = objective_fn(contracted)
    n_evals += 1

    if contracted_f < worst_f:
        cx[chosen[worst_idx]] = contracted
        cf[chosen[worst_idx]] = contracted_f
        return cx, cf, n_evals

    # === Random mutation ===
    random_x = lb + rng.random(ndim) * (ub - lb)
    random_f = objective_fn(random_x)
    n_evals += 1

    cx[chosen[worst_idx]] = random_x
    cf[chosen[worst_idx]] = random_f
    return cx, cf, n_evals
