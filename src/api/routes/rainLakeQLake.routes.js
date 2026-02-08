import express from "express";
import controller from "../controller/rainLakeQLake.controller.js";

const router = express.Router();

router.post("/rain-lake-q/sync/:lakeId", controller.sync);
router.get("/rain-lake-q/dataset/:lakeId", controller.dataset);

export default router;
