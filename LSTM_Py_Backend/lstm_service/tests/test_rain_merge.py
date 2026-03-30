# tests/test_rain_merge.py
import sys
import os
from datetime import datetime, timedelta

# Thêm đường dẫn để import được các module
sys.path.append(os.path.join(os.getcwd(), "LSTM_Py_Backend", "lstm_service"))
sys.path.append(os.getcwd()) # For root imports if any

from data.data_fetcher import fetch_rain_data
from config.reservoirs import RESERVOIRS

def test_reservoir_rain(rid):
    info = RESERVOIRS.get(rid)
    if not info:
        print(f"❌ Không tìm thấy hồ {rid}")
        return

    print(f"\n--- TESTING RAIN FOR: {info['name']} (ID: {rid}) ---")
    
    # Giả lập thời gian hiện tại
    ref_time = datetime.now().replace(minute=0, second=0, microsecond=0)
    
    # Chạy hàm fetch tích hợp
    df = fetch_rain_data(rid, info["lat"], info["lon"], reference_time=ref_time, days=10)
    
    if df.empty:
        print("❌ Kết quả trả về rỗng!")
        return

    print(f"✅ Tổng số bản ghi nhận được: {len(df)}")
    print(f"📅 Bắt đầu: {df['time'].min()}")
    print(f"📅 Kết thúc: {df['time'].max()}")
    
    # Kiểm tra xem có dữ liệu Excel không (thông qua log in ra từ fetch_rain_data)
    # Ta có thể xem vài dòng dữ liệu
    print("\nSample Data:")
    print(df.tail(15))

if __name__ == "__main__":
    # Test cho hồ A Vương (ID: 1)
    test_reservoir_rain(1)
    
    # Test cho một hồ khác (ví dụ Sông Tranh 2: ID 4)
    test_reservoir_rain(4)
