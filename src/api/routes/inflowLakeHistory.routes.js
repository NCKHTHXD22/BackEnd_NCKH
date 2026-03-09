import express from "express";
import controller from "../controller/inflowLakeHistory.controller.js";

const router = express.Router();

router.get("/inflowlake-history/:lakeId", controller.getDataset);
router.post("/backfill-inflowlake-history", controller.backfill);

export default router;
