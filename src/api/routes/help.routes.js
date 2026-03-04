import express from "express";
import {
    createHelpRequest,
    getAllHelpRequests,
    getUserHelpRequests,
} from "../controller/help.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import upload from "../middlewares/upload.middleware.js";

const router = express.Router();

router.post("/", authMiddleware, upload.array("images", 5), createHelpRequest);
router.get("/", getAllHelpRequests);
router.get("/me", authMiddleware, getUserHelpRequests);

export default router;
