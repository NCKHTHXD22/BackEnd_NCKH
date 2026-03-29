import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import glob
from config.reservoirs import RESERVOIRS
from data.idw_calculator import apply_idw
from data.vndms_rain_loader import load_all_vndms, get_station_timeseries

def get_folder_name(rid):
    res = RESERVOIRS.get(rid)
    if not res:
        return None
    return res["name"].replace(" ", "_")

def load_rain_matrix(rid, days=180):
    """
    Load dữ liệu mưa lưu vực IDW từ các file Excel trong Data_Tung_Ho_Ma_Tran_Rong
    """
    folder_name = get_folder_name(rid)
    if not folder_name:
        return pd.DataFrame()

    # Đường dẫn gốc (tương đối so với lstm_service)
    base_dir = os.path.join("LSTM_Project", "Data_Tung_Ho_Ma_Tran_Rong", folder_name)
    if not os.path.exists(base_dir):
        # Thử đường dẫn từ thư mục gốc dự án nếu cần
        base_dir = os.path.join("LSTM_Py_Backend", "lstm_service", "LSTM_Project", "Data_Tung_Ho_Ma_Tran_Rong", folder_name)
        if not os.path.exists(base_dir):
            print(f"  ⚠ Thư mục dữ liệu matrix không tồn tại: {base_dir}")
            return pd.DataFrame()

    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    all_data = []

    # Thu thập tháng cần lấy
    # Dùng list để lưu các mốc tháng tránh lỗi replace(day=31)
    months_to_load = []
    tmp = start_date.replace(day=1)
    while tmp <= end_date:
        months_to_load.append((tmp.year, tmp.month))
        # Sang tháng tiếp theo an toàn
        if tmp.month == 12:
            tmp = tmp.replace(year=tmp.year + 1, month=1)
        else:
            tmp = tmp.replace(month=tmp.month + 1)

    for y, m in months_to_load:
        filename = f"{folder_name}_{y}_{m:02d}.xlsx"
        filepath = os.path.join(base_dir, filename)
        
        if os.path.exists(filepath):
            print(f"  📂 Loading matrix file: {filename}")
            try:
                # Đọc Excel - chú ý: dữ liệu mưa thường bắt đầu từ cột Z (00h)
                df_raw = pd.read_excel(filepath, header=None)
                
                # Tìm hàng chứa header "00h", "01h",...
                header_row_idx = -1
                for i, row in df_raw.iterrows():
                    if "00h" in row.values:
                        header_row_idx = i
                        break
                
                if header_row_idx == -1:
                    print(f"  ⚠ Không tìm thấy header giờ trong {filepath}")
                    continue

                # Set header
                df_raw.columns = df_raw.iloc[header_row_idx]
                df = df_raw.iloc[header_row_idx+1:].copy()
                
                # Tìm cột ngày (thường là cột đầu tiên hoặc cột 'Ngày')
                date_col = df.columns[0] # Giả định cột 0 là ngày
                
                # Xác định các cột giờ (00h -> 23h)
                hour_cols = [f"{i:02d}h" for i in range(24)]
                
                # Tìm vị trí cột "Mưa lưu vực IDW" để lấy đúng dải 24 giờ của nó
                # (Vì file có thể có nhiều phần: Mưa trạm, Mưa IDW,...)
                # Dựa vào ảnh: Mưa IDW bắt đầu từ cột Z (idx 25)
                # Ta sẽ tìm cột "00h" ĐẦU TIÊN sau khi thấy text "IDW" hoặc dùng vị trí cố định nếu search text khó
                
                # Cách an toàn: Tìm range 24 cột liên tiếp từ 00h-23h
                # Trong ảnh của user, phần IDW nằm bên phải
                idw_start_col_idx = -1
                for idx, col_name in enumerate(df.columns):
                    if col_name == "00h" and idx > 10: # Bỏ qua 00h của trạm (thường nằm ở cột C, D,...)
                        idw_start_col_idx = idx
                        break
                
                if idw_start_col_idx == -1:
                    # Fallback dùng cột 00h đầu tiên nếu không thấy cái thứ 2
                    idw_start_col_idx = list(df.columns).index("00h")

                for _, row in df.iterrows():
                    day = row[df.columns[0]]
                    if pd.isna(day): continue
                    
                    # Convert to datetime if it's not
                    if not isinstance(day, datetime):
                        try:
                            day = pd.to_datetime(day)
                        except: continue

                    for h in range(24):
                        val = row[idw_start_col_idx + h]
                        # Clean value
                        try:
                            rain_val = float(val) if not pd.isna(val) else 0.0
                        except:
                            rain_val = 0.0
                            
                        timestamp = day.replace(hour=h, minute=0, second=0, microsecond=0)
                        all_data.append({"time": timestamp, "rain": rain_val})

            except Exception as e:
                print(f"  ⚠ Lỗi khi đọc {filepath}: {e}")

        else:
            print(f"  ❌ Matrix file missing: {filename}")

    if not all_data:
        return pd.DataFrame()

    res_df = pd.DataFrame(all_data)
    res_df = res_df.sort_values("time").drop_duplicates("time")
    
    # Filter theo khoảng thời gian yêu cầu
    res_df = res_df[(res_df["time"] >= start_date) & (res_df["time"] <= end_date)]
    
    return res_df.reset_index(drop=True)

def load_rain_from_stations(rid, start_date, end_date):
    """
    Tính mưa lưu vực IDW từ các file trạm thô trong Rain Data/DATA_RAIN_YYYY
    """
    try:
        # 1. Quét tìm các file trạm thô trong Rain Data dành cho năm hiện tại
        year = start_date.year
        data_dir = os.path.join("Rain Data", f"DATA_RAIN_{year}")
        if not os.path.exists(data_dir):
            data_dir = os.path.join("LSTM_Py_Backend", "lstm_service", "Rain Data", f"DATA_RAIN_{year}")
        
        if not os.path.exists(data_dir):
            return pd.DataFrame()

        # Tìm các file VNDMS_Mua_Theo_Gio_*.xlsx trong thư mục này
        search_pattern = os.path.join(data_dir, "VNDMS_Mua_Theo_Gio_*.xlsx")
        files = glob.glob(search_pattern)
        
        all_raw_data = []
        for f in files:
            # Dùng loader chung (đọc sheet mặc định hoặc All_Stations)
            try:
                # Thử đọc, nếu file thô chưa xử lý thì thường là sheet mặc định hoặc 'Sheet1'
                df_raw = pd.read_excel(f) 
                if "Station" not in df_raw.columns:
                    # Thử sheet 'All_Stations'
                    df_raw = pd.read_excel(f, sheet_name="All_Stations")
                
                # Melt dữ liệu tương tự vndms_rain_loader
                hour_cols = [f"{i:02d}h" for i in range(24)]
                available = [c for c in hour_cols if c in df_raw.columns]
                melted = df_raw.melt(id_vars=["Station", "Date"], value_vars=available, var_name="hour", value_name="rain")
                melted["time"] = pd.to_datetime(melted["Date"]) + pd.to_timedelta(melted["hour"].str.replace("h", "").astype(int), unit="h")
                
                result = pd.DataFrame({
                    "station": melted["Station"],
                    "time": melted["time"],
                    "rain": pd.to_numeric(melted["rain"], errors="coerce").fillna(0.0)
                })
                all_raw_data.append(result)
            except: pass

        if not all_raw_data:
            return pd.DataFrame()
        
        combined_raw = pd.concat(all_raw_data).drop_duplicates(["station", "time"])
        
        # 2. Tính IDW cho hồ rid
        basin_rain = apply_idw(combined_raw, rid, get_station_timeseries)
        
        # Filter theo thời gian
        basin_rain = basin_rain[(basin_rain["time"] >= start_date) & (basin_rain["time"] <= end_date)]
        return basin_rain

    except Exception as e:
        print(f"  ⚠ Lỗi khi tính IDW từ Rain Data: {e}")
        return pd.DataFrame()
