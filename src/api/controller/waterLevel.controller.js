import { waterLevelService } from "../../services/waterLevel.service.js";

export const getAllWaterLevels = async (req, res) => {
    res.json(await waterLevelService.getAll());
};

export const getWaterLevelById = async (req, res) => {
    res.json(await waterLevelService.getById(req.params.id));
};

export const createWaterLevel = async (req, res) => {
    res.json(await waterLevelService.create(req.body));
};

export const updateWaterLevel = async (req, res) => {
    res.json(await waterLevelService.update(req.params.id, req.body));
};

export const deleteWaterLevel = async (req, res) => {
    res.json(await waterLevelService.delete(req.params.id));
};

// GET /api/water-level/observations/:code?from=&to=  – chuỗi mực nước của trạm (mặc định 3 ngày gần nhất)
import WaterLevelObservation from "../../core/entities/WaterLevelObservation.js";
export const getWaterLevelObservations = async (req, res, next) => {
    try {
        const to = req.query.to ? new Date(req.query.to) : new Date();
        const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 3 * 86400e3);
        if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: "from/to không hợp lệ" });
        if (to - from > 62 * 86400e3) return res.status(400).json({ error: "Khoảng thời gian tối đa 62 ngày" });
        const rows = await WaterLevelObservation.find({ station_code: req.params.code.toUpperCase(), t_obs: { $gte: from, $lte: to } })
            .sort({ t_obs: 1 }).select({ _id: 0, t_obs: 1, level: 1, qc_flag: 1 }).lean();
        res.json({ station_code: req.params.code.toUpperCase(), from, to, count: rows.length, data: rows });
    } catch (err) { next(err); }
};
