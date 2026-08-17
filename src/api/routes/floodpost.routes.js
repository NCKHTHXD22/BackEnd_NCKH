import express from "express";
import {
    getAllFloodPosts,
    getFloodPostById,
    createFloodPost,
    updateFloodPost,
    deleteFloodPost,
} from "../controller/floodpost.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware.js";
import { strictLimit } from "../middlewares/rateLimit.middleware.js";
import upload from "../middlewares/upload.middleware.js";

const router = express.Router();

router.get("/", getAllFloodPosts);
// optionalAuthMiddleware: cho phép chủ bài xem bài pending/rejected của chính mình (nếu có đăng nhập)
router.get("/:id", optionalAuthMiddleware, getFloodPostById);
// optionalAuthMiddleware: web gửi ẩn danh (không token), mobile vẫn gửi kèm token Clerk như cũ.
// strictLimit: chặn spam vì route giờ nhận cả request không đăng nhập.
router.post("/", optionalAuthMiddleware, strictLimit, upload.array("images", 5), createFloodPost);
router.put("/:id", authMiddleware, updateFloodPost);
router.delete("/:id", authMiddleware, deleteFloodPost);

export default router;
