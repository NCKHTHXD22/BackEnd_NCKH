/**
 * Proximity Alert Job — chạy mỗi 5 phút
 * Kiểm tra vị trí gần nhất (lastLocation) của từng user so với điểm ngập/
 * trạm mưa cực lớn, gửi push nếu trong bán kính cảnh báo cá nhân.
 * Khớp chu kỳ debounce 5 phút của bản client trong index.jsx.
 */

import cron from 'node-cron';
import proximityAlertService from '../services/proximityAlert.service.js';

async function runProximityAlertCheck() {
    const t0 = Date.now();
    try {
        const { checked, notified } = await proximityAlertService.checkAllUsers();
        if (notified > 0) {
            console.log(`  📍 [ProximityAlert] Đã kiểm tra ${checked} user, gửi ${notified} cảnh báo (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        }
    } catch (err) {
        console.error(`❌ [ProximityAlert] FAILED: ${err.message}`);
    }
}

cron.schedule('*/5 * * * *', runProximityAlertCheck);

// Chạy ngay lần đầu khi server khởi động (delay 15s để DB connect xong)
setTimeout(runProximityAlertCheck, 15_000);

export { runProximityAlertCheck };
