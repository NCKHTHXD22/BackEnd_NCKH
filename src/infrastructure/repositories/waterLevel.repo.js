import WaterLevelStation from "../../core/entities/WaterLevelStation.js";
import { BaseRepository } from "./base.repo.js";

class WaterLevelRepository extends BaseRepository {
    constructor() {
        super(WaterLevelStation);
    }
}

export const waterLevelRepo = new WaterLevelRepository();
