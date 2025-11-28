import FloodWarning from "../../core/entities/FloodWarning.js";
import { BaseRepository } from "./base.repo.js";

class FloodWarningRepository extends BaseRepository {
    constructor() {
        super(FloodWarning);
    }
}

export const floodWarningRepo = new FloodWarningRepository();
