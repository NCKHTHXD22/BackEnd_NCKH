import express from 'express';
import cors from "cors";

import { ENV } from './api/config/env.js';
import { connectDB } from './api/config/database.js'; 

import floodTowerRoutes from "./api/routes/floodtower.routes.js";
import floodWarningRoutes from "./api/routes/floodWarning.routes.js";
import rainStationRoutes from "./api/routes/rainStation.routes.js";
import rainHistoryRoutes from "./api/routes/rainHistory.routes.js";
import waterLevelRoutes from "./api/routes/waterLevel.routes.js";
import forecastRoutes from "./api/routes/forecast.routes.js";
import rainlakeRoutes from "./api/routes/rainLake.routes.js";
import rainlakeHistory from "./api/routes/rainLakeHistories.routes.js";
import rainLake_QLake from "./api/routes/rainLakeQLake.routes.js";
import { logger } from "./api/middlewares/logger.js";

// ⭐ CRON JOB — BẮT BUỘC PHẢI IMPORT
import "./jobs/fetchRainData.job.js";
import "./jobs/rainLake.job.js";
import "./jobs/rainLakeHistory.job.js";
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(logger);

// Database
connectDB();

// Routes
app.use("/api/flood-tower", floodTowerRoutes);
app.use("/api/flood-warning", floodWarningRoutes);
app.use("/api/rain-station", rainStationRoutes);
app.use("/api/rain-history", rainHistoryRoutes);   
app.use("/api/water-level", waterLevelRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/rain-lake", rainlakeRoutes);
app.use("/api/rain-lake-history", rainlakeHistory);
app.use("/api/rain-lake-qlake", rainLake_QLake);
// Start Server
const PORT = ENV.PORT || 5001;

app.listen(PORT, () => {
    console.log(` Server is running on port: ${PORT}`);
});
