import cron from 'node-cron';
import rainLakeService from '../services/rainLake.service.js';

/**
 * ⏱️ Cron chạy mỗi 1 giờ (phút 0)
 * 0 * * * *
 */
cron.schedule('0 * * * *', async () => {
  console.log('⏳ [CRON] Bắt đầu đồng bộ RainLake sumDepth...');

  try {
    await rainLakeService.updateAllLakeSumDepth();
    console.log('✅ [CRON] Đồng bộ RainLake sumDepth hoàn tất');
  } catch (err) {
    console.error('❌ [CRON] Lỗi đồng bộ RainLake:', err.message);
  }
});
