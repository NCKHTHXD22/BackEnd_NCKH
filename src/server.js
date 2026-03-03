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

// ⚡ Endpoint: Xóa dữ liệu cũ + seed dữ liệu mới từ API public (chỉ giờ hiện tại)
import axios from 'axios';
import RainHistory from './core/entities/RainHistory.js';
import RainStation from './core/entities/RainStation.js';
import rainLakeHistoryService from './services/rainLakeHistory.service.js';
import RainLakeHistory from './core/entities/RainLakeHistory.js';

function toHourlyBucket(date) {
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d;
}

app.get("/api/reset-rain", async (req, res) => {
    try {
        console.log('🗑️ [RESET] Xóa toàn bộ RainHistory + RainLakeHistory cũ...');

        // 1. Xóa hết dữ liệu cũ (bị sai do backfill)
        const delRH = await RainHistory.deleteMany({});
        const delRLH = await RainLakeHistory.deleteMany({});
        console.log(`  ✅ Đã xóa ${delRH.deletedCount} RainHistory, ${delRLH.deletedCount} RainLakeHistory`);

        // 2. Lấy dữ liệu mưa hiện tại từ API public
        const { data: stations } = await axios.get('https://vrain.vn/data/32.json', {
            headers: {
                'User-Agent': 'Mozilla/5.0 Chrome/121.0.0.0',
                'Accept': 'application/json',
                'Origin': 'https://vrain.vn',
                'Referer': 'https://vrain.vn/'
            },
            timeout: 30000
        });

        if (!Array.isArray(stations)) return res.json({ error: 'Không lấy được dữ liệu trạm' });

        const now = new Date();
        const bucket = toHourlyBucket(now);
        let stationCount = 0;

        // 3. Lưu dữ liệu CHỈ cho giờ hiện tại
        for (const item of stations) {
            const s = item.station;
            const sumDepth = Number(item.sumDepth) || 0;

            // Cập nhật RainStation
            await RainStation.findOneAndUpdate(
                { uuid: s.uuid },
                { $set: { uuid: s.uuid, name: s.name || '', location: { lat: Number(s.lat) || 0, lng: Number(s.lng) || 0 }, sumDepth, level: item.level || '', lastUpdate: now } },
                { upsert: true }
            );

            // Lưu RainHistory CHỈ cho giờ hiện tại
            await RainHistory.updateOne(
                { uuid: s.uuid, timestamp: bucket },
                { $set: { uuid: s.uuid, name: s.name || '', sumDepth, level: item.level || 'Không mưa', color: item.color || '#535353', timestamp: bucket } },
                { upsert: true }
            );
            stationCount++;
        }

        // 4. Tính IDW cho giờ hiện tại
        await rainLakeHistoryService.generateAt(bucket);

        console.log(`✅ [RESET] Done: ${stationCount} stations, 1 hour seeded`);
        res.json({
            success: true,
            deleted: { rainHistory: delRH.deletedCount, rainLakeHistory: delRLH.deletedCount },
            seeded: { stations: stationCount, timestamp: bucket.toISOString() },
            note: 'Dữ liệu sẽ tự động tích lũy mỗi giờ qua cron job'
        });
    } catch (err) {
        console.error('❌ [RESET] ERROR:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Start Server
const PORT = ENV.PORT || 5001;

app.listen(PORT, () => {
    console.log(` Server is running on port: ${PORT}`);
});
