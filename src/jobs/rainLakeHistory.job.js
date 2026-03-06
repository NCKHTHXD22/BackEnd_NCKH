// src/jobs/rainLakeHistory.job.js
import cron from 'node-cron';
import rainLakeHistoryService from '../services/rainLakeHistory.service.js';

cron.schedule('2 * * * *', async () => {
  console.log('⏳ [CRON] RainLakeHistory (1h) - chạy lúc :02 để chờ fetchRainData xong');
  await rainLakeHistoryService.generateAt(new Date());
});
