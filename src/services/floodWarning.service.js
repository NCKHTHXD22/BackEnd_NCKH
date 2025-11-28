import { floodWarningRepo } from "../infrastructure/repositories/floodWarning.repo.js";

export const floodWarningService = {
    getAll: () => floodWarningRepo.findAll(),
    getById: (id) => floodWarningRepo.findById(id),
    create: (data) => floodWarningRepo.create(data),
    update: (id, data) => floodWarningRepo.update(id, data),
    delete: (id) => floodWarningRepo.delete(id)
};
