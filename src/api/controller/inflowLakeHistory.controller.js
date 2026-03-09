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
}

export default new InflowLakeHistoryController();
