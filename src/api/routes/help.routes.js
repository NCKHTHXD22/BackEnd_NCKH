import express from "express";
import {
    createHelpRequest,
    getAllHelpRequests,
    getUserHelpRequests,
    getNearbyApprovedHelp,
    approveHelpRequest,
    rejectHelpRequest,
} from "../controller/help.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminAuth }      from "../middlewares/admin.middleware.js";
import upload             from "../middlewares/upload.middleware.js";

const router = express.Router();

// ── Public ──
// GET /api/help/nearby?lat=&lng=&radius=  — mobile dùng cho tab Thông báo
router.get("/nearby", getNearbyApprovedHelp);

// ── User (cần đăng nhập) ──
router.post("/",   authMiddleware, upload.array("images", 5), createHelpRequest);
router.get("/me",  authMiddleware, getUserHelpRequests);

// ── Admin ──
router.get("/",              authMiddleware, adminAuth, getAllHelpRequests);
router.patch("/:id/approve", authMiddleware, adminAuth, approveHelpRequest);
router.patch("/:id/reject",  authMiddleware, adminAuth, rejectHelpRequest);

export default router;
