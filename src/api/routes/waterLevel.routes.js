import express from "express";
import {
    getAllWaterLevels,
    getWaterLevelById,
    createWaterLevel,
    updateWaterLevel,
    deleteWaterLevel,
    getWaterLevelObservations
} from "../controller/waterLevel.controller.js";

const router = express.Router();

router.get("/", getAllWaterLevels);
router.get("/observations/:code", getWaterLevelObservations);   // trước "/:id"
router.get("/:id", getWaterLevelById);
router.post("/", createWaterLevel);
router.put("/:id", updateWaterLevel);
router.delete("/:id", deleteWaterLevel);

export default router;
