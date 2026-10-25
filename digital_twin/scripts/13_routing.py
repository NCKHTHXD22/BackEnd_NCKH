"""Bước 13 – Diễn toán lũ nhanh Muskingum-Cunge trên mạng kết nối (lộ trình mục 5.1).

Đầu vào : data/compute/network.json (bước 10), data/compute/events/*.json (bước 11), src/script/seedLakeSpecs.js
Đầu ra  : data/compute/routing/<trận>.json – lưu lượng theo giờ tại mọi nút thượng nguồn (đập, trạm, hợp lưu,
          đầu đồng bằng) + chỉ số kiểm chứng tại các hồ hạ lưu có số liệu Q đến thật.

Cách tính
  - Mỗi đập: phát Q xả ĐO (hồ điều tiết). Đắk Mi 4: phần ≤ Q tua-bin max chuyển sang Thu Bồn (nhập Nông Sơn),
    phần vượt xả tràn xuống Đắk Mi (GIẢ ĐỊNH – chưa có số liệu tách tua-bin/xả tràn).
    Hồ có < 50% số liệu Q xả thật trong trận: coi như chảy qua (Q xả = Q đến tính được), có ghi chú.
  - Mỗi cạnh D8: Muskingum-Cunge, chia đoạn con để K_con ≈ Δt; tham số vật lý ƯỚC LƯỢNG:
      bề rộng B = 7·Q^0,5 (m), Manning n = 0,04, độ dốc từ DEM (tối thiểu 0,0002), Q tham chiếu = ½ đỉnh lũ đổ vào đoạn
      vận tốc sóng c = 5/3·v ; K = L/c ; X = ½ − Q/(2·B·S·c·L)  (kẹp 0…0,45)
  - Khu giữa: diện tích riêng của nút (local_area_km2) × mô-đun dòng chảy q(t) (m³/s/km²) mượn từ hồ đầu nguồn cùng
    hệ thống có số liệu tốt: hệ Thu Bồn ← Sông Tranh 2; hệ Vu Gia ← trung bình A Vương, Đắk Mi 3 (GIẢ ĐỊNH).
  - Kiểm tra cân bằng khối lượng từng hồ trong trận: lượng nước khu giữa (Q đến hồ − Q xả các hồ thượng lưu tin cậy)
    so với lượng mưa. Hệ số dòng chảy > 1,2 hoặc âm → số liệu hồ đó KHÔNG cân bằng: không dùng Q xả báo cáo
    (coi như chảy qua) và không dùng để kiểm chứng (vd. Sông Tranh 3 trận 10/2025: hệ số 2,4).
  - Chưa diễn toán vùng đồng bằng (phân lưu chưa có tỷ lệ chia) – dừng ở Giao Thủy và cuối Vu Gia.
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/13_routing.py
"""
import json
import math
import re
import subprocess
from collections import defaultdict

import numpy as np

from config import ROOT

COMPUTE = ROOT / "data" / "compute"
OUT = COMPUTE / "routing"
OUT.mkdir(parents=True, exist_ok=True)
DT = 3600.0                     # bước dữ liệu (s)
SUB = 4                         # chia nhỏ bước tính: 15 phút
N_MANNING, B_COEF, S_MIN = 0.04, 7.0, 2e-4
MIN_REAL_OUT = 50               # % số liệu Q xả thật tối thiểu để dùng Q xả đo
MAX_RUNOFF_COEF = 1.2           # hệ số dòng chảy khu giữa > 1,2 (dòng chảy nhiều hơn mưa) hoặc < 0 → số liệu hồ không cân bằng

# ------------------------------------------------------------------ dữ liệu
net = json.loads((COMPUTE / "network.json").read_text(encoding="utf-8"))
nodes = {n["id"]: n for n in net["nodes"]}
edges = [e for e in net["edges"] if e["source"] in ("d8", "declared")]

specs_js = subprocess.run(   # thông số hồ theo QĐ 1865 (src/script/lakeSpecsData.js)
    ["node", "--input-type=module", "-e",
     "import('./src/script/lakeSpecsData.js').then(m => console.log(JSON.stringify(m.LAKE_SPECS)))"],
    cwd=ROOT.parent, capture_output=True, text=True, check=True).stdout
SPECS = {s["lake_id"]: s for s in json.loads(specs_js)}

down = defaultdict(list)
up = defaultdict(list)
for e in edges:
    down[e["from"]].append(e)
    up[e["to"]].append(e)


def topo_order():
    indeg = {n: 0 for n in nodes}
    for e in edges:
        indeg[e["to"]] += 1
    q = [n for n, d in indeg.items() if d == 0]
    order = []
    while q:
        n = q.pop()
        order.append(n)
        for e in down[n]:
            indeg[e["to"]] -= 1
            if indeg[e["to"]] == 0:
                q.append(e["to"])
    return order


ORDER = [n for n in topo_order() if any(e for e in edges if e["from"] == n or e["to"] == n)]


def system_of(nid):
    """Hệ thống sông của nút: đi xuôi tới đầu đồng bằng."""
    seen, stack = set(), [nid]
    while stack:
        n = stack.pop()
        if n == "ST-GIAOTHUY":
            return "thubon"
        if n == "J-VUGIA-END":
            return "vugia"
        for e in down[n]:
            if e["kind"] if "kind" in e else False:
                continue
            if e["to"] not in seen:
                seen.add(e["to"])
                stack.append(e["to"])
    return "vugia"


# ------------------------------------------------------------------ Muskingum-Cunge
def mc_params(length_m, slope, q_ref):
    s = max(slope, S_MIN)
    q = max(q_ref, 1.0)
    b = B_COEF * math.sqrt(q)
    h = (q * N_MANNING / (b * math.sqrt(s))) ** 0.6
    v = q / (b * h)
    c = 5.0 / 3.0 * v
    k = length_m / c
    x = 0.5 - q / (2 * b * s * c * length_m)
    return k, min(max(x, 0.0), 0.45), c


def route(inflow, length_km, slope):
    """Muskingum-Cunge, bước con dt = DT/SUB, chia đoạn để K_con ≈ dt."""
    if not length_km:
        return inflow.copy(), None
    q_ref = 0.5 * float(np.max(inflow))
    k, x, c = mc_params(length_km * 1000, slope, q_ref)
    dt = DT / SUB
    m = max(1, round(k / dt))
    ks = k / m
    den = 2 * ks * (1 - x) + dt
    c0, c1, c2 = (dt - 2 * ks * x) / den, (dt + 2 * ks * x) / den, (2 * ks * (1 - x) - dt) / den
    fine_t = np.arange(len(inflow) * SUB) / SUB
    q = np.interp(fine_t, np.arange(len(inflow)), inflow)
    for _ in range(m):
        out = np.empty_like(q)
        out[0] = q[0]
        for i in range(1, len(q)):
            out[i] = c0 * q[i] + c1 * q[i - 1] + c2 * out[i - 1]
        q = out
    return q[::SUB].copy(), {"K_h": round(k / 3600, 2), "X": round(x, 2), "celerity_ms": round(c, 2), "sub_reaches": m}


def metrics(sim, obs, real):
    m = np.array(real, bool) & np.isfinite(obs)
    if m.sum() < 24:
        return None
    s, o = sim[m], obs[m]
    nse = 1 - np.sum((s - o) ** 2) / np.sum((o - o.mean()) ** 2)
    r = np.corrcoef(s, o)[0, 1]
    alpha, beta = s.std() / o.std(), s.mean() / o.mean()
    kge = 1 - math.sqrt((r - 1) ** 2 + (alpha - 1) ** 2 + (beta - 1) ** 2)
    return {"NSE": round(float(nse), 2), "KGE": round(float(kge), 2),
            "peak_obs": round(float(np.nanmax(obs)), 0), "peak_sim": round(float(np.max(sim)), 0),
            "peak_err_pct": round(float((np.max(sim) - np.nanmax(obs)) / np.nanmax(obs) * 100), 1),
            "peak_lag_h": int(np.argmax(sim) - np.nanargmax(obs)), "real_pct": round(100 * float(m.mean()))}


# ------------------------------------------------------------------ chạy từng trận
summary = []
for f in sorted((COMPUTE / "events").glob("*.json")):
    ev = json.loads(f.read_text(encoding="utf-8"))
    L = {int(k): v for k, v in ev["lakes"].items()}
    n = len(ev["time"])
    arr = lambda rid, k: np.array([np.nan if x is None else x for x in L[rid][k]], float)

    # mô-đun dòng chảy (m³/s/km²) mượn từ hồ đầu nguồn
    q_spec = {
        "thubon": arr(4, "inflow") / nodes["HO-4"]["area_km2"],
        "vugia": 0.5 * (arr(1, "inflow") / nodes["HO-1"]["area_km2"] + arr(14, "inflow") / nodes["HO-14"]["area_km2"]),
    }
    flow, inflow_pred, notes, reach_par = {}, {}, [], {}

    # Kiểm tra cân bằng khối lượng: so với các hồ thượng lưu gần nhất ĐÃ tin cậy (bỏ qua hồ không cân bằng)
    trusted, mass = set(), {}

    def upstream_trusted(d):
        res, stack, seen = [], [d], set()
        while stack:
            for e in up[stack.pop()]:
                u = e["from"]
                if u in seen or e.get("kind") == "diversion":
                    continue
                seen.add(u)
                if u.startswith("HO-") and u in trusted:
                    res.append(u)
                else:
                    stack.append(u)
        return res

    for nid in ORDER:
        if not nid.startswith("HO-") or int(nid[3:]) not in L:
            continue
        rid = int(nid[3:])
        ups = upstream_trusted(nid)
        local_km2 = nodes[nid]["area_km2"] - sum(nodes[u]["area_km2"] for u in ups)
        q_up = sum((arr(int(u[3:]), "outflow") for u in ups), np.zeros(n))
        # nước chuyển sang qua nhà máy (Đắk Mi 4 → 4b → 4c): cộng phần tua-bin của hồ chuyển nước đã tin cậy
        for e in up[nid]:
            if e.get("kind") == "diversion" and e["from"] in trusted:
                qt = float(SPECS[int(e["from"][3:])].get("max_turbine_flow") or 0)
                q_up = q_up + np.minimum(np.nan_to_num(arr(int(e["from"][3:]), "outflow")), qt)
        v_local = float(np.nansum(arr(rid, "inflow") - q_up)) * 3600 / 1e6
        rain = float(np.nansum(arr(rid, "rain")))
        coef = (v_local / local_km2 * 1000) / rain if rain > 0 and local_km2 > 0 else None
        ok = coef is not None and 0 <= coef <= MAX_RUNOFF_COEF
        mass[nid] = {"upstream_trusted": ups, "local_km2": round(local_km2), "local_volume_mm3": round(v_local, 1),
                     "runoff_mm": round(v_local / local_km2 * 1000) if local_km2 > 0 else None,
                     "rain_mm": round(rain), "runoff_coef": None if coef is None else round(coef, 2), "balanced": ok}
        if ok:
            trusted.add(nid)
        else:
            notes.append(f"{nid} {nodes[nid]['name']}: KHÔNG cân bằng khối lượng (khu giữa {local_km2:.0f} km² cho "
                         f"{mass[nid]['runoff_mm']} mm dòng chảy / {rain:.0f} mm mưa, hệ số {mass[nid]['runoff_coef']}) "
                         f"→ không dùng Q xả báo cáo, coi như chảy qua")
    routed_to = defaultdict(lambda: np.zeros(n))

    for nid in ORDER:
        node = nodes[nid]
        local = node.get("local_area_km2") or 0.0
        lateral = local * q_spec[system_of(nid)]
        q_here = routed_to[nid] + lateral
        if nid.startswith("HO-"):
            rid = int(nid[3:])
            inflow_pred[nid] = q_here
            real_out = 100 * np.mean(L[rid]["real_outflow"]) if rid in L else 0
            if rid in L and real_out >= MIN_REAL_OUT and mass.get(nid, {}).get("balanced"):
                q_here = arr(rid, "outflow")
            elif rid in L and real_out >= MIN_REAL_OUT:
                pass                                   # không cân bằng khối lượng: đã ghi chú ở trên
            else:
                notes.append(f"{nid}: Q xả thật {real_out:.0f}% < {MIN_REAL_OUT}% → coi như chảy qua")
        flow[nid] = q_here
        for e in down[nid]:
            if e.get("kind") == "diversion":
                qt = float(SPECS[2].get("max_turbine_flow") or 0)
                part = np.minimum(q_here, qt)
                routed_to[e["to"]] += part            # chưa có chiều dài đường hầm/sông → không trễ
                continue
            q_send = q_here
            if nid == "HO-2":                         # Đắk Mi 4: chỉ phần vượt tua-bin xả tràn xuống Đắk Mi
                q_send = np.maximum(q_here - float(SPECS[2].get("max_turbine_flow") or 0), 0)
            out, par = route(q_send, e.get("length_km"), e.get("slope", S_MIN))
            routed_to[e["to"]] += out
            if par:
                reach_par[f"{e['from']}→{e['to']}"] = par

    # kiểm chứng tại các hồ có Q đến thật
    checks = {}
    for nid, pred in inflow_pred.items():
        rid = int(nid[3:])
        if not up[nid] or rid not in L or not mass.get(nid, {}).get("balanced"):
            continue                                   # hồ đầu nguồn / số liệu không cân bằng: không kiểm chứng
        mt = metrics(pred, arr(rid, "inflow"), L[rid]["real_inflow"])
        if mt:
            checks[nid] = {"lake": nodes[nid]["name"], "upstream": [e["from"] for e in up[nid]],
                           "local_area_km2": nodes[nid].get("local_area_km2"),
                           "local_share_pct": round(100 * (nodes[nid].get("local_area_km2") or 0) / nodes[nid]["area_km2"]), **mt}

    out = {"event": ev["event"], "time": ev["time"], "notes": notes, "reach_params": reach_par,
           "assumptions": ["Tham số Muskingum-Cunge ước lượng từ DEM + Manning (chưa hiệu chỉnh với trạm sông)",
                           "Khu giữa theo mô-đun dòng chảy hồ đầu nguồn cùng hệ thống",
                           "Đắk Mi 4: tua-bin (≤ 128 m³/s, QĐ 1865) chuyển sang Đắk Mi 4c (qua 4b) không trễ; phần vượt xả xuống Đắk Mi"],
           "checks": checks, "mass_balance": mass,
           "flow": {k: [round(float(x), 1) for x in v] for k, v in flow.items()},
           "stations_unverified": {k: round(float(np.max(flow[k])), 0) for k in ("ST-THANHMY", "ST-NONGSON", "ST-GIAOTHUY", "J-VUGIA-END")}}
    name = f.stem
    (OUT / f"{name}.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    print(f"\n=== {name} ===")
    for w in notes:
        print("  ghi chú:", w)
    print(f"  {'hồ':16s} {'khu giữa':>9s} {'NSE':>6s} {'KGE':>6s} {'đỉnh đo':>8s} {'đỉnh tính':>9s} {'sai đỉnh':>8s} {'lệch giờ':>8s} {'%thật':>6s}")
    for nid, c in sorted(checks.items(), key=lambda kv: -kv[1]["NSE"]):
        print(f"  {c['lake'][:16]:16s} {c['local_share_pct']:>8d}% {c['NSE']:>6.2f} {c['KGE']:>6.2f} {c['peak_obs']:>8.0f} "
              f"{c['peak_sim']:>9.0f} {c['peak_err_pct']:>7.1f}% {c['peak_lag_h']:>8d} {c['real_pct']:>5d}%")
    print("  Đỉnh tính (CHƯA kiểm chứng – thiếu số liệu trạm):", out["stations_unverified"])
    summary.append((name, checks))

print("\nTham số đoạn (trận cuối):")
for k, p in list(reach_par.items())[:12]:
    print(" ", k, p)
