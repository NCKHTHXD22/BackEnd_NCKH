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

// ⚡ Endpoint tạm: Backfill RainHistory + RainLakeHistory từ API private (dữ liệu thực)
import axios from 'axios';
import RainHistory from './core/entities/RainHistory.js';
import RainStation from './core/entities/RainStation.js';
import rainLakeHistoryService from './services/rainLakeHistory.service.js';
import { getRainDetailByDay } from './services/external/vrain.service.js';

const HOUR_REGEX = /^([01]\d|2[0-3]):00$/;

function normalizeIntervals(intervals) {
    const result = {};
    for (let h = 0; h < 24; h++) {
        result[`${String(h).padStart(2, '0')}:00`] = 0;
    }
    if (intervals && typeof intervals === 'object') {
        for (const [h, v] of Object.entries(intervals)) {
            if (HOUR_REGEX.test(h)) result[h] = Number(v) || 0;
        }
    }
    return result;
}

app.get("/api/backfill-rain", async (req, res) => {
    try {
        const days = Number(req.query.days) || 7;
        console.log(`🔄 [BACKFILL-PRIVATE] Bắt đầu backfill ${days} ngày...`);

        const now = new Date();
        let totalInserted = 0;
        let totalDays = 0;

        for (let d = 0; d < days; d++) {
            const date = new Date(now);
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().slice(0, 10);

            console.log(`📅 [BACKFILL] ${dateStr}...`);

            let stations;
            try {
                stations = await getRainDetailByDay(dateStr);
            } catch (e) {
                console.log(`  ⚠️ Không lấy được dữ liệu ngày ${dateStr}: ${e.message}`);
                continue;
            }

            if (!stations?.length) {
                console.log(`  ⚠️ Không có dữ liệu ngày ${dateStr}`);
                continue;
            }

            const isToday = dateStr === now.toISOString().slice(0, 10);
            const currentHour = now.getUTCHours();
            const bulkOps = [];

            for (const st of stations) {
                const intervals = normalizeIntervals(st.intervals);

                for (const [hour, value] of Object.entries(intervals)) {
                    if (!HOUR_REGEX.test(hour)) continue;

                    const h = Number(hour.slice(0, 2));
                    if (isToday && h > currentHour) continue;

                    const ts = new Date(`${dateStr}T${hour}:00.000Z`);
                    if (isNaN(ts.getTime())) continue;

                    bulkOps.push({
                        updateOne: {
                            filter: { uuid: st.sid, timestamp: ts },
                            update: {
                                $set: {
                                    uuid: st.sid,
                                    name: st.name || '',
                                    sumDepth: value,
                                    level: value > 0 ? 'RAIN' : 'Không mưa',
                                    color: value > 0 ? '#4FC3F7' : '#535353',
                                    timestamp: ts
                                }
                            },
                            upsert: true
                        }
                    });
                }
            }

            if (bulkOps.length) {
                const result = await RainHistory.bulkWrite(bulkOps, { ordered: false });
                totalInserted += result.upsertedCount + result.modifiedCount;
                console.log(`  ✅ ${dateStr}: ${result.upsertedCount} inserted, ${result.modifiedCount} modified`);
            }
            totalDays++;
        }

        // Backfill RainLakeHistory (IDW) cho các ngày đã xử lý
        console.log('🔄 [BACKFILL] Tính IDW cho RainLakeHistory...');
        let lakeCount = 0;
        for (let d = days - 1; d >= 0; d--) {
            for (let h = 0; h < 24; h++) {
                const ts = new Date(now);
                ts.setDate(ts.getDate() - d);
                ts.setHours(h, 0, 0, 0);
                if (ts > now) continue;
                await rainLakeHistoryService.generateAt(ts);
                lakeCount++;
            }
        }

        console.log(`✅ [BACKFILL-PRIVATE] Done: ${totalDays} days, ${totalInserted} rain records, ${lakeCount} lake records`);
        res.json({ success: true, daysProcessed: totalDays, rainHistoryRecords: totalInserted, rainLakeHistoryGenerated: lakeCount });
    } catch (err) {
        console.error('❌ [BACKFILL-PRIVATE] ERROR:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Start Server
const PORT = ENV.PORT || 5001;

app.listen(PORT, () => {
    console.log(` Server is running on port: ${PORT}`);
});
