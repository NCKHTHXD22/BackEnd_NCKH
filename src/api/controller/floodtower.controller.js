import { floodTowerService } from "../../services/floodTower.service.js";

export const getAllFloodTowers = async (req, res) => {
    res.json(await floodTowerService.getAll());
};

export const getFloodTowerById = async (req, res) => {
    res.json(await floodTowerService.getById(req.params.id));
};

export const createFloodTower = async (req, res) => {
    res.json(await floodTowerService.create(req.body));
};

export const updateFloodTower = async (req, res) => {
    res.json(await floodTowerService.update(req.params.id, req.body));
};

export const deleteFloodTower = async (req, res) => {
    res.json(await floodTowerService.delete(req.params.id));
};
