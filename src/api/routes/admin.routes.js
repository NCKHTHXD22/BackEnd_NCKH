import express from "express";
import { adminAuth } from "../middlewares/admin.middleware.js";
import {
    getPendingPosts,
    approvePost,
    rejectPost,
    updatePostAdmin,
    deletePostAdmin,
    getAllUsersAdmin,
    changeUserRole,
    banUser,
    unbanUser,
    updateUserAdmin,
    deleteUserAdmin,
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
router.put("/posts/:id", adminAuth, updatePostAdmin);
router.delete("/posts/:id", adminAuth, deletePostAdmin);

router.get("/users", adminAuth, getAllUsersAdmin);
router.patch("/users/:id/role", adminAuth, changeUserRole);
router.patch("/users/:id/ban", adminAuth, banUser);
router.patch("/users/:id/unban", adminAuth, unbanUser);
router.put("/users/:id", adminAuth, updateUserAdmin);
router.delete("/users/:id", adminAuth, deleteUserAdmin);

router.post("/admins", adminAuth, createAdmin);
router.get("/admins", adminAuth, listAdmins);
router.delete("/admins/:id", adminAuth, deleteAdmin);
router.get("/users/stats", adminAuth, getUserStats);

export default router;
