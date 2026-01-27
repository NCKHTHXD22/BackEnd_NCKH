import RainHistory from "../../core/entities/RainHistory.js";
import { BaseRepository } from "./base.repo.js";

class RainHistoryRepository extends BaseRepository {
    constructor() {
        super(RainHistory);
    }

    getByUUID(uuid) {
        return RainHistory.find({ uuid }).sort({ timestamp: -1 });
    }

    getByUUIDAndRange(uuid, start, end) {
        return RainHistory.find({
            uuid,
            timestamp: { $gte: start, $lte: end }
        }).sort({ timestamp: 1 });
    }
}

export const rainHistoryRepo = new RainHistoryRepository();