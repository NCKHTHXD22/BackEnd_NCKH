import InflowLakeHistory from "../../core/entities/InflowLakeHistory.js";

class InflowLakeHistoryRepo {
    async bulkUpsert(docs) {
        if (!docs || docs.length === 0) return;

        const ops = docs.map((d) => ({
            updateOne: {
                filter: { Id_Lake: d.Id_Lake, timestamp: d.timestamp },
                update: { $set: d },
                upsert: true
            }
        }));

        // ordered: false helps to continue inserting even if there are occasional unique index conflicts 
        return InflowLakeHistory.bulkWrite(ops, { ordered: false });
    }

    async findByLake(lakeId, start, end) {
        return InflowLakeHistory.find({
            Id_Lake: lakeId,
            timestamp: { $gte: start, $lte: end }
        }).sort({ timestamp: 1 });
    }

    async findLatest(lakeId, limit = 24) {
        return InflowLakeHistory.find({ Id_Lake: lakeId })
            .sort({ timestamp: -1 })
            .limit(limit);
    }
}

export default new InflowLakeHistoryRepo();
