import FloodPost from "../../core/entities/FloodPost.js";
import { BaseRepository } from "./base.repo.js";

class PostRepository extends BaseRepository {
    constructor() {
        super(FloodPost);
    }

    async findWithPopulate(filter, populate = "user", { limit, skip } = {}) {
        let query = FloodPost.find(filter).populate(populate).sort({ createdAt: -1 });
        if (skip) query = query.skip(skip);
        if (limit) query = query.limit(limit);
        return query;
    }
}

export const postRepo = new PostRepository();
