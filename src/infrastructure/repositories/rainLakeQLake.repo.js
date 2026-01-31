import RainLakeQLake from "../../core/entities/RainLake_QLake.js";

class RainLakeQLakeRepo {
  async bulkUpsert(docs) {
    if (!docs.length) return;

    const ops = docs.map((d) => ({
      updateOne: {
        filter: { lakeId: d.lakeId, time: d.time },
        update: { $set: d },
        upsert: true
      }
    }));

    return RainLakeQLake.bulkWrite(ops);
  }

  async findByLake(lakeId, start, end) {
    return RainLakeQLake.find({
      lakeId,
      time: { $gte: start, $lte: end }
    }).sort({ time: 1 });
  }

  async findLatest(lakeId, limit = 24) {
    return RainLakeQLake.find({ lakeId })
      .sort({ time: -1 })
      .limit(limit);
  }
}

export default new RainLakeQLakeRepo();
