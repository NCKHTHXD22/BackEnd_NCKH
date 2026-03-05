import { Router } from 'express';
import ForecastHistory from '../../core/entities/ForecastHistory.js';

const router = Router();

// [TEMPORARY MIGRATION ROUTE] Drop old collection
router.get('/utils/drop-old-collection', async (req, res) => {
    try {
        const db = ForecastHistory.db.db;
        await db.collection('forecasthistories').drop();
        res.json({ success: true, message: "Dropped old collection 'forecasthistories'" });
    } catch (err) {
        if (err.codeName === 'NamespaceNotFound') {
            res.json({ success: true, message: "Collection 'forecasthistories' already dropped or does not exist." });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// POST /api/forecast-history — Lưu batch dự báo (từ AutoForecaster)
router.post('/', async (req, res) => {
    try {
        const items = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Body phải là mảng các forecast items' });
        }

        const bulkOps = items.map(item => ({
            updateOne: {
                filter: {
                    reservoirId: item.reservoirId ?? item.ReservoirId,
                    targetTime: new Date(item.targetTime ?? item.TargetTime),
                    rainSource: item.rainSource ?? item.RainSource ?? null,
                    createdAt: new Date(item.createdAt ?? item.CreatedAt)
                },
                update: {
                    $set: {
                        reservoirId: item.reservoirId ?? item.ReservoirId,
                        rainSource: item.rainSource ?? item.RainSource ?? null,
                        targetTime: new Date(item.targetTime ?? item.TargetTime),
                        value: item.value ?? item.Value ?? 0,
                        createdAt: new Date(item.createdAt ?? item.CreatedAt),
                        actual: item.actual ?? item.Actual ?? null,
                        error: item.error ?? item.Error ?? null,
                        percentError: item.percentError ?? item.PercentError ?? null
                    }
                },
                upsert: true
            }
        }));

        const result = await ForecastHistory.bulkWrite(bulkOps, { ordered: false });
        res.json({
            success: true,
            upserted: result.upsertedCount,
            modified: result.modifiedCount,
            total: items.length
        });
    } catch (err) {
        console.error('❌ [FORECAST-HISTORY] POST error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forecast-history/:reservoirId — Lấy tất cả dự báo của 1 hồ
router.get('/:reservoirId', async (req, res) => {
    try {
        const { reservoirId } = req.params;
        const { rainSource, days } = req.query;

        const filter = { reservoirId: Number(reservoirId) };
        if (rainSource) filter.rainSource = rainSource;
        if (days) filter.targetTime = { $gte: new Date(Date.now() - Number(days) * 86400000) };

        const data = await ForecastHistory.find(filter)
            .sort({ targetTime: -1, createdAt: -1 })
            .limit(1000)
            .lean();

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/forecast-history/:reservoirId/:rainSource — Lọc theo nguồn mưa
router.get('/:reservoirId/:rainSource', async (req, res) => {
    try {
        const { reservoirId, rainSource } = req.params;
        const { days } = req.query;

        const filter = { reservoirId: Number(reservoirId), rainSource };
        if (days) filter.targetTime = { $gte: new Date(Date.now() - Number(days) * 86400000) };

        const data = await ForecastHistory.find(filter)
            .sort({ targetTime: -1, createdAt: -1 })
            .limit(500)
            .lean();

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
