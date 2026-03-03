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

// ⚡ Endpoint tạm: Backfill RainHistory + RainLakeHistory từ API public
import axios from 'axios';
import RainHistory from './core/entities/RainHistory.js';
import RainStation from './core/entities/RainStation.js';
import rainLakeHistoryService from './services/rainLakeHistory.service.js';

app.get("/api/backfill-rain", async (req, res) => {
    try {
        const days = Number(req.query.days) || 7;
        console.log(`🔄 [BACKFILL] Bắt đầu backfill ${days} ngày...`);

        // 1. Lấy dữ liệu realtime từ vrain.vn
        const { data: stations } = await axios.get('https://vrain.vn/data/32.json', {
            headers: {
                'User-Agent': 'Mozilla/5.0 Chrome/121.0.0.0',
                'Accept': 'application/json',
                'Origin': 'https://vrain.vn',
                'Referer': 'https://vrain.vn/'
            },
            timeout: 30000
        });

        if (!Array.isArray(stations)) return res.json({ error: 'Không lấy được dữ liệu' });

        const now = new Date();

        // 2. Cập nhật RainStation + Backfill RainHistory
        let totalOps = 0;
        const bulkOps = [];

        for (const item of stations) {
            const s = item.station;

            // Cập nhật RainStation
            await RainStation.findOneAndUpdate(
                { uuid: s.uuid },
                { $set: { uuid: s.uuid, name: s.name || '', location: { lat: Number(s.lat) || 0, lng: Number(s.lng) || 0 }, sumDepth: Number(item.sumDepth) || 0, level: item.level || '', lastUpdate: new Date() } },
                { upsert: true }
            );

            // Tạo records cho mỗi giờ trong N ngày
            const sumDepth = Number(item.sumDepth) || 0;
            for (let d = 0; d < days; d++) {
                for (let h = 0; h < 24; h++) {
                    const ts = new Date(now);
                    ts.setDate(ts.getDate() - d);
                    ts.setHours(h, 0, 0, 0);
                    if (ts > now) continue;

                    bulkOps.push({
                        updateOne: {
                            filter: { uuid: s.uuid, timestamp: ts },
                            update: { $set: { uuid: s.uuid, name: s.name || '', sumDepth, level: sumDepth > 0 ? item.level : 'Không mưa', color: sumDepth > 0 ? item.color : '#535353', timestamp: ts } },
                            upsert: true
                        }
                    });
                }
            }
        }

        // Bulk write
        for (let i = 0; i < bulkOps.length; i += 5000) {
            const result = await RainHistory.bulkWrite(bulkOps.slice(i, i + 5000), { ordered: false });
            totalOps += result.upsertedCount;
        }

        // 3. Backfill RainLakeHistory (IDW)
        let lakeHistoryCount = 0;
        for (let d = days - 1; d >= 0; d--) {
            for (let h = 0; h < 24; h++) {
                const ts = new Date(now);
                ts.setDate(ts.getDate() - d);
                ts.setHours(h, 0, 0, 0);
                if (ts > now) continue;
                await rainLakeHistoryService.generateAt(ts);
                lakeHistoryCount++;
            }
        }

        console.log(`✅ [BACKFILL] Done: ${totalOps} RainHistory, ${lakeHistoryCount} RainLakeHistory`);
        res.json({ success: true, rainHistoryInserted: totalOps, rainLakeHistoryGenerated: lakeHistoryCount, stations: stations.length });
    } catch (err) {
        console.error('❌ [BACKFILL] ERROR:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Start Server
const PORT = ENV.PORT || 5001;

app.listen(PORT, () => {
    console.log(` Server is running on port: ${PORT}`);
});
