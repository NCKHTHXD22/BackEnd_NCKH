import express from "express";
import {
    getAllFloodTowers,
    getFloodTowerById,
    createFloodTower,
    updateFloodTower,
    deleteFloodTower
} from "../controller/floodtower.controller.js";

const router = express.Router();

router.get("/", getAllFloodTowers);
router.get("/:id", getFloodTowerById);
router.post("/", createFloodTower);
router.put("/:id", updateFloodTower);
router.delete("/:id", deleteFloodTower);

export default router;
