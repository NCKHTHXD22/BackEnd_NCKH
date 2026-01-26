import cron from 'node-cron';
import rainLakeHistoryService from '../services/rainLakeHistory.service.js';

// chạy mỗi 1 giờ
cron.schedule('0 * * * *', async () => {
  console.log('⏳ [CRON] Tạo RainLakeHistory');
  await rainLakeHistoryService.generateAt(new Date());
});
