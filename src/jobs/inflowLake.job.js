import cron from 'node-cron';
import inflowLakeService from '../services/inflowLake.service.js';

/**
 * ⏱️ Cron chạy mỗi 1 giờ (phút 0)
 * 0 * * * *
 */
cron.schedule('3 * * * *', async () => {
    console.log('⏳ [CRON] Bắt đầu đồng bộ InflowLake (History + Hydro)...');

    try {
        await inflowLakeService.updateAllLakeFromHistory();
        await inflowLakeService.syncAllLakeHydroData();
        console.log('✅ [CRON] Đồng bộ InflowLake hoàn tất');
    } catch (err) {
        console.error('❌ [CRON] Lỗi đồng bộ InflowLake:', err.message);
    }
});
