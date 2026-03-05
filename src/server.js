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

// Backend Integration Routes
import userRoutes from "./api/routes/user.routes.js";
import adminRoutes from "./api/routes/admin.routes.js";
import adminAuthRoutes from "./api/routes/adminAuth.routes.js";
import floodPostRoutes from "./api/routes/floodpost.routes.js";
import alertRoutes from "./api/routes/alert.routes.js";
import helpRoutes from "./api/routes/help.routes.js";
import notificationRoutes from "./api/routes/notification.routes.js";
import forecastHistoryRoutes from "./api/routes/forecastHistory.routes.js";
import { logger } from "./api/middlewares/logger.js";

// ⭐ CRON JOB — BẮT BUỘC PHẢI IMPORT
import "./jobs/fetchRainData.job.js";
import "./jobs/rainLake.job.js";
import "./jobs/rainLakeHistory.job.js";
import "./jobs/lstmForecast.job.js";
const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 10MB cho batch upload forecast
// Clerk middleware: chỉ bật khi có key (tránh crash trên Render nếu chưa cấu hình)
if (process.env.CLERK_PUBLISHABLE_KEY) {
    const { clerkMiddleware } = await import('@clerk/express');
    app.use(clerkMiddleware());
    console.log('✅ Clerk middleware enabled');
}
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
app.use("/api/forecast-history", forecastHistoryRoutes);

// Backend Integration Endpoints
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/posts", floodPostRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/notifications", notificationRoutes);

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

// ⚡ Endpoint: Backfill lịch sử mưa từ Vrain Private API
import { getRainDetailByDay } from './services/external/vrain.service.js';

app.get("/api/backfill-rain", async (req, res) => {
    try {
        const days = Math.min(Number(req.query.days) || 7, 30);
        console.log(`🔄 [BACKFILL] Lấy lịch sử ${days} ngày từ Vrain Private API...`);

        const now = new Date();
        let totalInserted = 0;
        let totalDays = 0;
        const errors = [];

        for (let d = 0; d < days; d++) {
            const date = new Date(now);
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().slice(0, 10);

            try {
                const stations = await getRainDetailByDay(dateStr);
                if (!stations?.length) { errors.push(`${dateStr}: empty`); continue; }

                console.log(`📅 ${dateStr}: ${stations.length} trạm, sample intervals: ${JSON.stringify(stations[0]?.intervals || {}).slice(0, 200)}`);

                const bulkOps = [];
                for (const st of stations) {
                    if (!st.intervals || typeof st.intervals !== 'object') continue;
                    for (const [hour, value] of Object.entries(st.intervals)) {
                        if (!/^([01]\d|2[0-3]):00$/.test(hour)) continue;
                        if (d === 0 && Number(hour.slice(0, 2)) > now.getUTCHours()) continue;
                        const ts = new Date(`${dateStr}T${hour}:00.000Z`);
                        if (isNaN(ts.getTime())) continue;
                        bulkOps.push({
                            updateOne: {
                                filter: { uuid: st.sid, timestamp: ts },
                                update: { $set: { uuid: st.sid, name: st.name || '', sumDepth: Number(value) || 0, level: value > 0 ? 'RAIN' : 'Không mưa', color: value > 0 ? '#4FC3F7' : '#535353', timestamp: ts } },
                                upsert: true
                            }
                        });
                    }
                }
                if (bulkOps.length) {
                    const result = await RainHistory.bulkWrite(bulkOps, { ordered: false });
                    totalInserted += (result.upsertedCount || 0) + (result.modifiedCount || 0);
                    console.log(`  ✅ ${dateStr}: ${result.upsertedCount} new, ${result.modifiedCount} updated`);
                }
                totalDays++;
            } catch (e) { errors.push(`${dateStr}: ${e.message}`); console.log(`  ⚠️ ${dateStr}: ${e.message}`); }
        }

        // IDW
        let lakeCount = 0;
        if (totalInserted > 0) {
            console.log('🔄 Tính IDW cho RainLakeHistory...');
            for (let d = days - 1; d >= 0; d--) {
                for (let h = 0; h < 24; h++) {
                    const ts = new Date(now); ts.setDate(ts.getDate() - d); ts.setHours(h, 0, 0, 0);
                    if (ts > now) continue;
                    await rainLakeHistoryService.generateAt(ts);
                    lakeCount++;
                }
            }
        }

        console.log(`✅ [BACKFILL] Done: ${totalDays}d, ${totalInserted} rain, ${lakeCount} lake`);
        res.json({ success: true, daysProcessed: totalDays, rainRecords: totalInserted, lakeRecords: lakeCount, errors });
    } catch (err) {
        console.error('❌ [BACKFILL] ERROR:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 🔍 Debug + Backfill: Nhận cookie qua query param ?cookie=...
app.get("/api/debug-vrain", async (req, res) => {
    const cookie = req.query.cookie || 'sid=3094d396-3c92-42e7-8954-32ac8675d14a';
    const orgUid = '1f3402a7-8c40-4517-bf5e-be1f77330056';
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    try {
        const r = await axios.get('https://vrain.vn/api/vrain/private/v1/organizations/details', {
            params: { from: date, to: date },
            headers: {
                Cookie: cookie,
                'X-Org-Uid': orgUid,
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 Chrome/120 Safari/537.36',
                Referer: 'https://vrain.vn/home/29/dashboard',
                Origin: 'https://vrain.vn'
            },
            timeout: 30000
        });
        res.json({ success: true, cookieUsed: cookie.slice(0, 30) + '...', dataType: typeof r.data, dataKeys: Object.keys(r.data || {}), sample: JSON.stringify(r.data).slice(0, 1000) });
    } catch (err) {
        res.json({ success: false, status: err.response?.status, error: err.message, cookieUsed: cookie.slice(0, 30) + '...', responseData: err.response?.data });
    }
});

// Start Server
const PORT = ENV.PORT || 5001;

app.listen(PORT, () => {
    console.log(` Server is running on port: ${PORT}`);

    // 🔄 Keep-alive: Tự ping mỗi 14 phút để Render free tier không spin down
    const SELF_URL = 'https://backend-nckh-lm57.onrender.com';
    setInterval(async () => {
        try {
            const res = await fetch(`${SELF_URL}/api/flood-tower`);
            console.log(`🏓 [KEEP-ALIVE] Ping OK (${res.status})`);
        } catch (e) {
            console.log(`🏓 [KEEP-ALIVE] Ping failed: ${e.message}`);
        }
    }, 14 * 60 * 1000); // 14 phút
});
