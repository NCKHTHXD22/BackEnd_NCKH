"""Lưu lượng từng đoạn sông theo giờ từ lưu lượng tại nút của diễn toán (13_routing.py) – dùng chung cho 14_hand.py
(bản đồ theo lưu lượng) và 26_forecast_package.py (gói dự báo).

  - Đoạn D8 (thượng nguồn): Q tại nút hạ lưu của đoạn (nút thượng lưu nếu hạ lưu là đập).
  - Đoạn OSM (đồng bằng): duyệt theo chiều dòng chảy từ Giao Thủy và cuối Vu Gia; sông nhánh (Túy Loan…) theo mô-đun
    dòng chảy Thành Mỹ × diện tích nguồn; tại phân lưu chia theo SPLIT – GIẢ ĐỊNH, cần hiệu chỉnh bằng số liệu đo/mô hình 1D.
"""
from collections import defaultdict

import numpy as np

SPLIT = {
    "J-VUGIA-END": {"Sông Quảng Huế": 0.5, "Sông Ái Nghĩa": 0.5},
    "D01": {"Sông Yên": 0.6, "Sông Quá Giáng": 0.4},
    "D10": {"Sông La Thọ": 0.5, "Sông Quá Giáng": 0.5},
    "D12": {"Sông Vĩnh Điện": 0.15, "Sông Thu Bồn": 0.85},
}


def reach_flows(flow_nodes, n, nodes, edges):
    """flow_nodes: {nút: chuỗi Q}; edges: các cạnh mạng sông (network.json) cần tính, theo thứ tự cố định.
    Trả ({(từ, đến): mảng Q}, tập (từ, đến) đồng bằng chưa giải được)."""
    key = lambda e: (e["from"], e["to"])
    q = {}
    for e in edges:
        if e["source"] == "d8":
            k = e["to"] if (e["to"] in flow_nodes and not e["to"].startswith("HO-")) else e["from"]
            q[key(e)] = np.array(flow_nodes.get(k, np.zeros(n)))
    plain = [e for e in edges if e["source"] == "osm"]
    out_of = defaultdict(list)
    for e in plain:
        out_of[e["from"]].append(e)
    node_q = {k: np.array(v) for k, v in flow_nodes.items() if k in ("ST-GIAOTHUY", "J-VUGIA-END")}
    if "ST-THANHMY" in flow_nodes:                                    # nguồn sông nhánh: mô-đun dòng chảy Thành Mỹ
        spec = np.array(flow_nodes["ST-THANHMY"]) / nodes["ST-THANHMY"]["area_km2"]
        for nid, nd in nodes.items():
            if nd["type"] == "source":
                node_q[nid] = spec * (nd.get("area_km2") or 0)
    pending = {key(e) for e in plain}
    inflow = defaultdict(lambda: np.zeros(n))
    for _ in range(50):
        progressed = False
        for nid in list(out_of):
            if any(key(e) in pending for e in plain if e["to"] == nid):
                continue
            total = node_q.get(nid, np.zeros(n)) + inflow[nid]
            outs = [e for e in out_of[nid] if key(e) in pending]
            if not outs:
                continue
            fr = SPLIT.get(nid, {})
            for e in outs:
                share = fr.get(e["river"], 1.0 / len(out_of[nid]))
                q[key(e)] = total * share
                inflow[e["to"]] = inflow[e["to"]] + q[key(e)]
                pending.discard(key(e))
                progressed = True
        if not progressed:
            break
    return q, pending
