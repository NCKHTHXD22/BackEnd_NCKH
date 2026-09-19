# data/clean_source_loader.py
"""
Doc du lieu SACH (da QC spike/doan-noi-suy-gia + mua da sua IDW, xem
ARIMAX/arimax_regional/qc.py va rain.py) tu data_clean_source/rid_{rid}.parquet
-- dung lam raw_df thay the load_inflow_rain_matrix (Excel goc, con loi mua +
lan tuong nham noi suy la quan trac that).

Schema: time | inflow | rain | water_level | outflow | inflow_is_real
  - inflow: gia tri THO (chua tach quan trac that/noi suy) -- dung lam dau vao
    dieu kien hoa (hindcast), van duoc noi suy them limit=6 nhu hanh vi cu.
  - rain: da sua IDW (renormalize theo gio, khop toa do GPS) -- thay cot
    "Mua luu vuc IDW" cu trong Excel (khong renormalize, tro nham tram).
  - inflow_is_real: True = gio nay la quan trac that (khong phai spike/doan
    noi suy tuyen tinh gia). dataset_builder.py dung cot nay de xuat
    v2_obs_mask.npy song song v2_y.npy.
"""
import os
import pandas as pd

CLEAN_SOURCE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data_clean_source"
)


def load_clean_source(rid: int, clean_source_dir: str = CLEAN_SOURCE_DIR) -> pd.DataFrame:
    """raw_df (time|inflow|rain|water_level|outflow|inflow_is_real) cho 1 ho,
    hoac DataFrame rong neu chua build san cho rid nay."""
    path = os.path.join(clean_source_dir, f"rid_{rid}.parquet")
    if not os.path.exists(path):
        return pd.DataFrame()
    return pd.read_parquet(path)
