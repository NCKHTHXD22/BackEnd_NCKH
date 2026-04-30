import inflowLakeHistoryService from "../../services/inflowLakeHistory.service.js";

class InflowLakeHistoryController {
    async getDataset(req, res, next) {
        try {
            const { lakeId } = req.params;
            const { start, end } = req.query;

            const data = await inflowLakeHistoryService.getDataset(
                Number(lakeId),
                start ? new Date(start) : undefined,
                end ? new Date(end) : undefined
            );

            res.json(data);
        } catch (err) {
            next(err);
        }
    }

    async backfill(req, res, next) {
        try {
            console.log('🔄 Triggering manual backfill for InflowLakeHistory from 2026-01-01');
            res.json({ message: "Backfill started in background. Check server logs." });

            // Execute asynchronously so the request doesn't timeout
            inflowLakeHistoryService.backfillData().catch(err => {
                console.error("❌ Backfill failed:", err.message);
            });

        } catch (err) {
            next(err);
        }
    }

    async cleanAndBackfill(req, res, next) {
        try {
            console.log('🧹 [CLEAN-BACKFILL] Triggered: delete all + re-backfill with correct timestamps');
            res.json({ message: "Clean + Backfill started in background. All old records deleted, re-importing from 2026-01-01. Check server logs." });

            inflowLakeHistoryService.cleanAndBackfillData().catch(err => {
                console.error("❌ Clean+Backfill failed:", err.message);
            });

        } catch (err) {
            next(err);
        }
    }

    async syncRecent(req, res, next) {
        try {
            console.log('🔄 [SYNC] Manual sync triggered from Web');
            // Cập nhật history từ scraper/api
            await inflowLakeHistoryService.syncRecentData();
            // Sau đó cập nhật bảng Live cho Dashboard
            const inflowLakeService = (await import("../../services/inflowLake.service.js")).default;
            await inflowLakeService.updateAllLakeFromHistory();
            
            res.json({ message: "Đã đồng bộ xong dữ liệu mới nhất từ trang PCTT." });
        } catch (err) {
            next(err);
        }
    }
}

export default new InflowLakeHistoryController();
