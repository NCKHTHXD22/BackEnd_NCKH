import FloodPost from "../../core/entities/FloodPost.js";
import { BaseRepository } from "./base.repo.js";

class PostRepository extends BaseRepository {
    constructor() {
        super(FloodPost);
    }

    async findWithPopulate(filter, populate = "user") {
        return FloodPost.find(filter).populate(populate);
    }
}

export const postRepo = new PostRepository();
