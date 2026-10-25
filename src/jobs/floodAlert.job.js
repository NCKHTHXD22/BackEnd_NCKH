/**
 * Flood Alert Job — chạy mỗi 15 phút
 * 1. Lấy dữ liệu thực đo mới nhất + LSTM forecast
 * 2. Chạy water-balance → dự báo mực nước 24h
 * 3. Tạo/cập nhật ReservoirAlert nếu Z_forecast >= ngưỡng
 * 4. Ghi OperationLog
 *
 * Chỉ import file này từ danh sách CRON_JOBS trong server.js (import = khởi động lịch chạy).
 * Muốn chạy tay một lượt thì import runFloodAlertCheck từ services/floodAlert.service.js.
 */

import cron from 'node-cron';
import { runFloodAlertCheck } from '../services/floodAlert.service.js';

// Chạy mỗi 15 phút: :00, :15, :30, :45
cron.schedule('*/15 * * * *', runFloodAlertCheck);

// Chạy ngay lần đầu khi server khởi động (delay 10s để DB connect xong)
setTimeout(runFloodAlertCheck, 10_000);
