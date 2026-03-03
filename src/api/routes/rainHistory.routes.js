import express from "express";
import {
  getHistoryByUUID,
  getHistory24h,
  getHistoryByRange,
  deleteHistoryByDate
} from "../controller/rainHistory.controller.js";

const router = express.Router();

router.get("/:uuid", getHistoryByUUID);
router.get("/:uuid/24h", getHistory24h);
router.get("/:uuid/range", getHistoryByRange);
router.delete("/delete-by-date", deleteHistoryByDate);

export default router;
