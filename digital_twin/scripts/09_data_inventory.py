"""Bước 9 – Kiểm kê, đánh giá chất lượng dữ liệu quan trắc hồ chứa và chọn trận lũ thử (lộ trình mục 1.1).

Đầu vào : Documents/Data_Sach_16Ho/parquet/rid_*.parquet – chuỗi giờ đã làm sạch của 16 hồ
          (inflow/outflow/water_level gốc + bản *_qc sau kiểm tra, cờ spike/linrun/bad, mưa trung bình lưu vực).
Đầu ra  : Documents/QC_Kiem_Ke_Du_Lieu.xlsx – độ phủ theo hồ × tháng, danh sách trận lũ, độ phủ trong từng trận
          digital_twin/data/compute/events.json – trận lũ đề xuất cho chuỗi thí điểm (đọc được từ các bước sau)

"Số liệu thật" = giờ có giá trị *_qc (không bị loại vì spike/đoạn nội suy tuyến tính/giá trị sai).
Trận lũ: đỉnh Q đến (số liệu thật) trong mùa lũ 9–12, cách nhau ≥ 7 ngày; cửa sổ trận = đỉnh −72 h … +96 h.
Chạy: digital_twin/.venv/Scripts/python digital_twin/scripts/09_data_inventory.py
"""
import json
import re
from pathlib import Path

import pandas as pd

from config import ROOT

SRC = ROOT.parent / "Documents" / "Data_Sach_16Ho" / "parquet"
XLSX = ROOT.parent / "Documents" / "QC_Kiem_Ke_Du_Lieu.xlsx"
COMPUTE = ROOT / "data" / "compute"
COMPUTE.mkdir(parents=True, exist_ok=True)

PILOT = {4: "Sông Tranh 2", 2: "Đắk Mi 4"}   # hồ của chuỗi thí điểm Thu Bồn
WIN_BEFORE, WIN_AFTER = 72, 96                # giờ
MIN_SEP_DAYS = 7
STATION_LEVELS = ROOT / "data" / "work" / "station_levels_hourly.parquet"
RIVER_STATIONS = ["NONGSON", "GIAOTHUY", "CAULAU", "AINGHIA"]
MIN_STATION_PCT = 60
VARS = [("inflow", "inflow_qc"), ("outflow", "outflow_qc"), ("water_level", "water_level_qc")]


def load():
    lakes = {}
    for f in sorted(SRC.glob("rid_*.parquet")):
        m = re.match(r"rid_(\d+)_HO_(.+)\.parquet", f.name)
        rid, name = int(m.group(1)), m.group(2).replace("_", " ").title()
        d = pd.read_parquet(f).set_index("time").sort_index()
        lakes[rid] = (name, d)
    return lakes


def coverage(d):
    """% giờ có số liệu thật cho từng biến + mưa."""
    out = {v: round(100 * d[qc].notna().mean(), 1) for v, qc in VARS}
    out["rain"] = round(100 * d["rain"].notna().mean(), 1)
    return out


def peaks(series, min_sep_h):
    """Đỉnh lớn nhất trước, bỏ các đỉnh nằm trong ±min_sep_h giờ của đỉnh đã chọn."""
    s = series.dropna().sort_values(ascending=False)
    chosen = []
    for t, v in s.items():
        if all(abs((t - c).total_seconds()) / 3600 >= min_sep_h for c, _ in chosen):
            chosen.append((t, v))
        if len(chosen) >= 40:
            break
    return chosen


def main():
    lakes = load()
    print(f"{len(lakes)} hồ, {min(d.index.min() for _, d in lakes.values())} → {max(d.index.max() for _, d in lakes.values())}")

    # 1) Độ phủ tổng và theo tháng
    total_rows, month_rows = [], []
    for rid, (name, d) in lakes.items():
        c = coverage(d)
        total_rows.append({"rid": rid, "Hồ": name, "Số giờ": len(d), **{f"% thật {k}": v for k, v in c.items()},
                           "Số giờ spike Q đến": int(d["qc_spike_inflow"].sum()),
                           "Số giờ nội suy Q đến": int(d["qc_linrun_inflow"].sum())})
        for (y, m), g in d.groupby([d.index.year, d.index.month]):
            month_rows.append({"rid": rid, "Hồ": name, "Tháng": f"{y}-{m:02d}", **coverage(g)})
    total = pd.DataFrame(total_rows).sort_values("% thật inflow", ascending=False)
    monthly = pd.DataFrame(month_rows)

    # 2) Trận lũ theo từng hồ (mùa lũ 9–12)
    ev_rows = []
    for rid, (name, d) in lakes.items():
        flood = d[d.index.month.isin([9, 10, 11, 12])]["inflow_qc"]
        for t, q in peaks(flood, MIN_SEP_DAYS * 24):
            w = d.loc[t - pd.Timedelta(hours=WIN_BEFORE): t + pd.Timedelta(hours=WIN_AFTER)]
            c = coverage(w)
            ev_rows.append({"rid": rid, "Hồ": name, "Đỉnh lúc": t, "Q đỉnh (m3/s)": q,
                            **{f"% thật {k} trong trận": v for k, v in c.items()},
                            "Mưa tổng trận (mm)": round(w["rain"].sum(), 1)})
    events = pd.DataFrame(ev_rows)
    # 5 trận lớn nhất mỗi năm của mỗi hồ
    events["Năm"] = events["Đỉnh lúc"].dt.year
    events = (events.sort_values("Q đỉnh (m3/s)", ascending=False).groupby(["rid", "Năm"]).head(5)
              .sort_values(["rid", "Đỉnh lúc"]))

    # 3) Trận cho chuỗi thí điểm: đỉnh Sông Tranh 2 và Đắk Mi 4 cách nhau ≤ 48 h, đủ số liệu thật cả hai hồ
    pilot_rows = []
    st2 = events[events.rid == 4]
    dm4 = events[events.rid == 2]
    for _, a in st2.iterrows():
        near = dm4[(dm4["Đỉnh lúc"] - a["Đỉnh lúc"]).abs() <= pd.Timedelta(hours=48)]
        b = near.iloc[0] if len(near) else None
        def cov(r, k):
            return None if r is None else r[f"% thật {k} trong trận"]
        score_cov = min(x for x in [a["% thật inflow trong trận"], a["% thật outflow trong trận"],
                                    cov(b, "inflow") or 0, cov(b, "outflow") or 0])
        pilot_rows.append({
            "Đỉnh ST2": a["Đỉnh lúc"], "Q đỉnh ST2": a["Q đỉnh (m3/s)"],
            "% thật Qđến ST2": a["% thật inflow trong trận"], "% thật Qxả ST2": a["% thật outflow trong trận"],
            "% thật H ST2": a["% thật water_level trong trận"],
            "Đỉnh ĐM4": None if b is None else b["Đỉnh lúc"], "Q đỉnh ĐM4": None if b is None else b["Q đỉnh (m3/s)"],
            "% thật Qđến ĐM4": cov(b, "inflow"), "% thật Qxả ĐM4": cov(b, "outflow"),
            "Mưa ST2 (mm)": a["Mưa tổng trận (mm)"],
            "Độ phủ thấp nhất (%)": round(score_cov, 1),
        })
    pilot = pd.DataFrame(pilot_rows)
    pilot["Đủ dùng (≥80%)"] = pilot["Độ phủ thấp nhất (%)"] >= 80
    # Độ phủ mực nước trạm sông KTTV trong cửa sổ trận (17_station_levels.py) – thấp nhất trong các trạm kiểm chứng
    pilot["% trạm sông"] = 0.0
    if STATION_LEVELS.exists():
        sl = pd.read_parquet(STATION_LEVELS, columns=["station_code", "t_vn", "qc_flag"])
        sl = sl[(sl.qc_flag == "ok") & sl.station_code.isin(RIVER_STATIONS)]
        for i, r in pilot.iterrows():
            a, b = r["Đỉnh ST2"] - pd.Timedelta(hours=WIN_BEFORE), r["Đỉnh ST2"] + pd.Timedelta(hours=WIN_AFTER)
            w = sl[(sl.t_vn >= a) & (sl.t_vn <= b)]
            n = WIN_BEFORE + WIN_AFTER + 1
            pilot.at[i, "% trạm sông"] = round(min(100 * w[w.station_code == s].t_vn.nunique() / n for s in RIVER_STATIONS), 1)
    pilot = pilot.sort_values(["Đủ dùng (≥80%)", "Q đỉnh ST2"], ascending=[False, False])

    # Chọn trận (ok đã xếp Q đỉnh giảm dần): ưu tiên các trận có số liệu trạm sông ≥ 60% để kiểm chứng được diễn toán
    # và ngập tại trạm; lớn nhất → hiệu chỉnh, lớn kế tiếp cách ≥ 7 ngày → kiểm định (trước 25/10/2026: kiểm định "khác năm")
    ok = pilot[pilot["Đủ dùng (≥80%)"]]
    pool = ok[ok["% trạm sông"] >= MIN_STATION_PCT]
    if len(pool) < 2:
        pool = ok
    chosen = {}
    if len(pool):
        cal = pool.iloc[0]
        chosen["calibration"] = cal
        other = pool[(pool["Đỉnh ST2"] - cal["Đỉnh ST2"]).abs() >= pd.Timedelta(days=MIN_SEP_DAYS)]
        if len(other):
            chosen["validation"] = other.iloc[0]

    def ev_json(r):
        t = r["Đỉnh ST2"]
        return {"peak_st2": t.isoformat(), "q_peak_st2": r["Q đỉnh ST2"],
                "peak_dm4": None if pd.isna(r["Đỉnh ĐM4"]) else pd.Timestamp(r["Đỉnh ĐM4"]).isoformat(),
                "window_start": (t - pd.Timedelta(hours=WIN_BEFORE)).isoformat(),
                "window_end": (t + pd.Timedelta(hours=WIN_AFTER)).isoformat(),
                "min_real_coverage_pct": r["Độ phủ thấp nhất (%)"], "river_station_coverage_pct": r["% trạm sông"]}
    out = {"note": "Trận lũ đề xuất cho chuỗi thí điểm Sông Tranh 2 + Đắk Mi 4 → Thu Bồn (tạo bởi 09_data_inventory.py). "
                   "Thời gian theo giờ Việt Nam (dữ liệu nguồn không ghi múi giờ).",
           "window_hours": [-WIN_BEFORE, WIN_AFTER],
           **{k: ev_json(v) for k, v in chosen.items()}}
    (COMPUTE / "events.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    # 4) Ghi Excel
    readme = pd.DataFrame({"Nội dung": [
        "Nguồn: Documents/Data_Sach_16Ho/parquet (chuỗi giờ 16 hồ, đã QC).",
        "'% thật' = tỷ lệ giờ có giá trị sau QC (không spike, không đoạn nội suy tuyến tính, không giá trị sai).",
        f"Trận lũ: đỉnh Q đến mùa 9–12, cách nhau ≥ {MIN_SEP_DAYS} ngày; cửa sổ trận = đỉnh −{WIN_BEFORE} h … +{WIN_AFTER} h.",
        "Sheet Tran_thi_diem: ghép đỉnh Sông Tranh 2 với đỉnh Đắk Mi 4 cách ≤ 48 h; 'Đủ dùng' khi Q đến và Q xả của cả hai hồ có ≥ 80% số liệu thật.",
        "CHƯA CÓ: số liệu trạm thủy văn trên sông (Nông Sơn, Giao Thủy, Câu Lâu, Hội An, Ái Nghĩa, Thành Mỹ) và mực nước triều – cần xin Đài KTTV.",
    ]})
    with pd.ExcelWriter(XLSX, engine="openpyxl") as xw:
        readme.to_excel(xw, sheet_name="Doc_truoc", index=False)
        total.to_excel(xw, sheet_name="Do_phu_tong", index=False)
        monthly.to_excel(xw, sheet_name="Do_phu_theo_thang", index=False)
        events.drop(columns="Năm").to_excel(xw, sheet_name="Tran_lu_tung_ho", index=False)
        pilot.to_excel(xw, sheet_name="Tran_thi_diem", index=False)
        for ws in xw.book.worksheets:
            for col in ws.columns:
                ws.column_dimensions[col[0].column_letter].width = min(60, max(10, max(len(str(c.value or "")) for c in col[:50]) + 2))
            ws.freeze_panes = "A2"

    print(total.to_string(index=False))
    print("\nTrận thí điểm (Sông Tranh 2 + Đắk Mi 4):")
    print(pilot.head(12).to_string(index=False))
    print("\nĐã chọn:", json.dumps({k: ev_json(v) for k, v in chosen.items()}, ensure_ascii=False, indent=1))
    print("→", XLSX)


if __name__ == "__main__":
    main()
