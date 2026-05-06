import floodAlertService from '../../services/floodAlert.service.js';
import { runFloodAlertCheck } from '../../jobs/floodAlert.job.js';

class ReservoirAlertController {

    // GET /api/reservoir-alerts
    async getAlerts(req, res, next) {
        try {
            const alerts = await floodAlertService.getActiveAlerts();
            res.json(alerts);
        } catch (err) { next(err); }
    }

    // GET /api/reservoir-alerts/logs?lakeId=1&limit=50
    async getLogs(req, res, next) {
        try {
            const { lakeId, limit } = req.query;
            const logs = await floodAlertService.getOperationLogs(
                lakeId ? Number(lakeId) : null,
                limit  ? Number(limit)  : 50
            );
            res.json(logs);
        } catch (err) { next(err); }
    }

    // POST /api/reservoir-alerts/check — trigger thủ công (admin)
    async triggerCheck(req, res, next) {
        try {
            res.json({ message: 'Flood alert check triggered. Kết quả sẽ có trong vài giây.' });
            runFloodAlertCheck().catch(console.error);
        } catch (err) { next(err); }
    }
}

export default new ReservoirAlertController();
