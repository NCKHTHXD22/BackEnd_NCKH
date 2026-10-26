import express from "express";
import {
    getAllWaterLevels,
    getWaterLevelById,
    createWaterLevel,
    updateWaterLevel,
    deleteWaterLevel,
    getWaterLevelObservations
} from "../controller/waterLevel.controller.js";
import { adminAuth } from "../middlewares/admin.middleware.js";

const router = express.Router();

router.get("/", getAllWaterLevels);
router.get("/observations/:code", getWaterLevelObservations);   // trước "/:id"
router.get("/:id", getWaterLevelById);
// Sửa danh mục trạm (ngưỡng, tọa độ) – chỉ quản trị; job đồng bộ ghi thẳng vào CSDL, không qua các route này
router.post("/", adminAuth, createWaterLevel);
router.put("/:id", adminAuth, updateWaterLevel);
router.delete("/:id", adminAuth, deleteWaterLevel);

export default router;
