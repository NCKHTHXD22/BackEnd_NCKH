import express from "express";
import {
    getMyNotifications,
    markAsRead,
    getPublicAlerts,
    createSystemNotification,
} from "../controller/notification.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminAuth } from "../middlewares/admin.middleware.js";

const router = express.Router();

// ── Public (no auth) ──
// GET /api/notifications/public — mobile dùng để lấy tất cả cảnh báo hệ thống
router.get("/public", getPublicAlerts);

// ── Cá nhân (cần đăng nhập) ──
router.get("/me",        authMiddleware, getMyNotifications);
router.patch("/:id/read", authMiddleware, markAsRead);

// ── Admin ──
// POST /api/notifications/system — tạo thông báo hệ thống thủ công
router.post("/system", authMiddleware, adminAuth, createSystemNotification);

export default router;
