# Hướng dẫn lấy Model từ Colab về local

Sau khi quá trình huấn luyện (training) trên Google Colab hoàn tất, bạn cần thực hiện các bước sau để đưa model vào sử dụng ở Backend cục bộ:

1. **Tìm file trên Google Drive**:
   - Truy cập vào thư mục `LSTM_Project/lstm_service/artifacts` trên Drive của bạn.
   - Tìm hai file: `inflow_model.pt` (trọng số mô hình tốt nhất) và `global_scaler.pkl` (bộ chuẩn hóa dữ liệu).

2. **Tải xuống và sao chép**:
   - Tải 2 file trên về máy tính.
   - Chép chúng vào thư mục: `d:\VoNguyenAn\Demo Code VS\BackEnd_NCKH\LSTM_Py_Backend\lstm_service\artifacts\`

3. **Kiểm tra**:
   - Đảm bảo tên file chính xác là `inflow_model.pt` và `global_scaler.pkl`.
   - Các script `main_predict.py` và `main_api.py` (sắp tạo) sẽ tự động tìm kiếm trong thư mục này.

---
*Lưu ý: Nếu bạn train lại trên Colab, hãy nhớ cập nhật lại các file này ở local để Backend sử dụng kết quả mới nhất.*
