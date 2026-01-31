import RainHistory from "../../core/entities/RainHistory.js";
import { rainHistoryService } from "../../services/rainHistory.service.js";

// Lấy toàn bộ lịch sử theo uuid
export const getHistoryByUUID = async (req, res) => {
  res.json(await rainHistoryService.getByUUID(req.params.uuid));
};

// Lấy lịch sử 24 giờ qua
export const getHistory24h = async (req, res) => {
  res.json(await rainHistoryService.get24h(req.params.uuid));
};

// Lấy lịch sử theo khoảng
export const getHistoryByRange = async (req, res) => {
  const { uuid } = req.params;
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: "Missing 'from' or 'to' query" });
  }

  res.json(await rainHistoryService.getByRange(uuid, from, to));
};

// 🔥 DELETE BY DATE
export const deleteHistoryByDate = async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "Missing 'date' query" });
  }

  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);

  const result = await RainHistory.deleteMany({
    timestamp: { $gte: start, $lte: end }
  });

  res.json({
    date,
    deletedCount: result.deletedCount
  });
};
