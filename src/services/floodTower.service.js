import { floodTowerRepo } from "../infrastructure/repositories/floodTower.repo.js";

export const floodTowerService = {
    getAll: () => floodTowerRepo.findAll(),
    getById: (id) => floodTowerRepo.findById(id),
    create: (data) => floodTowerRepo.create(data),
    update: (id, data) => floodTowerRepo.update(id, data),
    delete: (id) => floodTowerRepo.delete(id)
};
