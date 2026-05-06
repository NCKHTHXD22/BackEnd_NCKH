import lakeCalcService from '../../services/lakeCalc.service.js';

class LakeSpecController {

    // GET /api/lake-specs
    async getAll(req, res, next) {
        try {
            const specs = await lakeCalcService.getAllSpecs();
            res.json(specs);
        } catch (err) { next(err); }
    }

    // GET /api/lake-specs/:lakeId
    async getOne(req, res, next) {
        try {
            const spec = await lakeCalcService.getSpec(req.params.lakeId);
            res.json(spec);
        } catch (err) { next(err); }
    }

    // GET /api/lake-specs/:lakeId/zv-curve
    async getZVCurve(req, res, next) {
        try {
            const curve = await lakeCalcService.getZVCurve(req.params.lakeId);
            res.json(curve);
        } catch (err) { next(err); }
    }

    // GET /api/lake-specs/:lakeId/volume?htl=175.5
    async volumeFromLevel(req, res, next) {
        try {
            const htl = parseFloat(req.query.htl);
            if (isNaN(htl)) return res.status(400).json({ error: 'Thiếu tham số htl' });
            const result = await lakeCalcService.volumeFromLevel(req.params.lakeId, htl);
            res.json(result);
        } catch (err) { next(err); }
    }

    // GET /api/lake-specs/:lakeId/power?htl=175.5&q_turbine=200
    async calcPower(req, res, next) {
        try {
            const htl       = parseFloat(req.query.htl);
            const qTurbine  = parseFloat(req.query.q_turbine);
            if (isNaN(htl) || isNaN(qTurbine)) return res.status(400).json({ error: 'Thiếu htl hoặc q_turbine' });
            const result = await lakeCalcService.calcPower(req.params.lakeId, htl, qTurbine);
            res.json(result);
        } catch (err) { next(err); }
    }

    // POST /api/lake-specs/:lakeId/water-balance
    // Body: { htl_now, q_in_series: [số hoặc {value, dt_hours}], q_out, dt_hours }
    async waterBalance(req, res, next) {
        try {
            const { htl_now, q_in_series, q_out, dt_hours } = req.body;
            if (htl_now == null || !Array.isArray(q_in_series) || q_out == null)
                return res.status(400).json({ error: 'Thiếu htl_now, q_in_series hoặc q_out' });
            const result = await lakeCalcService.waterBalance(
                req.params.lakeId,
                Number(htl_now),
                q_in_series,
                Number(q_out),
                Number(dt_hours) || 1
            );
            res.json(result);
        } catch (err) { next(err); }
    }

    // POST /api/lake-specs/:lakeId/operation-rec
    // Body: { htl, q_in, q_out, forecast_peak }
    async operationRec(req, res, next) {
        try {
            const { htl, q_in, q_out, forecast_peak } = req.body;
            if (htl == null || q_in == null || q_out == null)
                return res.status(400).json({ error: 'Thiếu htl, q_in hoặc q_out' });
            const result = await lakeCalcService.operationRecommendation(
                req.params.lakeId,
                Number(htl), Number(q_in), Number(q_out),
                forecast_peak != null ? Number(forecast_peak) : null
            );
            res.json(result);
        } catch (err) { next(err); }
    }
}

export default new LakeSpecController();
