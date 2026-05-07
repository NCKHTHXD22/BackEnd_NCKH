import cron from "node-cron";
import inflowLakeHistoryService from "../services/inflowLakeHistory.service.js";

/**
 * ⏱️ Sync recent InflowLakeHistory data
 * Scheduled: Minutes 15 and 45 every hour
 * Delayed to wait for PCTT website updates (usually 15-30m late)
 */
cron.schedule("15,45 * * * *", async () => {
    try {
        console.log("⏳ [CRON] InflowLakeHistory Sync (30m)");
        await inflowLakeHistoryService.syncRecentData();
    } catch (err) {
        console.error("❌ [CRON] InflowLakeHistory Sync Error:", err.message);
    }
});
