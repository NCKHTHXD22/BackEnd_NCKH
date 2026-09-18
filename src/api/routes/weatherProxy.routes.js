import express from "express";
import { getCurrentWeather, getForecastWeather, getUvIndex } from "../controller/weatherProxy.controller.js";

const router = express.Router();

router.get("/current", getCurrentWeather);
router.get("/forecast", getForecastWeather);
router.get("/uvi", getUvIndex);

export default router;
