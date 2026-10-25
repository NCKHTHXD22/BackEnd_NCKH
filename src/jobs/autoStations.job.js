import cron from 'node-cron';
import { syncMuangap } from '../services/muangapWater.service.js';
import { syncVrain } from '../services/vrainFlood.service.js';

/**
 * ⏱️ Mỗi giờ phút 25: trạm mực nước tự động (muangap.danang.gov.vn – chỉ có giá trị hiện tại, lấy hàng giờ để
 * tích lũy chuỗi) và tháp báo ngập/lũ VRain (mucnuoc.vrain.vn – số liệu theo giờ 2 ngày gần nhất).
 */
cron.schedule('25 * * * *', async () => {
    try {
        const m = await syncMuangap();
        console.log(`✅ [CRON] Muangap: ${m.stations} trạm mực nước, ${m.with_data} có số liệu (mới ${m.upserted})`);
    } catch (err) {
        console.error('❌ [CRON] Muangap:', err.message);
    }
    try {
        const v = await syncVrain();
        console.log(`✅ [CRON] VRain: ${v.towers} tháp, ${v.observations} số liệu giờ (mới ${v.upserted})`);
    } catch (err) {
        console.error('❌ [CRON] VRain:', err.message);
    }
});
