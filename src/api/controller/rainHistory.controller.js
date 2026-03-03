import RainHistory from "../../core/entities/RainHistory.js";
import { rainHistoryService } from "../../services/rainHistory.service.js";

export const getHistoryByUUID = async (req, res) => {
  res.json(await rainHistoryService.getByUUID(req.params.uuid));
};

export const getHistory24h = async (req, res) => {
  res.json(await rainHistoryService.get24h(req.params.uuid));
};

export const getHistoryByRange = async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to)
    return res.status(400).json({ error: "Missing from/to" });

  res.json(
    await rainHistoryService.getByRange(req.params.uuid, from, to)
  );
};

export const deleteHistoryByDate = async (req, res) => {
  const { date } = req.query;

  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);

  const result = await RainHistory.deleteMany({
    timestamp: { $gte: start, $lte: end }
  });

  res.json({ deleted: result.deletedCount });
};
