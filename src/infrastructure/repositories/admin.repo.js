import Admin from "../../core/entities/Admin.js";
import { BaseRepository } from "./base.repo.js";

class AdminRepository extends BaseRepository {
    constructor() {
        super(Admin);
    }

    async findByUsername(username) {
        return Admin.findOne({ username });
    }
}

export const adminRepo = new AdminRepository();
