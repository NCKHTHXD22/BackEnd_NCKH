import repo from "../infrastructure/repositories/rainLakeQLake.repo.js";
import { getHydroData } from "./external/hydroApi.service.js";
import { getRainLakeHistory } from "./external/rainLakeApi.service.js";

class RainLakeQLakeService {
  async syncLake({ lakeId, token, start, end }) {
    const hydroData = await getHydroData(token, start, end, lakeId);
    const rainData = await getRainLakeHistory(lakeId);

    const rainMap = {};
    rainData.forEach((r) => {
      rainMap[new Date(r.time).toISOString()] = r.sumdept;
    });

    const merged = hydroData.map((h) => {
      const t = new Date(h.thoigian);
      return {
        lakeId,
        time: t,
        q: h.q,
        rain: rainMap[t.toISOString()] ?? null
      };
    });

    return repo.bulkUpsert(merged);
  }

  async getDataset(lakeId, start, end) {
    return repo.findByLake(lakeId, start, end);
  }
}

export default new RainLakeQLakeService();
