"""
rain_matrix_loader.py
Đọc dữ liệu từ Data_Tung_Ho_Ma_Tran_Rong/*.xlsx — mỗi file là 1 tháng, định dạng wide.

Cấu trúc MỚI (sau update_excel_z_qout.py):
  Col 0      : ngày (datetime)
  Col 1-24   : Mực nước Z (m)          — giờ 00h→23h
  Col 25-48  : Lưu lượng đến (m3/s)    — giờ 00h→23h
  Col 49-72  : Lưu lượng xả (m3/s)     — giờ 00h→23h
  Col 73-96  : Mưa lưu vực IDW (mm)    — giờ 00h→23h
  Col 97-120 : Mưa Dự Báo P50 (bỏ qua)
  Col 121+   : Dữ liệu trạm riêng lẻ (bỏ qua)

Cấu trúc CŨ (tương thích ngược — tự động phát hiện):
  Col 0      : ngày (datetime)
  Col 1-24   : Lưu lượng đến (m3/s)
  Col 25-48  : Mưa lưu vực IDW (mm)
  Col 49-72  : Mưa Dự Báo P50 (bỏ qua)
  Col 73+    : Dữ liệu trạm riêng lẻ (bỏ qua)
"""
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from config.reservoirs import RESERVOIRS


# --------------------------------------------------------------------------- #
#  Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _get_folder_name(rid: int) -> str | None:
    res = RESERVOIRS.get(rid)
    if not res:
        return None
    return res["name"].replace(" ", "_")


def _resolve_base_dir(folder_name: str) -> str | None:
    candidates = [
        os.path.join("LSTM_Project", "Data_Tung_Ho_Ma_Tran_Rong", folder_name),
        os.path.join("Data_Tung_Ho_Ma_Tran_Rong", folder_name),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def _months_between(start_date, end_date):
    """Yield (year, month) tuples from start_date.month to end_date.month inclusive."""
    cur = start_date.replace(day=1)
    while cur <= end_date:
        yield cur.year, cur.month
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)


def _detect_schema(df_raw: pd.DataFrame, feature_row_idx: int) -> dict:
    """
    Tự động phát hiện cấu trúc file Excel (cũ hay mới).

    Trả về dict với các key:
        z_start      : cột bắt đầu Z (None nếu file cũ)
        inflow_start : cột bắt đầu Inflow
        qout_start   : cột bắt đầu Q_out (None nếu file cũ)
        rain_start   : cột bắt đầu Rain IDW
    """
    feat_row = df_raw.iloc[feature_row_idx].astype(str).str.strip().str.lower().tolist()

    # Phát hiện cấu trúc MỚI: row 0 chứa "mực nước"
    has_z = any("m\u1ef1c n\u01b0\u1edbc" in v or "muc nuoc" in v for v in feat_row)

    if has_z:
        # Cấu trúc MỚI
        return {
            "z_start":      1,
            "inflow_start": 25,
            "qout_start":   49,
            "rain_start":   73,
        }
    else:
        # Cấu trúc CŨ (tương thích ngược)
        return {
            "z_start":      None,
            "inflow_start": 1,
            "qout_start":   None,
            "rain_start":   25,
        }


def _parse_monthly_file(filepath: str, inflow_start: int = None, rain_start: int = None):
    """
    Đọc 1 file Excel tháng, trả về DataFrame dạng dài:
      time (datetime) | inflow (m3/s) | rain (mm) | water_level (m) | outflow (m3/s)

    Tự động phát hiện cấu trúc cũ/mới qua _detect_schema().

    Cấu trúc file (0-indexed cols, header=None):
      row 0 : tên phần (Feature / Mực nước / Lưu lượng đến / ... / Mưa IDW / ...)
      row 1 : nhãn giờ  (Hour / 00h / 01h / ... / 23h / 00h / ...)
      row 2 : metadata  (Tên Hồ: ...)
      row 3+: dữ liệu   (date | val_00h | val_01h | ...)
    """
    try:
        df_raw = pd.read_excel(filepath, header=None, dtype=object)
    except Exception as e:
        print(f"  [WARN] Khong doc duoc {filepath}: {e}")
        return pd.DataFrame()

    # Tìm hàng chứa nhãn giờ "00h"
    header_row_idx = -1
    for i, row in df_raw.iterrows():
        if "00h" in row.values:
            header_row_idx = i
            break
    if header_row_idx == -1:
        return pd.DataFrame()

    feature_row_idx = header_row_idx - 1

    # Phát hiện schema (cũ / mới)
    if inflow_start is None or rain_start is None:
        schema = _detect_schema(df_raw, feature_row_idx)
    else:
        # Cho phép override thủ công (dùng bởi code cũ)
        schema = {
            "z_start":      None,
            "inflow_start": inflow_start,
            "qout_start":   None,
            "rain_start":   rain_start,
        }

    z_start      = schema["z_start"]
    inflow_start = schema["inflow_start"]
    qout_start   = schema["qout_start"]
    rain_start   = schema["rain_start"]

    # Dữ liệu bắt đầu từ 2 hàng sau header (bỏ qua hàng metadata "Tên Hồ")
    data_start = header_row_idx + 2
    df_data = df_raw.iloc[data_start:].reset_index(drop=True)

    records = []
    for _, row in df_data.iterrows():
        raw_date = row.iloc[0]
        if pd.isna(raw_date):
            continue
        try:
            day = pd.to_datetime(raw_date)
        except Exception:
            continue

        for h in range(24):
            ts = day.replace(hour=h, minute=0, second=0, microsecond=0)

            # Inflow
            try:
                q_val = float(row.iloc[inflow_start + h])
                if np.isnan(q_val) or q_val < 0:
                    q_val = np.nan
            except Exception:
                q_val = np.nan

            # Rain IDW
            try:
                r_val = float(row.iloc[rain_start + h])
                if np.isnan(r_val) or r_val < 0:
                    r_val = 0.0
            except Exception:
                r_val = 0.0

            # Water level Z (chỉ có ở cấu trúc mới)
            wl_val = np.nan
            if z_start is not None:
                try:
                    wl = float(row.iloc[z_start + h])
                    wl_val = wl if not np.isnan(wl) else np.nan
                except Exception:
                    wl_val = np.nan

            # Q_out / outflow (chỉ có ở cấu trúc mới)
            qout_val = np.nan
            if qout_start is not None:
                try:
                    qt = float(row.iloc[qout_start + h])
                    qout_val = qt if not np.isnan(qt) else np.nan
                except Exception:
                    qout_val = np.nan

            records.append({
                "time":        ts,
                "inflow":      q_val,
                "rain":        r_val,
                "water_level": wl_val,
                "outflow":     qout_val,
            })

    if not records:
        return pd.DataFrame()

    return pd.DataFrame(records)


# --------------------------------------------------------------------------- #
#  Public API                                                                   #
# --------------------------------------------------------------------------- #

def load_inflow_rain_matrix(rid: int,
                             start_date=None,
                             end_date=None,
                             days: int = None) -> pd.DataFrame:
    """
    Trả về DataFrame hourly:
      time | inflow (m3/s) | rain (mm) | water_level (m) | outflow (m3/s)

    Tự động phát hiện cấu trúc file (cũ/mới).
    - water_level và outflow sẽ là NaN nếu file còn ở cấu trúc cũ.
    - inflow có thể chứa NaN (sẽ được interpolate ở dataset_builder).
    - rain = 0 nếu thiếu.

    Args:
        rid        : reservoir ID
        start_date : pd.Timestamp hoặc datetime
        end_date   : pd.Timestamp hoặc datetime
        days       : nếu start_date=None, tính ngược từ end_date
    """
    folder_name = _get_folder_name(rid)
    if not folder_name:
        return pd.DataFrame()

    base_dir = _resolve_base_dir(folder_name)
    if not base_dir:
        print(f"  [WARN] Khong tim thay thu muc: {folder_name}")
        return pd.DataFrame()

    if end_date is None:
        end_date = datetime.now()
    if start_date is None:
        start_date = end_date - timedelta(days=(days or 180))

    start_date = pd.Timestamp(start_date)
    end_date   = pd.Timestamp(end_date)

    all_frames = []
    for y, m in _months_between(start_date, end_date):
        fname = f"{folder_name}_{y}_{m:02d}.xlsx"
        fpath = os.path.join(base_dir, fname)
        if not os.path.exists(fpath):
            print(f"  [WARN] Thieu file: {fname}")
            continue
        df = _parse_monthly_file(fpath)
        if not df.empty:
            all_frames.append(df)

    if not all_frames:
        return pd.DataFrame()

    result = pd.concat(all_frames, ignore_index=True)
    result = result.sort_values("time").drop_duplicates("time")
    result = result[
        (result["time"] >= start_date) &
        (result["time"] <= end_date)
    ].reset_index(drop=True)

    return result


# --------------------------------------------------------------------------- #
#  Legacy: chỉ rain (tương thích ngược với code cũ)                            #
# --------------------------------------------------------------------------- #

def load_rain_matrix(rid: int,
                     start_date=None,
                     end_date=None,
                     days: int = None) -> pd.DataFrame:
    """Trả về DataFrame: time | rain  (chỉ mưa IDW, tương thích cũ)."""
    df = load_inflow_rain_matrix(rid, start_date=start_date,
                                  end_date=end_date, days=days)
    if df.empty:
        return df
    return df[["time", "rain"]].reset_index(drop=True)
