"""Bước 18 – Mô hình triều Sơn Trà bằng phân tích điều hòa (lộ trình 5.3).

Chuỗi giờ Sơn Trà 1983–2009 (17_station_levels.py, mặt chuẩn của chuỗi dfs0 – dao động quanh 0 m) → hằng số điều hòa
(UTide, Codiga 2011). Hiệu chỉnh trên 2000–2007, kiểm tra trên 2008–2009 (không dùng để hiệu chỉnh).
Dùng: dự tính triều thiên văn cho bất kỳ thời điểm nào → biên cửa sông cho bản đồ ngập theo mực nước (19_hand_stage.py)
và tách phần triều trong mực nước Hội An, Câu Lâu. Không gồm nước dâng do bão/gió – phần dư (đo − triều) ghi kèm.

Đầu ra: data/compute/tide_sontra.json – hằng số điều hòa + sai số kiểm tra
Chạy:   digital_twin/.venv/Scripts/python digital_twin/scripts/18_tide_sontra.py
"""
import json
import warnings

import numpy as np
import pandas as pd
import utide

from config import ROOT, WORK

warnings.filterwarnings("ignore")
COMPUTE = ROOT / "data" / "compute"
LAT = 16.10                      # Sơn Trà (Tiên Sa)

h = pd.read_parquet(WORK / "station_levels_hourly.parquet")
s = h[(h.station_code == "SONTRA") & (h.qc_flag == "ok") & (h.source == "gio_lien_tuc")].set_index("t_vn").level_m
s = s[~s.index.duplicated()].sort_index()
fit, test = s["2000":"2007"], s["2008":"2009"]
t_utc = lambda idx: (idx - pd.Timedelta(hours=7)).to_pydatetime()


def predict(coef, idx):
    return pd.Series(utide.reconstruct(t_utc(idx), coef, verbose=False).h, index=idx)


coef = utide.solve(t_utc(fit.index), fit.values, lat=LAT, method="ols", conf_int="none", trend=False, verbose=False)
res = test - predict(coef, test.index)
rmse = float(np.sqrt((res ** 2).mean()))
var_expl = float(1 - res.var() / test.var())
order = np.argsort(-coef.A)
const = [{"name": coef.name[i], "amp_m": round(float(coef.A[i]), 4), "phase_deg": round(float(coef.g[i]), 2)}
         for i in order if coef.A[i] >= 0.005]
out = {
    "station": "Sơn Trà (Tiên Sa) 71545", "lat": LAT, "datum": "như chuỗi giờ dfs0 1983–2009 (mực nước trung bình ≈ 0 m)",
    "time_zone": "hằng số tính theo UTC; dự tính cho giờ Việt Nam = UTC+7",
    "fit_period": [str(fit.index.min()), str(fit.index.max())], "n_fit": int(len(fit)),
    "check_2008_2009": {"rmse_m": round(rmse, 3), "variance_explained": round(var_expl, 3),
                        "residual_p99_m": round(float(res.abs().quantile(0.99)), 3), "n": int(len(test))},
    "mean_m": round(float(coef.mean), 4),
    "constituents": const,
    "note": "Triều thiên văn – không gồm nước dâng bão/gió và lũ. Ngoài khoảng 2000–2009 có thể lệch do thay đổi mực nước biển trung bình.",
}
(COMPUTE / "tide_sontra.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
# lưu bộ hệ số đầy đủ cho bước khác dùng lại
import pickle
with open(WORK / "tide_sontra_coef.pkl", "wb") as f:
    pickle.dump(coef, f)
print(f"Hiệu chỉnh 2000–2007 ({len(fit):,} giờ), kiểm tra 2008–2009: RMSE {rmse:.3f} m, giải thích {var_expl:.1%} phương sai")
print("Sóng chính:", ", ".join(f"{c['name']} {c['amp_m']:.3f} m" for c in const[:8]))
for ev, a, b in [("10/2025", "2025-10-26", "2025-11-02"), ("11/2025", "2025-11-15", "2025-11-22")]:
    p = predict(coef, pd.date_range(a, b, freq="h"))
    print(f"Triều dự tính {ev}: {p.min():.2f} … {p.max():.2f} m")
