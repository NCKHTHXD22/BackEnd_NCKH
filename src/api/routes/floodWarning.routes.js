import express from "express";
import {
    getAllFloodWarnings,
    getFloodWarningById,
    createFloodWarning,
    updateFloodWarning,
    deleteFloodWarning
} from "../controller/floodWarning.controller.js";

const router = express.Router();

router.get("/", getAllFloodWarnings);
router.get("/:id", getFloodWarningById);
router.post("/", createFloodWarning);
router.put("/:id", updateFloodWarning);
router.delete("/:id", deleteFloodWarning);

export default router;
