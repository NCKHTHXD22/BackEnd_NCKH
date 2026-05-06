import sys
import os
import pandas as pd
from datetime import datetime, timedelta
import glob

sys.path.append(os.path.join(os.getcwd(), "LSTM_Py_Backend", "lstm_service"))
from config.reservoirs import RESERVOIRS

def get_folder_name(rid):
    res = RESERVOIRS.get(rid)
    return res["name"].replace(" ", "_")

def deep_debug_load(rid):
    folder_name = get_folder_name(rid)
    base_dir = os.path.join("LSTM_Py_Backend", "lstm_service", "LSTM_Project", "Data_Tung_Ho_Ma_Tran_Rong", folder_name)
    
    print(f"Base Dir: {base_dir}")
    print(f"Exists: {os.path.exists(base_dir)}")
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=180)
    print(f"Searching from {start_date} to {end_date}")
    
    current = start_date.replace(day=1)
    total_found = 0
    
    while current <= end_date:
        year_month = current.strftime("%Y_%m")
        filename = f"{folder_name}_{year_month}.xlsx"
        filepath = os.path.join(base_dir, filename)
        
        exists = os.path.exists(filepath)
        print(f"Checking {filename}: {'✅ FOUND' if exists else '❌ NOT FOUND'}")
        
        if exists:
            try:
                df_test = pd.read_excel(filepath, header=None)
                print(f"  -> Shape: {df_test.shape}")
                # Tìm header 00h
                header_row = -1
                for i, row in df_test.iterrows():
                    if "00h" in row.values:
                        header_row = i
                        break
                print(f"  -> Header row: {header_row}")
                
                # Kiểm tra cột 00h IDW (lấy cột 00h cuối cùng hoặc sau idx 10)
                if header_row != -1:
                    cols = df_test.iloc[header_row].values
                    h_indices = [idx for idx, val in enumerate(cols) if val == "00h"]
                    print(f"  -> 00h indices: {h_indices}")
                    
            except Exception as e:
                print(f"  -> Error reading: {e}")
        
        # Next month
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)

deep_debug_load(1)
