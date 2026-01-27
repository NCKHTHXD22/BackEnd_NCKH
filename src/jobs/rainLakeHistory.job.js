// src/jobs/rainLakeHistory.job.js
import cron from 'node-cron';
import rainLakeHistoryService from '../services/rainLakeHistory.service.js';

cron.schedule('0 * * * *', async () => {
  console.log('⏳ [CRON] RainLakeHistory (1h)');
  await rainLakeHistoryService.generateAt(new Date());
});
