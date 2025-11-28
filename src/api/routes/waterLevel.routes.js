import express from "express";
import {
    getAllWaterLevels,
    getWaterLevelById,
    createWaterLevel,
    updateWaterLevel,
    deleteWaterLevel
} from "../controller/waterLevel.controller.js";

const router = express.Router();

router.get("/", getAllWaterLevels);
router.get("/:id", getWaterLevelById);
router.post("/", createWaterLevel);
router.put("/:id", updateWaterLevel);
router.delete("/:id", deleteWaterLevel);

export default router;
