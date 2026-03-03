import { rainHistoryRepo } from "../infrastructure/repositories/rainHistory.repo.js";

export const rainHistoryService = {
  getByUUID: (uuid) => rainHistoryRepo.getByUUID(uuid),

  get24h: (uuid) => {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return rainHistoryRepo.getByRange(uuid, start, end);
  },

  getByRange: (uuid, from, to) =>
    rainHistoryRepo.getByRange(uuid, new Date(from), new Date(to))
};
