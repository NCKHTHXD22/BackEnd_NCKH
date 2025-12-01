import RainStation from "../../core/entities/RainStation.js";
import { BaseRepository } from "./base.repo.js";

class RainStationRepository extends BaseRepository {
    constructor() {
        super(RainStation);
    }

    // upsert theo uuid (đúng chuẩn)
    async upsertByUUID(data) {
        return RainStation.findOneAndUpdate(
            { uuid: data.uuid },
            { $set: data },
            { upsert: true, new: true }
        );
    }
}

export const rainStationRepo = new RainStationRepository();
