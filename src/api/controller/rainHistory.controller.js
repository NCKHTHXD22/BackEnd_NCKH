import { rainHistoryService } from "../../services/rainHistory.service.js";

// Lấy toàn bộ lịch sử theo uuid
export const getHistoryByUUID = async (req, res) => {
    res.json(await rainHistoryService.getByUUID(req.params.uuid));
};

// Lấy lịch sử 24 giờ qua
export const getHistory24h = async (req, res) => {
    res.json(await rainHistoryService.get24h(req.params.uuid));
};

// Lấy lịch sử theo khoảng thời gian
export const getHistoryByRange = async (req, res) => {
    const { uuid } = req.params;
    const { from, to } = req.query;

    if (!from || !to)
        return res.status(400).json({ error: "Missing 'from' or 'to' query" });

    res.json(await rainHistoryService.getByRange(uuid, from, to));
};
