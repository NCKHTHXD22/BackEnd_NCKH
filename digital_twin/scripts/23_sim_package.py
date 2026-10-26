"""Bước 23 – Đóng gói dữ liệu cho chế độ "Mô phỏng diễn biến lũ" trên bản đồ 3D (lộ trình 9.1).

Mọi thứ theo CÙNG trục thời gian giờ của trận (11_event_series.py – bắt đầu trước cửa sổ bản đồ ngập 48 giờ để thấy
mưa → hồ → hạ du):
  lakes     16 hồ: Q đến, Q xả, mực nước, mưa đo theo giờ + chế độ QĐ 1865 (21_qd1865_replay.mjs) cho 5 hồ có quy tắc
  stations  9 trạm KTTV: mực nước giờ đo (20_routing_check.py → station_events/) + mức báo động, tọa độ VNDMS
  rivers    43 đoạn sông (network.geojson, đã giản lược) + lưu lượng giờ từng đoạn (14_hand.py → reach_flows; đoạn núi
            ngoài vùng tính lấy Q tại nút từ 13_routing.py)
  region    mặt nước toàn vùng hạ du mỗi 3 giờ trên lưới 10″ (~300 m) – cho khu người dùng tự dựng
  hoian     mặt nước khu thí điểm Hội An mỗi 3 giờ trên lưới 3″ (~90 m), cao độ theo DEM (cùng hệ với nhà/đường của
            07_hoian.py), cho hai phương án: theo lưu lượng (14) và theo mực nước trạm (19) → file .bin uint16
            (cm + 1000; 0 = không có số liệu); trình duyệt tự tính độ sâu tại từng nhà, đoạn đường, ô mặt nước 3D.
Không có dự báo Q đến lưu trữ cho các trận 2025 (forecast_LSTM bắt đầu 30/3/2026) → không đóng gói dự báo; gói dự báo
theo LSTM cho giờ hiện tại do 26_forecast_package.py tạo (cùng định dạng, phần dùng chung trong sim_common.py).

Đầu ra: web/public/data/dt/sim/<trận>/sim.json, hoian_{flow,stage}.bin, region_{flow,stage}.bin
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/23_sim_package.py   (sau 14, 19, 20, 21)
"""
import json

import numpy as np
import pandas as pd

from sim_common import (COMPUTE, GRIDS, HOIAN, REGION, SIM, WORK, encode_frames, grid_info, lake_entry, r1,
                        river_entries, station_entries)

events = json.loads((COMPUTE / "events.json").read_text(encoding="utf-8"))
replay = json.loads((COMPUTE / "qd1865_replay.json").read_text(encoding="utf-8"))


def resample_frames(npz_path, master0, g):
    """Khung mặt nước lưu ở 14/19 (lưới UTM) → (giờ trên trục chính, bytes uint16 trên lưới địa lý g)."""
    z = np.load(npz_path)
    offset_h = int(round((pd.Timestamp(str(z["time0"])) - master0) / pd.Timedelta(hours=1)))
    return [offset_h + int(t) for t in z["frame_t"]], encode_frames(z["wse"], z["transform"], g)


for key in ("calibration", "validation"):
    name = f"{key}_{events[key]['peak_st2'][:10].replace('-', '')}"
    ev = json.loads((COMPUTE / "events" / f"{name}.json").read_text(encoding="utf-8"))
    times = ev["time"]
    master0 = pd.Timestamp(times[0])
    tindex = {t: i for i, t in enumerate(times)}
    n = len(times)

    # ---------------------------------------------------------------- hồ chứa
    rp = replay["events"].get(name, {})
    lakes = []
    for lid, d in ev["lakes"].items():
        mode = [None] * n
        for row in rp.get(lid, {}).get("timeline", []):
            if row["t"] in tindex:
                mode[tindex[row["t"]]] = row["mode"]
        lakes.append(lake_entry(lid, d["inflow"], d["outflow"], d["water_level"], d["rain"], mode if any(mode) else None))
    lakes.sort(key=lambda l: -max((v or 0) for v in l["q_in"]))
    rain = np.array([[np.nan if v is None else v for v in l["rain"]] for l in lakes], float)
    basin_rain = [r1(v) for v in np.nanmean(rain, 0)]

    # ---------------------------------------------------------------- trạm KTTV, sông
    st = json.loads((COMPUTE / "station_events" / f"{name}.json").read_text(encoding="utf-8"))
    stations = station_entries(st["levels"])
    rt = json.loads((COMPUTE / "routing" / f"{name}.json").read_text(encoding="utf-8"))
    rf = json.loads((WORK / f"reach_flows_{name}.json").read_text(encoding="utf-8"))["reaches"]
    rivers = river_entries(rf, rt["flow"], n)

    # ---------------------------------------------------------------- mặt nước Hội An, toàn vùng
    out_dir = SIM / name
    out_dir.mkdir(parents=True, exist_ok=True)
    grids = {}
    for key2, g in GRIDS.items():
        grids[key2] = {"grid": grid_info(g), "methods": {}}
        for method in ("stage", "flow"):
            p = WORK / f"wse_{key2}_{method}_{name}.npz"
            if not p.exists():
                continue
            hours, blob = resample_frames(p, master0, g)
            (out_dir / f"{key2}_{method}.bin").write_bytes(blob)
            grids[key2]["methods"][method] = {"file": f"{key2}_{method}.bin", "frame_hours": hours}
    hoian = grids["hoian"]

    sim = {
        "event": name, "time": times, "time_zone": "giờ Việt Nam",
        "flood_window": [events[key]["window_start"], events[key]["window_end"]],
        "basin_rain_mm": basin_rain, "lakes": lakes, "stations": stations, "rivers": rivers, "hoian": hoian,
        "region": grids["region"],
        "notes": ["Số liệu đo xem lại – chưa có dự báo Q đến lưu trữ cho trận này (cần chạy dự báo ngược)",
                  "Mưa: trung bình các điểm đo tại hồ (mm/giờ)"],
    }
    (out_dir / "sim.json").write_text(json.dumps(sim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = sum(p.stat().st_size for p in out_dir.iterdir()) / 1e6
    print(f"{name}: {n} giờ, {len(lakes)} hồ, {len(stations)} trạm, {len(rivers)} đoạn sông, "
          f"Hội An {HOIAN['nx']}×{HOIAN['ny']} ô, toàn vùng {REGION['nx']}×{REGION['ny']} ô × {[len(v['frame_hours']) for v in hoian['methods'].values()]} khung, {size:.1f} MB → {out_dir}")
