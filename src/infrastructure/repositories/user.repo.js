import User from "../../core/entities/User.js";
import { BaseRepository } from "./base.repo.js";

class UserRepository extends BaseRepository {
    constructor() {
        super(User);
    }

    async findByClerkId(clerkId) {
        return User.findOne({ clerkId });
    }
}

export const userRepo = new UserRepository();
