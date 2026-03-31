import express from "express";
import controller from "../controller/inflowLakeHistory.controller.js";

const router = express.Router();

router.get("/inflowlake-history/:lakeId", controller.getDataset);
router.post("/backfill-inflowlake-history", controller.backfill);
router.post("/clean-backfill-inflowlake-history", controller.cleanAndBackfill);

export default router;
