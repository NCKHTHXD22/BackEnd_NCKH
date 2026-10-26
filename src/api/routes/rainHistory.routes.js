import express from "express";
import {
  getHistoryByUUID,
  getHistory24h,
  getHistoryByRange,
  deleteHistoryByDate
} from "../controller/rainHistory.controller.js";
import { adminAuth } from "../middlewares/admin.middleware.js";

const router = express.Router();

router.get("/:uuid", getHistoryByUUID);
router.get("/:uuid/24h", getHistory24h);
router.get("/:uuid/range", getHistoryByRange);
router.delete("/delete-by-date", adminAuth, deleteHistoryByDate);   // xóa cả ngày – chỉ quản trị

export default router;
