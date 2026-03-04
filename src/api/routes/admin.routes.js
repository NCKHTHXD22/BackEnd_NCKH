import express from "express";
import { adminAuth } from "../middlewares/admin.middleware.js";
import {
    getPendingPosts,
    approvePost,
    rejectPost,
    getAllUsersAdmin,
    changeUserRole,
    banUser,
    unbanUser,
    createAdmin,
    listAdmins,
    deleteAdmin,
    getApprovedPosts,
    getRejectedPosts,
    getUserStats
} from "../controller/admin.controller.js";

const router = express.Router();

router.get("/posts/pending", adminAuth, getPendingPosts);
router.get("/posts/approved", adminAuth, getApprovedPosts);
router.get("/posts/rejected", adminAuth, getRejectedPosts);

router.patch("/posts/:id/approve", adminAuth, approvePost);
router.patch("/posts/:id/reject", adminAuth, rejectPost);

router.get("/users", adminAuth, getAllUsersAdmin);
router.patch("/users/:id/role", adminAuth, changeUserRole);
router.patch("/users/:id/ban", adminAuth, banUser);
router.patch("/users/:id/unban", adminAuth, unbanUser);

router.post("/admins", adminAuth, createAdmin);
router.get("/admins", adminAuth, listAdmins);
router.delete("/admins/:id", adminAuth, deleteAdmin);
router.get("/users/stats", adminAuth, getUserStats);

export default router;
