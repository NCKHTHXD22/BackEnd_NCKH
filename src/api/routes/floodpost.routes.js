import express from "express";
import {
    getAllFloodPosts,
    getFloodPostById,
    createFloodPost,
    updateFloodPost,
    deleteFloodPost,
    moderateFloodPost,
} from "../controller/floodpost.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import upload from "../middlewares/upload.middleware.js";

const router = express.Router();

router.get("/", getAllFloodPosts);
router.get("/:id", getFloodPostById);
router.post("/", authMiddleware, upload.array("images", 5), createFloodPost);
router.put("/:id", authMiddleware, updateFloodPost);
router.delete("/:id", authMiddleware, deleteFloodPost);
router.patch("/:id/moderate", moderateFloodPost);

export default router;
