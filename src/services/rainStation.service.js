import { rainStationRepo } from "../infrastructure/repositories/rainStation.repo.js";

export const rainStationService = {
    getAll: () => rainStationRepo.findAll(),
    getById: (id) => rainStationRepo.findById(id),
    create: (data) => rainStationRepo.create(data),
    update: (id, data) => rainStationRepo.update(id, data),
    delete: (id) => rainStationRepo.delete(id)
};
