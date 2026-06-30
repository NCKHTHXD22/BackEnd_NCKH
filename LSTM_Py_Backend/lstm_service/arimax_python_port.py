"""Python port of ArimaService.cs (full pipeline):
- Differenced AR(p) Ridge regression with 4 rain columns and auto-tuned lag
- ApplyFloodPeakBoost: rule-based amplification when 24h rain > basin threshold
- FindAnalogShape: nearest-neighbour shape matching against historical patterns
- BlendForecast: combine ARIMAX baseline with analog shape

Inputs:
    flow_history : list of past Q_in (m3/s)
    rain_history : list of past rain @ lake (mm/h)
    rain_forecast: list of rain to apply over the forecast horizon
    steps        : forecast horizon (h)
    reservoir_id : VNDMS id used to look up basin-specific flood threshold
"""
from __future__ import annotations

import numpy as np

RAIN_COLS = 4
MIN_FLOW_FOR_FIT = 24
DEFAULT_LAG = 3
MIN_P = 3
MAX_P = 4
MAX_LAG = 6
LAMBDA_GRID = (0.001, 0.01, 0.1, 1.0, 10.0)

FLOOD_RAIN_THRESHOLD = {
    1: 150,
    2: 250,
    3: 180,
    4: 220,
    20: 200,
}


def _sum_rain(rain, end_idx, hours):
    s = 0.0
    for h in range(hours):
        idx = end_idx - h
        if 0 <= idx < len(rain):
            s += rain[idx]
    return s


def _fill_rain_columns(X, row, col_start, rain, rain_idx):
    X[row, col_start] = rain[rain_idx] if 0 <= rain_idx < len(rain) else 0.0
    X[row, col_start + 1] = _sum_rain(rain, rain_idx - 1, 5)
    X[row, col_start + 2] = _sum_rain(rain, rain_idx - 6, 6)
    X[row, col_start + 3] = _sum_rain(rain, rain_idx - 12, 12)


def _rain_contribution(coeffs, p, rain_input, full_rain, rain_idx):
    c = coeffs[p] * rain_input
    c += coeffs[p + 1] * _sum_rain(full_rain, rain_idx - 1, 5)
    c += coeffs[p + 2] * _sum_rain(full_rain, rain_idx - 6, 6)
    c += coeffs[p + 3] * _sum_rain(full_rain, rain_idx - 12, 12)
    return c


def _solve_ridge(X, Y, lam=1e-4):
    Xt = X.T
    XtX = Xt @ X
    XtX[np.diag_indices_from(XtX)] += lam
    XtY = Xt @ Y
    return np.linalg.solve(XtX, XtY)


def _find_best_lag(diff_flow, rain, max_lag=MAX_LAG):
    best_lag = DEFAULT_LAG
    best_corr = -1.0
    n = len(diff_flow)
    if n < 24:
        return DEFAULT_LAG
    for lag in range(1, max_lag + 1):
        xs, ys = [], []
        for i in range(lag + 6, n):
            rain_idx = i - lag
            if rain_idx >= len(rain):
                break
            ys.append(diff_flow[i])
            xs.append(_sum_rain(rain, rain_idx, 6))
        if len(xs) < 10:
            continue
        x = np.array(xs)
        y = np.array(ys)
        denom = np.std(x) * np.std(y)
        if denom < 1e-9:
            continue
        corr = abs(np.mean((x - x.mean()) * (y - y.mean())) / denom)
        if corr > best_corr:
            best_corr = corr
            best_lag = lag
    return best_lag


def _build_design(diff_flow, rain, p, best_lag):
    n = len(diff_flow)
    train_len = n - p - best_lag
    if train_len <= 10:
        return None, None
    cols = p + RAIN_COLS + 1
    X = np.zeros((train_len, cols))
    Y = np.zeros(train_len)
    for i in range(train_len):
        cur = i + p + best_lag
        for k in range(p):
            X[i, k] = diff_flow[cur - 1 - k]
        rain_idx = cur - best_lag
        _fill_rain_columns(X, i, p, rain, rain_idx)
        X[i, p + RAIN_COLS] = 1.0
        Y[i] = diff_flow[cur]
    return X, Y


def _auto_tune_lambda(X, Y):
    rows = X.shape[0]
    train_size = int(rows * 0.8)
    val_size = rows - train_size
    if val_size < 5:
        return 0.01
    Xtr, Ytr = X[:train_size], Y[:train_size]
    Xva, Yva = X[train_size:], Y[train_size:]
    best_lam = 0.01
    best_rmse = np.inf
    for lam in LAMBDA_GRID:
        try:
            coeffs = _solve_ridge(Xtr, Ytr, lam)
        except np.linalg.LinAlgError:
            continue
        pred = Xva @ coeffs
        rmse = float(np.sqrt(np.mean((Yva - pred) ** 2)))
        if rmse < best_rmse:
            best_rmse = rmse
            best_lam = lam
    return best_lam


def _find_best_p(clean_flow, diff_flow, rain, best_lag, min_p=MIN_P, max_p=MAX_P):
    n = len(diff_flow)
    if n < 48:
        return min_p
    train_size = int(n * 0.8)
    test_size = n - train_size
    if test_size < 6:
        return min_p
    best_p, best_aicc = min_p, np.inf
    for p in range(min_p, max_p + 1):
        train_len = train_size - p - best_lag
        if train_len <= 10:
            continue
        X, Y = _build_design(diff_flow[:train_size], rain, p, best_lag)
        if X is None:
            continue
        try:
            coeffs = _solve_ridge(X, Y)
        except np.linalg.LinAlgError:
            continue
        last_diffs = [diff_flow[train_size - 1 - k] if (train_size - 1 - k) >= 0 else 0.0 for k in range(p)]
        cur = clean_flow[train_size]
        sse, cnt = 0.0, 0
        for i in range(test_size):
            rain_idx = train_size + i - best_lag
            rain_in = rain[rain_idx] if 0 <= rain_idx < len(rain) else 0.0
            nd = sum(coeffs[k] * last_diffs[k] for k in range(p))
            nd += _rain_contribution(coeffs, p, rain_in, rain, rain_idx)
            nd += coeffs[p + RAIN_COLS]
            cur += nd
            cur = max(0.0, cur)
            if train_size + i + 1 >= len(clean_flow):
                break
            actual = clean_flow[train_size + i + 1]
            sse += (actual - cur) ** 2
            cnt += 1
            actual_diff = actual - clean_flow[train_size + i]
            last_diffs.insert(0, actual_diff)
            last_diffs.pop()
            cur = actual
        if cnt == 0:
            continue
        mse = sse / cnt
        n_params = p + RAIN_COLS + 1
        aic = cnt * np.log(mse + 1e-12) + 2 * n_params
        aicc = aic + (2 * n_params * (n_params + 1)) / max(cnt - n_params - 1, 1)
        if aicc < best_aicc:
            best_aicc = aicc
            best_p = p
    return best_p


def _apply_flood_peak_boost(forecasts, full_rain, rain_hist_len, reservoir_id):
    if not full_rain or rain_hist_len < 96:
        return forecasts
    if reservoir_id not in FLOOD_RAIN_THRESHOLD:
        return forecasts
    threshold = FLOOD_RAIN_THRESHOLD[reservoir_id]
    rain24h = _sum_rain(full_rain, rain_hist_len - 1, 24)
    if rain24h < threshold:
        return forecasts
    rain3days = _sum_rain(full_rain, rain_hist_len - 1 - 24, 72)
    if rain3days < 80:
        return forecasts
    boost_base = min((rain24h - threshold) / (threshold * 2), 0.20)
    steps = len(forecasts)
    out = []
    for i in range(steps):
        horizon_factor = 0.3 - 0.1 * i / steps
        boost = 1.0 + boost_base * horizon_factor
        out.append(forecasts[i] * boost)
    return out


def _find_analog_shape(flow_history, query_len=12, forecast_len=24, top_k=3):
    n = len(flow_history)
    if n < query_len + forecast_len + 24:
        return None
    flow = list(flow_history)
    query = np.array(flow[n - query_len:])
    q_mean = float(query.mean())
    q_std = float(query.std())
    if q_std < 1e-6:
        return None
    if q_mean > 0 and q_std / q_mean < 0.05:
        return None
    q_norm = (query - q_mean) / q_std

    candidates = []
    search_end = n - query_len - forecast_len - 1
    skip_recent = query_len + forecast_len
    for i in range(search_end - skip_recent):
        seg = np.array(flow[i:i + query_len])
        s_mean = float(seg.mean())
        if q_mean > 10 and (s_mean < q_mean * 0.5 or s_mean > q_mean * 1.5):
            continue
        s_std = float(seg.std())
        if s_std < 1e-6:
            continue
        s_norm = (seg - s_mean) / s_std
        dist = float(np.linalg.norm(q_norm - s_norm))
        candidates.append((i, dist, s_mean, s_std))
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[1])
    top = candidates[:top_k]
    avg_norm_std = float(np.abs(q_norm).mean() + 1)
    if top[0][1] > query_len * avg_norm_std * 0.8:
        return None

    shape = np.zeros(forecast_len)
    w_sum = 0.0
    for (idx, dist, c_mean, c_std) in top:
        w = 1.0 / (dist + 1e-6)
        w_sum += w
        for k in range(forecast_len):
            norm_val = (flow[idx + query_len + k] - c_mean) / c_std
            scaled = norm_val * q_std + q_mean
            shape[k] += w * scaled
    shape /= w_sum

    current = flow[-1]
    gap = current - shape[0]
    for k in range(forecast_len):
        decay = 1.0 - k / forecast_len
        shape[k] += gap * decay

    if current < 10:
        clamp_lo, clamp_hi = 0.0, current + 30.0
    else:
        clamp_lo, clamp_hi = current * 0.5, current * 1.5
    shape = np.clip(shape, clamp_lo, clamp_hi)
    shape = np.clip(shape, 0.0, None)
    return shape.tolist()


def _blend_forecast(arimax_forecast, analog_shape, full_rain, rain_hist_len, reservoir_id):
    if analog_shape is None or len(analog_shape) != len(arimax_forecast):
        return arimax_forecast
    if full_rain is not None and rain_hist_len >= 24 and reservoir_id in FLOOD_RAIN_THRESHOLD:
        rain24h = _sum_rain(full_rain, rain_hist_len - 1, 24)
        flood_gate = FLOOD_RAIN_THRESHOLD[reservoir_id] * 0.7
        if rain24h > flood_gate:
            return arimax_forecast
    steps = len(arimax_forecast)
    out = []
    for i in range(steps):
        w_analog = 0.30 - 0.10 * i / steps
        w_arimax = 1.0 - w_analog
        out.append(w_arimax * arimax_forecast[i] + w_analog * analog_shape[i])
    return out


def forecast_arimax(flow_history, rain_history, rain_forecast, steps, reservoir_id=0):
    flow = [max(0.0, x) for x in flow_history]
    if len(flow) < MIN_FLOW_FOR_FIT:
        return _exp_decay(flow, steps)

    rain_hist = list(rain_history)
    rain_fc = list(rain_forecast)

    diff_flow = [flow[i] - flow[i - 1] for i in range(1, len(flow))]
    best_lag = _find_best_lag(diff_flow, rain_hist)
    p = _find_best_p(flow, diff_flow, rain_hist, best_lag)

    X, Y = _build_design(diff_flow, rain_hist, p, best_lag)
    if X is None:
        return _exp_decay(flow, steps)
    lam = _auto_tune_lambda(X, Y)
    coeffs = _solve_ridge(X, Y, lam)

    last_diffs = [diff_flow[-1 - k] if len(diff_flow) - 1 - k >= 0 else 0.0 for k in range(p)]
    cur = flow[-1]
    forecasts = []
    full_rain = rain_hist + rain_fc

    for i in range(steps):
        time_shift = best_lag - (i + 1)
        if time_shift > 0:
            hist_idx = len(rain_hist) - 1 - time_shift
            rain_in = rain_hist[hist_idx] if 0 <= hist_idx < len(rain_hist) else 0.0
        else:
            fut_idx = abs(time_shift)
            rain_in = rain_fc[fut_idx] if fut_idx < len(rain_fc) else 0.0

        if time_shift > 0:
            abs_rain_idx = len(rain_hist) - 1 - time_shift
        else:
            abs_rain_idx = len(rain_hist) + abs(time_shift)

        nd = sum(coeffs[k] * last_diffs[k] for k in range(p))
        nd += _rain_contribution(coeffs, p, rain_in, full_rain, abs_rain_idx)
        nd += coeffs[p + RAIN_COLS]
        cur += nd
        cur = max(0.0, cur)
        forecasts.append(cur)
        last_diffs.insert(0, nd)
        last_diffs.pop()

    forecasts = _apply_flood_peak_boost(forecasts, full_rain, len(rain_hist), reservoir_id)
    analog = _find_analog_shape(flow, query_len=12, forecast_len=steps, top_k=3)
    forecasts = _blend_forecast(forecasts, analog, full_rain, len(rain_hist), reservoir_id)
    return forecasts


def _exp_decay(flow, steps):
    if not flow:
        return [0.0] * steps
    mean24 = sum(flow[-24:]) / max(len(flow[-24:]), 1)
    out, v = [], flow[-1]
    for _ in range(steps):
        v = 0.7 * v + 0.3 * mean24
        out.append(max(0.0, v))
    return out
