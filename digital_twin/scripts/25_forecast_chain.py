"""Bước 25 – Chuỗi dự báo thượng nguồn → hạ du: dự báo ngược (hindcast) trên hai trận 2025 (lộ trình 3.3, 5.1, 6.1).

Câu hỏi: đứng ở giờ t0 trong trận lũ, chuỗi hồ → diễn toán → mực nước trạm → vùng ngập dự báo 1–24 giờ tới tốt đến đâu,
và sai số nằm ở thượng nguồn hay hạ du?

Tại mỗi giờ phát báo t0 (EVERY_H giờ một lần trong cửa sổ trận) chỉ dùng số đo đến t0, cộng một KỊCH BẢN THƯỢNG NGUỒN cho
t0+1…t0+LEAD_H:
  perfect – Q đến, Q xả các hồ tương lai = số đo thật ("biết trước thượng nguồn"): cận trên của phần hạ du khi dự báo Q đến
            (LSTM/XGBoost/ARIMAX) và quyết định vận hành hồ đều đúng. Khu giữa vẫn theo mô-đun dòng chảy hồ đầu nguồn
            (bước 13) → dự báo Q đến các hồ đầu nguồn cũng là dự báo dòng chảy khu giữa.
  hold_up – Q đến, Q xả giữ bằng giá trị lúc t0: chỉ còn lợi thế thời gian truyền lũ từ đập về trạm.
  persist – H(t0+k) = H đo lúc t0: mốc tối thiểu – chuỗi phải hơn mốc này mới có ích.
Hạ du:
  - Nông Sơn, Giao Thủy, Thành Mỹ, Ái Nghĩa: Q diễn toán (13_routing.run_event) → H = a + b·Q^c (bước 20, dựng trên trận
    hiệu chỉnh) → NEO theo số đo lúc t0: H(t0+k) = H_đo(t0) + [H_mh(t0+k) − H_mh(t0)] (khử sai số hệ thống của quan hệ H–Q).
  - Câu Lâu, Hội An, Cẩm Lệ (triều + phân lưu, mạng diễn toán chưa tới): hồi quy tuyến tính dựng trên trận hiệu chỉnh theo
    mực nước Giao Thủy, Ái Nghĩa trễ L giờ (L tìm tốt nhất 0–MAX_LAG) + triều thiên văn Sơn Trà (bước 18); đầu vào sau t0
    lấy từ dự báo của trạm thượng lưu; neo như trên.
  - Vùng ngập: mực nước 6 trạm → stage_map (bước 19, lệch mặt chuẩn hiệu chỉnh) – so với bản đồ dựng từ mực nước ĐO cùng
    thời điểm (tách sai số dự báo khỏi sai số của phương pháp bản đồ, đã kiểm định riêng ở bước 19).
Trận 10/2025 là TRONG MẪU (quan hệ H–Q, hồi quy, lệch mặt chuẩn dựng trên trận này); trận 11/2025 là kiểm định độc lập.
Số đo trạm không nội suy khi chấm điểm; đầu vào trước t0 chỉ lấp lỗ ≤ FILL_H giờ bằng giá trị trước đó (không nhìn trước).

Đầu ra: data/compute/forecast_chain.json
Chạy:   PYTHONUTF8=1 digital_twin/.venv/Scripts/python digital_twin/scripts/25_forecast_chain.py   (sau 13, 17, 18, 19, 20)
"""
import importlib
import json
import pickle

import numpy as np
import pandas as pd
import utide

from config import ROOT, WORK
import stage_map as sm

r13 = importlib.import_module("13_routing")

COMPUTE = ROOT / "data" / "compute"
LEAD_H, EVERY_H, MAX_LAG, FILL_H = 24, 3, 12, 3
REPORT_LEADS = [1, 3, 6, 12, 18, 24]
MAP_LEADS = [0, 6, 12, 18, 24]
MAP_ISSUE_BEFORE_PEAK_H = 12          # bản đồ dự báo phát lúc 12 giờ trước đỉnh Giao Thủy
WET_M = 0.1
SCENARIOS = ["perfect", "hold_up", "persist"]
ROUTED = {"NONGSON": "ST-NONGSON", "GIAOTHUY": "ST-GIAOTHUY", "THANHMY": "ST-THANHMY", "AINGHIA": "J-VUGIA-END"}
TIDAL = {"CAULAU": ["GIAOTHUY", "AINGHIA"], "HOIAN": ["GIAOTHUY", "AINGHIA"], "CAMLE": ["AINGHIA", "GIAOTHUY"]}
STATIONS = [*ROUTED, *TIDAL]

EVENTS = json.loads((COMPUTE / "events.json").read_text(encoding="utf-8"))
NAMES = {k: f"{k}_{EVENTS[k]['peak_st2'][:10].replace('-', '')}" for k in ("calibration", "validation")}
RATING = {c: v["rating_H=a+b*Q^c"] for c, v in
          json.loads((COMPUTE / "routing_check.json").read_text(encoding="utf-8"))["stations"].items()}
SHIFT = json.loads((COMPUTE / "hand_stage_calibration.json").read_text(encoding="utf-8"))["value"]
lv = pd.read_parquet(WORK / "station_levels_hourly.parquet")
lv = lv[(lv.qc_flag == "ok") & lv.station_code.isin(STATIONS)]
with open(WORK / "tide_sontra_coef.pkl", "rb") as f:
    TIDE = pickle.load(f)


def rating(q, a, b, c):
    return a + b * np.power(np.maximum(q, 1.0), c)


def observed(idx):
    cols = {}
    for code in STATIONS:
        s = lv[lv.station_code == code].drop_duplicates("t_vn").set_index("t_vn").level_m.sort_index()
        cols[code] = s.reindex(idx)
    return pd.DataFrame(cols, index=idx)


def tide(idx):
    return pd.Series(utide.reconstruct((idx - pd.Timedelta(hours=7)).to_pydatetime(), TIDE, verbose=False).h, index=idx)


def design(inputs, td, lag):
    """Ma trận hồi quy: mực nước trạm thượng lưu trễ `lag` giờ + triều + hằng số."""
    return pd.concat([inputs.shift(lag), td.rename("tide")], axis=1).assign(one=1.0)


def fit_tidal(obs, td):
    out = {}
    for tgt, ups in TIDAL.items():
        best = None
        for lag in range(MAX_LAG + 1):
            X = design(obs[ups], td, lag)
            d = pd.concat([X, obs[tgt].rename("y")], axis=1).dropna()
            beta = np.linalg.lstsq(d[X.columns].to_numpy(), d.y.to_numpy(), rcond=None)[0]
            r2 = 1 - float(((d.y - d[X.columns].to_numpy() @ beta) ** 2).sum() / ((d.y - d.y.mean()) ** 2).sum())
            if best is None or r2 > best["r2"]:
                best = {"inputs": ups, "lag_h": lag, "coef": dict(zip(X.columns, np.round(beta, 4).tolist())),
                        "beta": beta, "r2": round(r2, 3), "n": len(d)}
        out[tgt] = best
    return out


def scenario_event(ev, i0, n, scenario):
    """Đầu vào diễn toán đến giờ n−1: số đo đến t0, sau t0 theo kịch bản. real_outflow giữ nguyên cả trận để quyết định
    "dùng Q xả đo hay coi như chảy qua" của bước 13 không đổi theo giờ phát báo."""
    lakes = {}
    for rid, d in ev["lakes"].items():
        dd = {k: (v if k == "real_outflow" else v[:n]) for k, v in d.items()}
        for k in ("inflow", "outflow", "rain"):
            v = list(d[k][:n])
            if scenario == "hold_up":
                last = next((x for x in reversed(d[k][: i0 + 1]) if x is not None), None)
                v = v[: i0 + 1] + [last] * (n - i0 - 1)
            dd[k] = v
        lakes[rid] = dd
    return {**ev, "time": ev["time"][:n], "lakes": lakes}


def forecast(ev, mass, obs_past, td, i0, scenario, tidal):
    """Mực nước dự báo các trạm cho t0…t0+LEAD_H (phần tử 0 = lúc t0, đã neo về số đo)."""
    n = min(i0 + LEAD_H + 1, len(ev["time"]))
    h0 = obs_past.iloc[i0]
    fc = {}
    if scenario == "persist":
        return {c: np.full(n - i0, h0[c]) for c in STATIONS if np.isfinite(h0[c])}
    flow = r13.run_event(scenario_event(ev, i0, n, scenario), mass=mass)["flow"]
    for code, node in ROUTED.items():
        hm = rating(np.asarray(flow[node], float), *RATING[code])
        if np.isfinite(h0[code]):
            fc[code] = h0[code] + hm[i0:n] - hm[i0]
    for tgt, m in tidal.items():
        inp = obs_past[m["inputs"]].iloc[:n].copy()
        for c in m["inputs"]:
            inp.iloc[i0 + 1:, inp.columns.get_loc(c)] = fc[c][1:] if c in fc else np.nan
        f = design(inp, td.iloc[:n], m["lag_h"]).to_numpy() @ m["beta"]
        if np.isfinite(h0[tgt]) and np.isfinite(f[i0]):
            fc[tgt] = h0[tgt] + f[i0:n] - f[i0]
    return fc


def stage_row(levels):
    """Một hàng mực nước theo thứ tự trạm của stage_map (thiếu → NaN, trạm khác tự bù bằng IDW)."""
    return np.array([levels.get(c, np.nan) for c in sm.codes], float)


def wet_mask(levels):
    return sm.depth_of(sm.wse_field(stage_row(levels)), SHIFT) > WET_M


report = {"method": __doc__.split("\n\n")[1].strip(), "events": NAMES, "lead_h": LEAD_H, "issue_every_h": EVERY_H,
          "datum_shift_m": SHIFT, "rating_from_step20": {c: RATING[c] for c in ROUTED}}
cal_ev = json.loads((COMPUTE / "events" / f"{NAMES['calibration']}.json").read_text(encoding="utf-8"))
cal_idx = pd.DatetimeIndex(pd.to_datetime(cal_ev["time"]))
tidal = fit_tidal(observed(cal_idx), tide(cal_idx))
report["tidal_regression"] = {k: {kk: vv for kk, vv in v.items() if kk != "beta"} for k, v in tidal.items()}
for k, v in tidal.items():
    print(f"Hồi quy {k}: trễ {v['lag_h']} giờ, R² {v['r2']}, hệ số {v['coef']}")

report["skill"], report["flood_map"] = {}, {}
for key, name in NAMES.items():
    ev = json.loads((COMPUTE / "events" / f"{name}.json").read_text(encoding="utf-8"))
    idx = pd.DatetimeIndex(pd.to_datetime(ev["time"]))
    obs, td = observed(idx), tide(idx)
    obs_past = obs.ffill(limit=FILL_H)                 # chỉ lấp bằng giá trị trước đó – không nhìn trước
    mass = r13.run_event(ev)["mass_balance"]
    w0, w1 = pd.Timestamp(EVENTS[key]["window_start"]), pd.Timestamp(EVENTS[key]["window_end"])
    issues = [i for i, t in enumerate(idx) if w0 <= t <= w1 - pd.Timedelta(hours=LEAD_H) and (t - w0).total_seconds() % (EVERY_H * 3600) == 0]
    errs = {s: {c: {k: [] for k in range(1, LEAD_H + 1)} for c in STATIONS} for s in SCENARIOS}
    peak_err = {s: {c: [] for c in STATIONS} for s in SCENARIOS}
    for i0 in issues:
        for s in SCENARIOS:
            fc = forecast(ev, mass, obs_past, td, i0, s, tidal)
            for c, v in fc.items():
                for k in range(1, len(v)):
                    o = obs[c].iloc[i0 + k]
                    if np.isfinite(o) and np.isfinite(v[k]):
                        errs[s][c][k].append(float(v[k] - o))
                o_win = obs[c].iloc[i0 + 1: i0 + len(v)]
                if o_win.notna().sum() >= LEAD_H * 0.75:           # sai số đỉnh trong cửa sổ dự báo
                    peak_err[s][c].append(float(np.nanmax(v[1:]) - o_win.max()))
    sk = {}
    for c in STATIONS:
        rows = {}
        for k in REPORT_LEADS:
            mae = {s: float(np.mean(np.abs(errs[s][c][k]))) if errs[s][c][k] else None for s in SCENARIOS}
            rows[f"+{k}h"] = {
                **{f"mae_{s}_m": None if mae[s] is None else round(mae[s], 3) for s in SCENARIOS},
                **{f"bias_{s}_m": round(float(np.mean(errs[s][c][k])), 3) if errs[s][c][k] else None for s in ("perfect", "hold_up")},
                **{f"skill_{s}": None if not mae[s] or not mae["persist"] else round(1 - mae[s] / mae["persist"], 2)
                   for s in ("perfect", "hold_up")},
                "n": len(errs["persist"][c][k]),
            }
        rows["window_peak_mae_m"] = {s: round(float(np.mean(np.abs(peak_err[s][c]))), 3) if peak_err[s][c] else None for s in SCENARIOS}
        sk[c] = rows
    report["skill"][key] = {"issues": len(issues), "first_issue": str(idx[issues[0]]), "last_issue": str(idx[issues[-1]]),
                            "in_sample": key == "calibration", "stations": sk}
    print(f"\n=== {name}: {len(issues)} lần phát báo – MAE (m) perfect / hold_up / persist")
    for c in STATIONS:
        cells = "  ".join(f"+{k:>2d}h {sk[c][f'+{k}h']['mae_perfect_m'] or float('nan'):.2f}/"
                          f"{sk[c][f'+{k}h']['mae_hold_up_m'] or float('nan'):.2f}/{sk[c][f'+{k}h']['mae_persist_m'] or float('nan'):.2f}"
                          for k in (3, 6, 12, 24))
        print(f"  {c:9s} {cells}")

    # ---- bản đồ ngập dự báo phát lúc MAP_ISSUE_BEFORE_PEAK_H giờ trước đỉnh Giao Thủy, so với bản đồ từ mực nước đo
    win = obs.GIAOTHUY[(idx >= w0) & (idx <= w1)]
    i_pk = idx.get_loc(win.idxmax())
    i0 = i_pk - MAP_ISSUE_BEFORE_PEAK_H
    obs_map = obs.interpolate(limit=sm.GAP_H, limit_area="inside")        # bản đồ "đo" như bước 19
    maps = {}
    fcs = {s: forecast(ev, mass, obs_past, td, i0, s, tidal) for s in SCENARIOS}
    for k in MAP_LEADS:
        ref = wet_mask({c: obs_map[c].iloc[i0 + k] for c in sm.codes if c in obs_map})
        row = {"valid_time": str(idx[i0 + k]), "wet_km2_observed_levels": round(float(ref.sum()) * 900 / 1e6, 1)}
        for s, fc in fcs.items():
            levels = {c: fc[c][k] for c in sm.codes if c in fc and k < len(fc[c])}
            m = wet_mask(levels)
            hit, miss, fa = int((m & ref).sum()), int((~m & ref).sum()), int((m & ~ref).sum())
            row[s] = {"wet_km2": round(float(m.sum()) * 900 / 1e6, 1),
                      "csi": round(hit / max(hit + miss + fa, 1), 3), "far": round(fa / max(hit + fa, 1), 3)}
        maps[f"+{k}h"] = row
    report["flood_map"][key] = {"issue_time": str(idx[i0]), "peak_giaothuy": str(idx[i_pk]), "leads": maps}
    print(f"  Bản đồ phát lúc {idx[i0]} (đỉnh Giao Thủy {idx[i_pk]}):")
    for k, r in maps.items():
        print(f"    {k:>5s} ngập theo mực nước đo {r['wet_km2_observed_levels']:6.1f} km² | " +
              " | ".join(f"{s} {r[s]['wet_km2']:6.1f} km² CSI {r[s]['csi']:.2f}" for s in SCENARIOS))

report["notes"] = [
    "Chưa có lưu trữ dự báo Q đến cho các trận 2025 (forecast_LSTM/forecast_XGB lưu từ 30/3/2026) → chưa chấm được chuỗi với "
    "dự báo thật; 'perfect' là cận trên, 'hold_up' là cận dưới của phần thượng nguồn.",
    "Quan hệ H–Q bước 20 chạm biên a = −10 khi tìm tham số – dạng đường cong chưa có ý nghĩa vật lý; neo theo số đo lúc t0 làm "
    "giảm ảnh hưởng nhưng cần quan hệ H–Q chính thức của trạm.",
    "Vận hành thời gian thực cần mực nước giờ 6 trạm KTTV lúc phát báo – pctt.danang.gov.vn hiện chỉ công bố ngưỡng (xem "
    "pcttHydro.service.js); chưa có nguồn công khai.",
]
(COMPUTE / "forecast_chain.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
print("\nGhi data/compute/forecast_chain.json")
