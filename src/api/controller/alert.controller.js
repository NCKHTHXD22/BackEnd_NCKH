import { alertRepo } from "../../infrastructure/repositories/alert.repo.js";

export const getAllAlerts = async (req, res) => {
    try {
        const alerts = await alertRepo.findAll();
        res.status(200).json(alerts);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
