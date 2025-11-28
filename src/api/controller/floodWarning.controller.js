import { floodWarningService } from "../../services/floodWarning.service.js";

export const getAllFloodWarnings = async (req, res) => {
    res.json(await floodWarningService.getAll());
};

export const getFloodWarningById = async (req, res) => {
    res.json(await floodWarningService.getById(req.params.id));
};

export const createFloodWarning = async (req, res) => {
    res.json(await floodWarningService.create(req.body));
};

export const updateFloodWarning = async (req, res) => {
    res.json(await floodWarningService.update(req.params.id, req.body));
};

export const deleteFloodWarning = async (req, res) => {
    res.json(await floodWarningService.delete(req.params.id));
};
