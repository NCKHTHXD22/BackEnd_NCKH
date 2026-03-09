import cron from "node-cron";
import inflowLakeHistoryService from "../services/inflowLakeHistory.service.js";

/**
 * ⏱️ Sync recent InflowLakeHistory data
 * Scheduled: Every 1 hour at minute 15
 */
cron.schedule("15 * * * *", async () => {
    try {
        console.log("⏳ [CRON] InflowLakeHistory Sync (1h)");
        await inflowLakeHistoryService.syncRecentData();
    } catch (err) {
        console.error("❌ [CRON] InflowLakeHistory Sync Error:", err.message);
    }
});
