/**
 * Flood Alert Job — chạy mỗi 15 phút
 * 1. Lấy dữ liệu thực đo mới nhất + LSTM forecast
 * 2. Chạy water-balance → dự báo mực nước 24h
 * 3. Tạo/cập nhật ReservoirAlert nếu Z_forecast >= ngưỡng
 * 4. Ghi OperationLog
 */

import cron from 'node-cron';
import floodAlertService from '../services/floodAlert.service.js';

async function runFloodAlertCheck() {
    const t0 = Date.now();
    const vnTime = new Date(t0 + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`\n🚨 [FloodAlert] START CHECK @ ${vnTime} VN`);

    try {
        const results = await floodAlertService.checkAllLakes();

        const danger  = results.filter(r => r.alert_level === 'danger').length;
        const warning = results.filter(r => r.alert_level === 'warning').length;
        const watch   = results.filter(r => r.alert_level === 'watch').length;
        const normal  = results.filter(r => r.alert_level === 'normal').length;

        console.log(`📊 [FloodAlert] Done ${((Date.now()-t0)/1000).toFixed(1)}s | ` +
            `🔴 danger=${danger} 🟡 warning=${warning} 🔵 watch=${watch} ✅ normal=${normal}\n`);
    } catch (err) {
        console.error(`❌ [FloodAlert] FAILED: ${err.message}`);
    }
}

// Chạy mỗi 15 phút: :00, :15, :30, :45
cron.schedule('*/15 * * * *', runFloodAlertCheck);

// Chạy ngay lần đầu khi server khởi động (delay 10s để DB connect xong)
setTimeout(runFloodAlertCheck, 10_000);

export { runFloodAlertCheck };
