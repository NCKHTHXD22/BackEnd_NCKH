import { rainStationService } from "../../services/rainStation.service.js";

export const getAllRainStations = async (req, res) => {
    res.json(await rainStationService.getAll());
};

export const getRainStationById = async (req, res) => {
    res.json(await rainStationService.getById(req.params.id));
};

export const createRainStation = async (req, res) => {
    res.json(await rainStationService.create(req.body));
};

export const updateRainStation = async (req, res) => {
    res.json(await rainStationService.update(req.params.id, req.body));
};

export const deleteRainStation = async (req, res) => {
    res.json(await rainStationService.delete(req.params.id));
};
