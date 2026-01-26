import mongoose from 'mongoose';
import rainLakeHistoryService from '../services/rainLakeHistory.service.js';
import { ENV } from '../api/config/env.js';

(async () => {
  try {
    await mongoose.connect(ENV.MONGODB_URI);

    console.log('🚀 Bắt đầu backfill RainLakeHistory...');
    await rainLakeHistoryService.backfillFromRainHistory();

    console.log('🎉 Backfill hoàn tất');
    process.exit();
  } catch (err) {
    console.error('❌ Backfill lỗi:', err.message);
    process.exit(1);
  }
})();
