import FloodTower from "../../core/entities/FloodTower.js";
import { BaseRepository } from "./base.repo.js";

class FloodTowerRepository extends BaseRepository {
    constructor() {
        super(FloodTower);
    }
}

export const floodTowerRepo = new FloodTowerRepository();
