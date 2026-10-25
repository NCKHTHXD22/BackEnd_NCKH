"""Bước 15 – Ước lượng lại bảng Z-V từ số liệu vận hành (sửa lỗi bảng Z-V tự mâu thuẫn, lộ trình 4.1/4.2).

Vì sao làm được: Q đến của hồ thường do đơn vị vận hành tính ngược từ cân bằng nước với bảng Z-V chính thức,
nên từ chuỗi giờ H, Q đến, Q xả (2022–2026) suy ngược được độ dốc dV/dH (= diện tích mặt hồ, km²) ở từng cao độ.
Mô phỏng mực nước chỉ phụ thuộc dV/dH, không phụ thuộc mốc thể tích tuyệt đối.

Cách tính
  - Cửa sổ 6 giờ toàn số liệu thật: ΔV = Σ(Q đến − Q xả)·Δt, ΔH = H cuối − H đầu; giữ cửa sổ |ΔH| ≥ 0,15 m.
  - Diện tích A = ΔV/ΔH, gom theo khoảng cao độ 1 m, lấy trung vị (≥ 8 cửa sổ). Loại 2 trận lũ thử để kiểm chứng độc lập.
  - Ngoài khoảng cao độ có số liệu: kéo dài bằng cột của bảng cũ (diện tích HOẶC độ dốc thể tích) nào khớp hơn với
    số liệu tại mép khoảng – bảng cũ có hồ sai cột diện tích (Sông Bung 4), có hồ sai cột thể tích (Sông Tranh 2).
  - Bỏ mực nước vô lý (ngoài khoảng bảng Z-V −20 m … +5 m, vd. 15.809 m = 158,09 mất dấu phẩy).
  - Tích phân A(H) thành V(H), giữ mốc thể tích của bảng cũ tại cao độ thấp nhất (thể tích tuyệt đối CHƯA kiểm chứng).

Đầu ra: data/compute/zv_estimated.json – bảng Z-V ước tính + so sánh với bảng cũ
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/15_zv_estimate.py
"""
import json
import subprocess

import numpy as np
import pandas as pd

from config import ROOT

SRC = ROOT.parent / "Documents" / "Data_Sach_16Ho" / "parquet"
COMPUTE = ROOT / "data" / "compute"
WIN_H, MIN_DH, MIN_N = 6, 0.15, 8

js = "import('./src/script/lakeSpecsData.js').then(m => console.log(JSON.stringify({zv: m.ZV_CURVES, specs: m.LAKE_SPECS})))"
seed = json.loads(subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT.parent, capture_output=True, text=True, check=True).stdout)
SPECS = {s["lake_id"]: s for s in seed["specs"]}
events = json.loads((COMPUTE / "events.json").read_text(encoding="utf-8"))
EXCLUDE = [(pd.Timestamp(events[k]["window_start"]) - pd.Timedelta(hours=48), pd.Timestamp(events[k]["window_end"]))
           for k in ("calibration", "validation") if k in events]

out = {"note": "Bảng Z-V ước tính từ số liệu vận hành 2022–2026 (15_zv_estimate.py), loại 2 trận lũ thử. Độ dốc dV/dH suy từ "
               "số liệu; thể tích tuyệt đối giữ mốc bảng cũ – CHƯA kiểm chứng. Thay bằng bảng Z-V-F chính thức khi có.",
       "lakes": {}}
for curve in seed["zv"]:
    rid = curve["lake_id"]
    f = next(SRC.glob(f"rid_{rid}_*.parquet"))
    d = pd.read_parquet(f).set_index("time").sort_index()
    for a, b in EXCLUDE:
        d.loc[a:b, ["inflow_qc", "outflow_qc", "water_level_qc"]] = np.nan
    pts = sorted(curve["points"], key=lambda p: p["z"])
    bad_h = (d["water_level_qc"] < pts[0]["z"] - 20) | (d["water_level_qc"] > pts[-1]["z"] + 5)
    if bad_h.any():
        print(f"  {curve['name']}: bỏ {int(bad_h.sum())} giờ mực nước vô lý, vd. {d.loc[bad_h, 'water_level_qc'].iloc[0]}")
        d.loc[bad_h, "water_level_qc"] = np.nan
    qi, qo, h = d["inflow_qc"].to_numpy(), d["outflow_qc"].to_numpy(), d["water_level_qc"].to_numpy()
    rows = []
    for i in range(0, len(d) - WIN_H):
        seg = slice(i + 1, i + WIN_H + 1)
        if np.isnan(h[i]) or np.isnan(h[i + WIN_H]) or np.isnan(qi[seg]).any() or np.isnan(qo[seg]).any():
            continue
        dh = h[i + WIN_H] - h[i]
        if abs(dh) < MIN_DH:
            continue
        dv = np.sum(qi[seg] - qo[seg]) * 3600 / 1e6
        rows.append(((h[i] + h[i + WIN_H]) / 2, dv / dh))
    w = pd.DataFrame(rows, columns=["h", "A"])
    w = w[(w.A > 0) & (w.A < 200)]                               # bỏ cửa sổ vô lý (ngược dấu, quá lớn)
    z0, z1 = pts[0]["z"], pts[-1]["z"]
    bins = np.arange(np.floor(z0), np.ceil(z1) + 1, 1.0)
    w["bin"] = pd.cut(w.h, bins, right=False)
    g = w.groupby("bin", observed=True).A.agg(["median", "count"]).reset_index()
    g = g[g["count"] >= MIN_N]
    est = {float(b.left) + 0.5: float(m) for b, m in zip(g["bin"], g["median"])}

    # Diện tích theo cao độ: số liệu nơi có; ngoài khoảng đó kéo dài bằng cột bảng cũ khớp hơn tại mép
    old_area = lambda z: float(np.interp(z, [p["z"] for p in pts], [p.get("area", np.nan) for p in pts]))
    pz, pv = np.array([p["z"] for p in pts]), np.array([p["volume"] for p in pts])

    def old_slope(z):                                 # dV/dz của bảng cũ tại z (đoạn chứa z)
        k = int(np.clip(np.searchsorted(pz, z, side="right") - 1, 0, len(pz) - 2))
        return float((pv[k + 1] - pv[k]) / (pz[k + 1] - pz[k]))

    zs = np.round(np.arange(z0, z1 + 1e-9, 0.5), 2)
    ext = {}
    if est:
        ez = np.array(sorted(est)); ea = np.array([est[k] for k in ez])
        lo, hi = ez.min() - 0.5, ez.max() + 0.5
        for side, zb, ab in (("dưới", lo, ea[0]), ("trên", hi, ea[-1])):
            ext[side] = "area" if abs(old_area(zb) - ab) <= abs(old_slope(zb) - ab) else "slope"
        f_old = lambda z, how: old_area(z) if how == "area" else old_slope(z)
        area = np.array([np.interp(z, ez, ea) if lo <= z <= hi else f_old(z, ext["dưới" if z < lo else "trên"]) for z in zs])
    else:
        area = np.array([old_area(z) for z in zs])
    vol = [pts[0]["volume"]]
    for k in range(1, len(zs)):
        vol.append(vol[-1] + 0.5 * (area[k] + area[k - 1]) * (zs[k] - zs[k - 1]))
    new_pts = [{"z": float(z), "volume": round(float(v), 1), "area": round(float(a), 2)} for z, v, a in zip(zs, vol, area)]

    sp = SPECS.get(rid, {})
    vz = lambda P, z: float(np.interp(z, [p["z"] for p in P], [p["volume"] for p in P]))
    out["lakes"][rid] = {
        "name": curve["name"], "windows": int(len(w)), "h_range_data": [round(float(w.h.min()), 2), round(float(w.h.max()), 2)] if len(w) else None,
        "area_from_data": {f"{k:.1f}": round(v, 2) for k, v in est.items()},
        "extend_outside_data_with": ext,
        "points": new_pts,
        "compare": {k: {"old": round(vz(pts, sp[k]), 1), "new": round(vz(new_pts, sp[k]), 1)} for k in ("MNC", "MNDBT", "MNGC") if k in sp},
    }
    print(f"\n{curve['name']} (id {rid}): {len(w)} cửa sổ, H số liệu {out['lakes'][rid]['h_range_data']}")
    print("  diện tích từ số liệu (km²) theo cao độ:", {k: round(v, 1) for k, v in list(est.items())})
    print("  thể tích (tr.m³) cũ → mới:", out["lakes"][rid]["compare"])
    vol_cap = (vz(new_pts, sp["MNDBT"]) - vz(new_pts, sp["MNC"])) if "MNC" in sp else None
    old_cap = (vz(pts, sp["MNDBT"]) - vz(pts, sp["MNC"])) if "MNC" in sp else None
    print(f"  dung tích hữu ích MNC→MNDBT: cũ {old_cap:.1f}, mới {vol_cap:.1f} tr.m³")

(COMPUTE / "zv_estimated.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("\n→", COMPUTE / "zv_estimated.json")
