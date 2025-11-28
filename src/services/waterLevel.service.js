import { waterLevelRepo } from "../infrastructure/repositories/waterLevel.repo.js";

export const waterLevelService = {
    getAll: () => waterLevelRepo.findAll(),
    getById: (id) => waterLevelRepo.findById(id),
    create: (data) => waterLevelRepo.create(data),
    update: (id, data) => waterLevelRepo.update(id, data),
    delete: (id) => waterLevelRepo.delete(id)
};
