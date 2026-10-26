"""Bước 26 – Dự báo diễn biến lũ 24 giờ tới theo LSTM: hồ → sông → trạm → ngập (HAND theo mực nước), đóng gói như chế
độ mô phỏng (23) để chạy trên bản đồ 3D (lộ trình 3.3, 7.1 bản đầu, 9.1).

Đầu vào (chỉ ĐỌC API production): /inflowLake, /inflowlake-history/<hồ> (48 giờ đo gần nhất: Q đến, Q xả, mực nước),
/forecast-lstm/<hồ> (lần chạy LSTM mới nhất – p10/p50/p90, 12 giờ), /lake-specs/<hồ>/zv-curve (hồ có bảng Z-V); mưa giờ
Open-Meteo tại các hồ (mô hình thời tiết: giờ đã qua + dự báo – cùng nguồn mưa dự báo LSTM dùng).
Chuỗi:
  1) Q đến: số đo đến giờ phát báo t0; sau t0 theo LSTM (P50 kỳ vọng, P90 kịch bản cao); hết tầm LSTM thì GIỮ bằng giờ
     cuối của LSTM tới +HORIZON_H (để thấy lũ truyền tiếp về hạ du – phần này không phải dự báo của mô hình).
  2) Q xả (GIẢ ĐỊNH – chưa theo QĐ 1865 vì quy trình cần mực nước trạm thời gian thực): giữ Q xả lúc t0; hồ có bảng Z-V tính
     mực nước theo cân bằng nước, chạm MNDBT thì xả bằng Q đến; hồ chưa có Z-V (hồ nhỏ) Q xả = Q đến.
  3) Diễn toán Muskingum-Cunge (13_routing.run_event, tập hồ tin cậy theo trận hiệu chỉnh); khu giữa theo mô-đun dòng
     chảy hồ đầu nguồn → dự báo LSTM của Sông Tranh 2, A Vương, Đắk Mi 3 cũng là dự báo dòng chảy khu giữa.
  4) Mực nước trạm (forecast_core): H = a + b·Q^c; Câu Lâu, Hội An, Cẩm Lệ hồi quy theo Giao Thủy, Ái Nghĩa + triều. KHÔNG
     neo theo số đo – chưa có mực nước giờ thời gian thực trạm KTTV → giữ nguyên sai số hệ thống của quan hệ H–Q; khi nước
     thấp không cho thấp hơn P5 chuỗi đo của trạm (quan hệ dựng trên trận lũ ngoại suy kém).
  5) Ngập: mặt nước nội suy từ 6 trạm → độ sâu (stage_map, lệch mặt chuẩn hiệu chỉnh ở bước 19) mỗi giờ.
Hiển thị từ SHOW_PAST_H giờ trước t0 (đo + diễn toán) tới t0 + HORIZON_H.

Đầu ra: web/public/data/dt/sim/forecast_<p50|p90>/ (sim.json, *_stage.bin – định dạng 23),
        web/public/data/dt/flood_forecast/forecast_<p50|p90>/ (meta.json + ảnh độ sâu mỗi giờ – định dạng 19),
        data/compute/forecast_latest.json (tóm tắt)
Chạy:   PYTHONUTF8=1 digital_twin/.venv/Scripts/python digital_twin/scripts/26_forecast_package.py
"""
import importlib
import json

import numpy as np
import pandas as pd
import requests
from affine import Affine

import network_flows
import stage_map as sm
from config import OUT as WEB_OUT, block_mean, hoian_window
from forecast_core import COMPUTE, RATING, ROUTED, SHIFT, calibration_tidal, design, load_event, lv, rating, tide
from sim_common import (GRIDS, NODES, SIM, SPEC, encode_frames, grid_info, lake_entry, r1, river_entries,
                        station_entries)

r13 = importlib.import_module("13_routing")

API = "https://nckh.dxvtech.vn/api"
HIST_H, SHOW_PAST_H, HORIZON_H = 48, 12, 24
SCENARIOS = {"p50": ("qvao_forecast", "kỳ vọng (P50)"), "p90": ("p90", "kịch bản cao (P90)")}
FLOOD_OUT = WEB_OUT / "flood_forecast"
WET_M = 0.05
LOW_PCT = 0.05                   # mức sàn mực nước trạm (xem LOW)
VOL_PER_HOUR = 3600 / 1e6        # m³/s trong 1 giờ → triệu m³


def get(path):
    r = requests.get(f"{API}{path}", timeout=60)
    r.raise_for_status()
    return r.json()


def vn(ts):
    return pd.to_datetime(ts, utc=True).dt.tz_convert("Asia/Ho_Chi_Minh").dt.tz_localize(None)


# ------------------------------------------------------------------ số liệu hồ: đo 48 giờ + LSTM
lakes_now = {int(l["Id_Lake"]): l for l in get("/inflowLake")}
hist, lstm, zv = {}, {}, {}
for rid in sorted(lakes_now):
    h = pd.DataFrame(get(f"/inflowlake-history/{rid}"))
    if h.empty:
        continue
    h["t"] = vn(h.timestamp).dt.floor("h")
    hist[rid] = h.drop_duplicates("t").set_index("t").sort_index()
    f = pd.DataFrame(get(f"/forecast-lstm/{rid}"))
    if not f.empty:
        f = f[f.generatedAt == f.generatedAt.max()].copy()
        f["t"] = vn(f.forecastTime)
        lstm[rid] = f.set_index("t").sort_index()
    try:
        pts = get(f"/lake-specs/{rid}/zv-curve").get("points")
        if pts:
            zv[rid] = (np.array([p["z"] for p in pts], float), np.array([p["volume"] for p in pts], float))
    except requests.HTTPError:
        pass                                          # hồ chưa có bảng Z-V
# Giờ phát báo = giờ đo mới nhất trong các hồ. Hồ cập nhật chậm hơn (nhiều hồ chỉ có số liệu 6 giờ/lần) dùng LSTM của
# chính hồ đó – LSTM chạy từ giờ đo cuối của từng hồ – cho các giờ từ số đo cuối tới t0.
last_obs = {rid: h.index.max() for rid, h in hist.items()}
t0 = max(last_obs.values())
idx = pd.date_range(t0 - pd.Timedelta(hours=HIST_H), t0 + pd.Timedelta(hours=HORIZON_H), freq="h")
i0, n = HIST_H, len(idx)
print(f"Phát báo {t0} – {len(hist)} hồ có số đo (giờ đo cuối {min(last_obs.values())} … {t0}), {len(lstm)} hồ có LSTM, "
      f"{len(zv)} hồ có bảng Z-V")

# ------------------------------------------------------------------ mưa Open-Meteo tại các hồ (mm/giờ)
lake_ids = sorted(hist)
pos = [(NODES[f"HO-{rid}"]["lat"], NODES[f"HO-{rid}"]["lon"]) for rid in lake_ids]
om = requests.get("https://api.open-meteo.com/v1/forecast", timeout=60, params={
    "latitude": ",".join(f"{a:.4f}" for a, _ in pos), "longitude": ",".join(f"{b:.4f}" for _, b in pos),
    "hourly": "precipitation", "past_days": 3, "forecast_days": 2, "timezone": "Asia/Bangkok"}).json()
om = om if isinstance(om, list) else [om]
rain = {rid: pd.Series(d["hourly"]["precipitation"], index=pd.to_datetime(d["hourly"]["time"]), dtype=float).reindex(idx)
        for rid, d in zip(lake_ids, om)}


def observed_series(rid, col):
    """Số đo trên trục idx tới giờ đo cuối của hồ (nội suy thẳng qua chỗ thưa, đầu cửa sổ lấy giá trị đầu tiên); NaN sau đó."""
    s = hist[rid][col].astype(float)
    s = s.reindex(s.index.union(idx)).interpolate("time", limit_area="inside").reindex(idx)
    s[idx <= last_obs[rid]] = s[idx <= last_obs[rid]].bfill()
    return s.to_numpy(copy=True)


def operate(rid, q_in, q_out0, h0):
    """Q xả, mực nước sau giờ đo cuối theo quy tắc giả định (xem đầu file)."""
    m = len(q_in)
    sp = SPEC.get(rid, {})
    if rid not in zv or h0 is None or not np.isfinite(h0) or q_out0 is None or not np.isfinite(q_out0):
        return np.asarray(q_in, float), np.full(m, np.nan)
    z, vol = zv[rid]
    v = float(np.interp(h0, z, vol))
    mndbt = sp.get("MNDBT") or np.inf
    outs, hs = np.empty(m), np.empty(m)
    for k, q in enumerate(q_in):
        level = float(np.interp(v, vol, z))
        out = max(q_out0, q) if level >= mndbt else q_out0
        v = max(v + (q - out) * VOL_PER_HOUR, 0.0)
        outs[k], hs[k] = out, float(np.interp(v, vol, z))
    return outs, hs


# Quan hệ H–Q dựng trên trận lũ ngoại suy kém khi nước thấp (Câu Lâu ra −1,4 m) → không thấp hơn mức thấp thường gặp
# (P5 chuỗi đo 2002–2025) của trạm
LOW = lv.groupby("station_code").level_m.quantile(LOW_PCT).to_dict()
mass = r13.run_event(load_event("calibration"))["mass_balance"]            # tập hồ tin cậy như bước 13
tidal = calibration_tidal()
td = tide(idx)
net_edges = [e for e in json.loads((COMPUTE / "network.json").read_text(encoding="utf-8"))["edges"] if e["source"] in ("d8", "osm")]
s0 = i0 - SHOW_PAST_H                                                      # giờ đầu hiển thị
shown = idx[s0:]
hw, hw_t = hoian_window(sm.T * Affine.translation(sm.c0, sm.r0), (sm.vh, sm.vw))
region_t = np.array(sm.T * Affine.translation(sm.c0, sm.r0) * Affine.scale(10))[:6]
summary = {"issue_time": t0.isoformat(), "model": "LSTM (production, /forecast-lstm)", "horizon_h": HORIZON_H, "scenarios": {}}

for scen, (col, scen_label) in SCENARIOS.items():
    lakes_ev, lakes_out, lstm_meta = {}, [], {}
    for rid in lake_ids:
        Q_in, Q_out, H = (observed_series(rid, c) for c in ("qvao", "luuluongxa", "htl"))
        j = int(np.flatnonzero(idx <= last_obs[rid])[-1])                 # giờ đo cuối của hồ trên trục idx
        f = lstm.get(rid)
        fut = np.full(n - j - 1, np.nan)
        if f is not None:
            vals = f[col].reindex(idx[j + 1:]).to_numpy(float)
            ok = np.isfinite(vals)
            if ok.any():
                last = np.flatnonzero(ok)[-1]
                fut = np.where(ok, vals, np.nan)
                fut[last + 1:] = vals[last]                                  # ngoài tầm LSTM: giữ giờ cuối
            lstm_meta[rid] = {"generated_at": str(f.generatedAt.iloc[0]), "last_obs": last_obs[rid].isoformat(),
                              "model_hours_after_issue": int(np.isfinite(f[col].reindex(idx[i0 + 1:]).to_numpy(float)).sum())}
        fut = np.where(np.isfinite(fut), fut, Q_in[j])                       # không có LSTM: giữ Q đến đo cuối
        q_out_f, h_f = operate(rid, fut, Q_out[j], H[j])
        Q_in[j + 1:], Q_out[j + 1:], H[j + 1:] = fut, q_out_f, h_f
        R = rain[rid].to_numpy()
        tolist = lambda a: [None if not np.isfinite(x) else float(x) for x in a]
        lakes_ev[str(rid)] = {"inflow": tolist(Q_in), "outflow": tolist(Q_out), "water_level": tolist(H), "rain": tolist(R),
                              "real_inflow": [True] * n, "real_outflow": [True] * n, "real_water_level": [True] * n}
        lakes_out.append(lake_entry(rid, Q_in[s0:], Q_out[s0:], H[s0:], R[s0:]))
    lakes_out.sort(key=lambda l: -max((v or 0) for v in l["q_in"]))

    # ---- diễn toán → lưu lượng nút, đoạn sông → mực nước trạm
    ev = {"event": f"forecast_{scen}", "time": [t.isoformat() for t in idx], "lakes": lakes_ev}
    flow = {k: np.asarray(v, float) for k, v in r13.run_event(ev, mass=mass)["flow"].items()}
    levels = {code: np.maximum(rating(flow[node], *RATING[code]), LOW[code]) for code, node in ROUTED.items()}
    lv_df = pd.DataFrame(levels, index=idx)
    for tgt, m in tidal.items():
        levels[tgt] = np.maximum(design(lv_df[m["inputs"]], td, m["lag_h"]).to_numpy() @ m["beta"], LOW[tgt])
    reach_q, _ = network_flows.reach_flows(flow, n, NODES, net_edges)
    reach_q = {f"{a}|{b}": v[s0:] for (a, b), v in reach_q.items()}

    # ---- bản đồ ngập mỗi giờ (cửa sổ hiển thị)
    flood_dir, sim_dir = FLOOD_OUT / f"forecast_{scen}", SIM / f"forecast_{scen}"
    for d in (flood_dir, sim_dir):
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("*.png"):
            old.unlink()
    frames, hoian_w, region_w, dmax = [], [], [], None
    for j, t in enumerate(shown):
        i = s0 + j
        row = np.array([levels[c][i] if c in levels else np.nan for c in sm.codes], float)
        wse = sm.wse_field(row)
        depth = sm.depth_of(wse, SHIFT)
        if i >= i0:
            dmax = depth if dmax is None else np.maximum(dmax, depth)
        fn = f"t{j:03d}.png"
        sm.save_png(depth, flood_dir / fn)
        frames.append({"t": j, "time": t.isoformat(), "file": fn, "lead_h": i - i0,
                       "area_km2": round(float((depth > WET_M).sum()) * 900 / 1e6, 1), "max_depth_m": round(float(depth.max()), 2),
                       "levels_m": {c: r1(levels[c][i]) for c in levels}})
        hoian_w.append((wse[hw] + SHIFT).astype(np.float32))
        region_w.append(block_mean(wse + SHIFT, 10))
    sm.save_png(dmax, flood_dir / "max.png")
    fc_info = {"issue_time": t0.isoformat(), "issue_index": SHOW_PAST_H, "model": "LSTM", "scenario": scen,
               "scenario_label": scen_label, "horizon_h": HORIZON_H,
               # LSTM chạy từ giờ đo cuối của từng hồ → tầm còn lại sau t0 khác nhau giữa các hồ
               "model_horizon_h": max((m["model_hours_after_issue"] for m in lstm_meta.values()), default=0),
               "model_horizon_min_h": min((m["model_hours_after_issue"] for m in lstm_meta.values()), default=0),
               "lakes_with_lstm": sorted(lstm_meta), "lstm_runs": lstm_meta}
    peaks = {c: r1(np.nanmax(levels[c][i0:])) for c in levels}
    meta = {
        "event": f"forecast_{scen}",
        "method": "Dự báo: Q đến LSTM → Q xả giả định → diễn toán → mực nước trạm suy từ Q → HAND theo mực nước",
        "bounds": sm.view_bounds, "frames": frames, "frame_every_h": 1, "forecast": fc_info,
        "max": {"file": "max.png", "area_km2": round(float((dmax > WET_M).sum()) * 900 / 1e6, 1), "max_depth_m": round(float(dmax.max()), 2)},
        "station_peaks_m": peaks, "datum_shift_m": SHIFT,
        "assumptions": [f"Q đến: LSTM {scen_label}; sau tầm LSTM giữ bằng giờ cuối",
                        "Q xả: giữ Q xả lúc phát báo, hồ có bảng Z-V chạm MNDBT thì xả bằng Q đến, hồ nhỏ Q xả = Q đến (chưa theo QĐ 1865)",
                        "Mực nước trạm suy từ Q (quan hệ H–Q trận 10/2025), chưa neo theo số đo – sai số ±1–2 m khi nước thấp; "
                        "không thấp hơn mức thấp thường gặp (P5 chuỗi đo 2002–2025) của trạm",
                        "Mưa: Open-Meteo (mô hình thời tiết) tại vị trí hồ",
                        f"Bản đồ: HAND theo mực nước trạm, lệch mặt chuẩn {SHIFT:+.1f} m (bước 19); không đê, cống"],
    }
    (flood_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- gói mô phỏng (định dạng 23)
    m_shown = len(shown)
    grids = {}
    for key, frames_w, tr in (("hoian", hoian_w, np.array(hw_t)[:6]), ("region", region_w, region_t)):
        (sim_dir / f"{key}_stage.bin").write_bytes(encode_frames(np.stack(frames_w), tr, GRIDS[key]))
        grids[key] = {"grid": grid_info(GRIDS[key]),
                      "methods": {"stage": {"file": f"{key}_stage.bin", "frame_hours": list(range(m_shown))}}}
    rain_m = np.array([[np.nan if v is None else v for v in l["rain"]] for l in lakes_out], float)
    sim = {
        "event": f"forecast_{scen}", "time": [t.isoformat() for t in shown], "time_zone": "giờ Việt Nam",
        "flood_window": [shown[0].isoformat(), shown[-1].isoformat()], "forecast": fc_info,
        "basin_rain_mm": [r1(v) for v in np.nanmean(rain_m, 0)], "lakes": lakes_out,
        "stations": station_entries({c: [r1(v) for v in levels[c][s0:]] for c in levels}),
        "rivers": river_entries(reach_q, {k: v[s0:] for k, v in flow.items()}, m_shown),
        "hoian": grids["hoian"], "region": grids["region"],
        "notes": meta["assumptions"],
    }
    (sim_dir / "sim.json").write_text(json.dumps(sim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    summary["scenarios"][scen] = {
        "label": scen_label, "station_peaks_m": peaks, "flood_peak_km2": meta["max"]["area_km2"],
        "lake_inflow_peak": {l["name"]: max((v or 0) for v in l["q_in"][SHOW_PAST_H:]) for l in lakes_out},
    }
    size = sum(p.stat().st_size for p in [*sim_dir.iterdir(), *flood_dir.iterdir()]) / 1e6
    print(f"{scen}: {m_shown} giờ ({SHOW_PAST_H} đã qua + {HORIZON_H} tới), LSTM {fc_info['model_horizon_min_h']}–{fc_info['model_horizon_h']} giờ sau phát báo, "
          f"ngập lớn nhất {meta['max']['area_km2']} km², đỉnh trạm {peaks}, {size:.1f} MB")

(COMPUTE / "forecast_latest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
print("Ghi data/compute/forecast_latest.json")
