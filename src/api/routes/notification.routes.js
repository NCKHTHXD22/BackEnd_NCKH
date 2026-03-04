import express from "express";
import { getMyNotifications, markAsRead } from "../controller/notification.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/me", authMiddleware, getMyNotifications);
router.patch("/:id/read", authMiddleware, markAsRead);

export default router;
