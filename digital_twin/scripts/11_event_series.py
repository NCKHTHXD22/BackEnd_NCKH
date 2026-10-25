"""Bước 11 – Xuất chuỗi giờ của các trận lũ thử cho mọi hồ (đầu vào cho kiểm chứng hồ chứa 4.1, diễn toán 5.1).

Đầu vào : data/compute/events.json (bước 9), Documents/Data_Sach_16Ho/parquet
Đầu ra  : data/compute/events/<trận>.json – { lake_id: { time[], inflow[], outflow[], water_level[], rain[],
          real_inflow[], real_outflow[], real_wl[] } }
          Giá trị = bản sau QC (*_qc), chỗ trống nội suy theo thời gian; real_* = 1 nếu giờ đó là số liệu thật.
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/11_event_series.py
"""
import json
import re
import subprocess

import pandas as pd

from config import ROOT

SRC = ROOT.parent / "Documents" / "Data_Sach_16Ho" / "parquet"
COMPUTE = ROOT / "data" / "compute"
OUT = COMPUTE / "events"
OUT.mkdir(parents=True, exist_ok=True)
PAD_H = 48   # thêm 2 ngày trước cửa sổ trận để có trạng thái đầu ổn định cho diễn toán

events = json.loads((COMPUTE / "events.json").read_text(encoding="utf-8"))
# Giới hạn mực nước hợp lý theo thông số QĐ 1865 (MNC − 30 m … đỉnh đập + 5 m): loại giá trị mất chữ số (vd. 59,06 thay 590,6)
SPECS = {s["lake_id"]: s for s in json.loads(subprocess.run(
    ["node", "--input-type=module", "-e", "import('./src/script/lakeSpecsData.js').then(m => console.log(JSON.stringify(m.LAKE_SPECS)))"],
    cwd=ROOT.parent, capture_output=True, text=True, check=True).stdout)}
lakes = {}
for f in sorted(SRC.glob("rid_*.parquet")):
    rid = int(re.match(r"rid_(\d+)_", f.name).group(1))
    lakes[rid] = pd.read_parquet(f).set_index("time").sort_index()

for key in ("calibration", "validation"):
    ev = events.get(key)
    if not ev:
        continue
    t0 = pd.Timestamp(ev["window_start"]) - pd.Timedelta(hours=PAD_H)
    t1 = pd.Timestamp(ev["window_end"])
    idx = pd.date_range(t0, t1, freq="h")
    out = {"event": key, "peak_st2": ev["peak_st2"], "start": t0.isoformat(), "end": t1.isoformat(),
           "time": [t.isoformat() for t in idx], "lakes": {}}
    for rid, d in lakes.items():
        w = d.reindex(idx)
        rec = {}
        for name, col in (("inflow", "inflow_qc"), ("outflow", "outflow_qc"), ("water_level", "water_level_qc")):
            s = w[col]
            if name == "water_level" and rid in SPECS:
                sp = SPECS[rid]
                bad = (s < sp["MNC"] - 30) | (s > sp["crest"] + 5)
                if bad.any():
                    print(f"  hồ {rid}: bỏ {int(bad.sum())} giờ mực nước vô lý {s[bad].round(2).tolist()[:3]}")
                s = s.mask(bad)
            rec["real_" + name] = s.notna().astype(int).tolist()
            rec[name] = [None if pd.isna(v) else round(float(v), 3)
                         for v in s.interpolate(limit_direction="both")]
        rec["rain"] = [None if pd.isna(v) else round(float(v), 3) for v in w["rain"]]
        out["lakes"][rid] = rec
    name = f"{key}_{pd.Timestamp(ev['peak_st2']):%Y%m%d}.json"
    (OUT / name).write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"{key}: {len(idx)} giờ, {len(lakes)} hồ → {OUT / name}")
