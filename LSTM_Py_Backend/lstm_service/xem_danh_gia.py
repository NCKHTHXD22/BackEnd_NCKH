import pandas as pd
import os

print("="*60)
print("BÁO CÁO KẾT QUẢ ĐÁNH GIÁ MÔ HÌNH DỰ BÁO LƯU LƯỢNG (TEST 2025)")
print("="*60)

file_path = "ket_qua_finetune_2025.xlsx"
if not os.path.exists(file_path):
    print("❌ LỖI: Chưa tìm thấy file báo cáo. Quá trình Training có thể chưa hoàn tất!")
    exit(1)

try:
    df = pd.read_excel(file_path)
    
    # In dạng bảng
    print(df.to_string(index=False))
    
    # Tính trung bình
    print("-" * 60)
    print(f"🌟 TRUNG BÌNH TOÀN HỆ THỐNG:")
    print(f" - NSE trung bình : {df['NSE'].mean():.3f}")
    print(f" - MAE trung bình : {df['MAE'].mean():.2f}")
    print(f" - RMSE trung bình: {df['RMSE'].mean():.2f}")
    
    print("\n" + "="*60)
    print("📁 CÁC BIỂU ĐỒ TRỰC QUAN TỪNG HỒ ĐÃ ĐƯỢC LƯU TẠI:")
    print("   -> thư mục: artifacts/charts/")
    
    num_charts = len(os.listdir("artifacts/charts")) if os.path.exists("artifacts/charts") else 0
    print(f"   -> Số lượng biểu đồ sinh ra: {num_charts} / 16 hồ")
    if num_charts < 16:
        print("   (Lưu ý: Một số hồ có thể bị thiếu dữ liệu test nên không vẽ đồ thị)")
    print("============================================================")
    
except Exception as e:
    print("❌ Đã xảy ra lỗi khi đọc file:", e)
