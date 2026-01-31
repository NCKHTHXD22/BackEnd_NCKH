import service from "../../services/rainLakeQLake.service.js";

class RainLakeQLakeController {
  async sync(req, res, next) {
    try {
      const { lakeId } = req.params;
      const { start, end } = req.query;
      const token = req.headers.authorization?.replace("Bearer ", "");

      await service.syncLake({
        lakeId: Number(lakeId),
        token,
        start: new Date(start),
        end: new Date(end)
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async dataset(req, res, next) {
    try {
      const { lakeId } = req.params;
      const { start, end } = req.query;

      const data = await service.getDataset(
        Number(lakeId),
        new Date(start),
        new Date(end)
      );

      res.json(data);
    } catch (err) {
      next(err);
    }
  }
}

export default new RainLakeQLakeController();
