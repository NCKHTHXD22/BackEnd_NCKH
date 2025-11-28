import express from "express";
import {
    getAllRainStations,
    getRainStationById,
    createRainStation,
    updateRainStation,
    deleteRainStation
} from "../controller/rainStation.controller.js";

const router = express.Router();

router.get("/", getAllRainStations);
router.get("/:id", getRainStationById);
router.post("/", createRainStation);
router.put("/:id", updateRainStation);
router.delete("/:id", deleteRainStation);

export default router;
