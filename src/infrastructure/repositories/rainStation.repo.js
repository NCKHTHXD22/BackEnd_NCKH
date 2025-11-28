import RainStation from "../../core/entities/RainStation.js";
import { BaseRepository } from "./base.repo.js";

class RainStationRepository extends BaseRepository {
    constructor() {
        super(RainStation);
    }
}

export const rainStationRepo = new RainStationRepository();
