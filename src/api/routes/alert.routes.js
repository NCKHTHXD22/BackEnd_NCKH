import express from "express";
import { getAllAlerts } from "../controller/alert.controller.js";

const router = express.Router();

router.get("/", getAllAlerts);

export default router;
