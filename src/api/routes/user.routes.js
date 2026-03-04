import express from "express";
import {
    getUserProfile,
    createOrUpdateUser,
    updateUserInfo,
    deleteUser,
    getAllUsers,
} from "../controller/user.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { strictLimit } from "../middlewares/rateLimit.middleware.js";

const router = express.Router();

router.get("/", authMiddleware, getAllUsers);
router.get("/me", authMiddleware, getUserProfile);
router.post("/", authMiddleware, strictLimit, createOrUpdateUser);
router.put("/", authMiddleware, updateUserInfo);
router.delete("/", authMiddleware, strictLimit, deleteUser);

export default router;
