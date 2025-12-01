import express from "express";
import {
    getHistoryByUUID,
    getHistory24h,
    getHistoryByRange
} from "../controller/rainHistory.controller.js";

const router = express.Router();

router.get("/:uuid", getHistoryByUUID);
router.get("/:uuid/24h", getHistory24h);
router.get("/:uuid/range", getHistoryByRange);

export default router;
