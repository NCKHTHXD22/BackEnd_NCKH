import express from "express";
import {
    getAllRainStations,
    getRainStationByUUID
} from "../controller/rainStation.controller.js";

const router = express.Router();

router.get("/", getAllRainStations);
router.get("/:uuid", getRainStationByUUID);

export default router;
