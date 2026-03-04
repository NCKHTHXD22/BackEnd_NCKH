import Help from "../../core/entities/Help.js";
import { BaseRepository } from "./base.repo.js";

class HelpRepository extends BaseRepository {
    constructor() {
        super(Help);
    }
}

export const helpRepo = new HelpRepository();
