import { waterLevelService } from "../../services/waterLevel.service.js";

export const getAllWaterLevels = async (req, res) => {
    res.json(await waterLevelService.getAll());
};

export const getWaterLevelById = async (req, res) => {
    res.json(await waterLevelService.getById(req.params.id));
};

export const createWaterLevel = async (req, res) => {
    res.json(await waterLevelService.create(req.body));
};

export const updateWaterLevel = async (req, res) => {
    res.json(await waterLevelService.update(req.params.id, req.body));
};

export const deleteWaterLevel = async (req, res) => {
    res.json(await waterLevelService.delete(req.params.id));
};
