import express from 'express';
import cors from "cors";
import multer from "multer";


import { ENV } from './api/config/env.js';
import { connectDB } from './api/config/database.js';

import floodTowerRoutes from "./api/routes/floodtower.routes.js";
import floodWarningRoutes from "./api/routes/floodWarning.routes.js";
import rainStationRoutes from "./api/routes/rainStation.routes.js";
import rainHistoryRoutes from "./api/routes/rainHistory.routes.js";
import waterLevelRoutes from "./api/routes/waterLevel.routes.js";
import forecastRoutes from "./api/routes/forecast.routes.js";
import inflowlakeRoutes from "./api/routes/inflowLake.routes.js";
import inflowLakeHistoryRoutes from "./api/routes/inflowLakeHistory.routes.js";
import rainlakeHistory from "./api/routes/rainLakeHistories.routes.js";
import rainLake_QLake from "./api/routes/rainLakeQLake.routes.js";
import forecastLstmRoutes from "./api/routes/forecastLstm.routes.js";
import forecastRfRoutes from "../ForecastRF/forecastRf.routes.js";
import forecastXgbRoutes from "../XGBoots/forecastXgb.routes.js";

// Backend Integration Routes
import userRoutes from "./api/routes/user.routes.js";
import adminRoutes from "./api/routes/admin.routes.js";
import adminAuthRoutes from "./api/routes/adminAuth.routes.js";
import floodPostRoutes from "./api/routes/floodpost.routes.js";
import alertRoutes from "./api/routes/alert.routes.js";
import helpRoutes from "./api/routes/help.routes.js";
import notificationRoutes from "./api/routes/notification.routes.js";
import forecastHistoryRoutes from "./api/routes/forecastHistory.routes.js";
import lakeSpecRoutes from "./api/routes/lakeSpec.routes.js";
import reservoirAlertRoutes from "./api/routes/reservoirAlert.routes.js";
import weatherProxyRoutes from "./api/routes/weatherProxy.routes.js";
import chatbotRoutes from "./api/routes/chatbot.routes.js";
import { logger } from "./api/middlewares/logger.js";

// ⭐ CRON JOB — mặc định LUÔN chạy (máy chủ thật không cần cấu hình gì thêm).
// Chạy backend trên máy phát triển mà .env trỏ vào CSDL thật: đặt DISABLE_JOBS=1 để các job không
// ghi dữ liệu vào CSDL thật và không gửi cảnh báo/thông báo đẩy tới người dùng.
const CRON_JOBS = [
    "./jobs/fetchRainData.job.js",
    "./jobs/inflowLake.job.js",
    "./jobs/rainLakeHistory.job.js",
    "./jobs/lstmForecast.job.js",
    "./jobs/xgbForecast.job.js",
    "./jobs/rfForecast.job.js",
    "./jobs/inflowLakeHistory.job.js",
    "./jobs/floodAlert.job.js",
    "./jobs/proximityAlert.job.js",
    "./jobs/pcttHydro.job.js",
    "./jobs/autoStations.job.js",
];
if (process.env.DISABLE_JOBS === "1") {
    console.log("⏸️  DISABLE_JOBS=1 — không khởi động cron job");
} else {
    for (const job of CRON_JOBS) await import(job);   // tuần tự, đúng thứ tự như import tĩnh trước đây
}

const app = express();
// Sau reverse proxy (nginx), nếu không set thì mọi người dùng chung 1 IP → rate limit
// (5 báo cáo/phút) chặn oan cả hệ thống lúc đông người báo ngập.
app.set("trust proxy", 1);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 10MB cho batch upload forecast
// Clerk middleware — secret key BẮT BUỘC lấy từ .env (trước đây có giá trị dự
// phòng ghi cứng trong code → lộ trong git). Thiếu thì dừng ngay để không chạy
// với xác thực hỏng âm thầm.
if (!process.env.CLERK_SECRET_KEY) {
    throw new Error('Thiếu CLERK_SECRET_KEY trong .env — không thể khởi động xác thực Clerk.');
}
const { clerkMiddleware } = await import('@clerk/express');
app.use(clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
}));
console.log('✅ Clerk middleware enabled');
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
app.use("/api/inflowLake", inflowlakeRoutes);
app.use("/api", inflowLakeHistoryRoutes);
app.use("/api/rain-lake-history", rainlakeHistory);
app.use("/api/rain-lake-qlake", rainLake_QLake);
app.use("/api/forecast-history", forecastHistoryRoutes);
app.use("/api/lake-specs", lakeSpecRoutes);
app.use("/api/reservoir-alerts", reservoirAlertRoutes);
app.use("/api/forecast-lstm", forecastLstmRoutes);
app.use("/api/forecast-rf", forecastRfRoutes);
app.use("/api/forecast-xgb", forecastXgbRoutes);
app.use("/api/weather", weatherProxyRoutes);
app.use("/api/chatbot", chatbotRoutes);

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

// ⚡ Endpoint: Re-seed LakeSpec + ZVCurve với ID đúng
import LakeSpec from './core/entities/LakeSpec.js';
import ZVCurve from './core/entities/ZVCurve.js';

// Thông số hồ + bảng Z-V-F: nguồn duy nhất src/script/lakeSpecsData.js (theo QĐ 1865/QĐ-TTg ngày 23/12/2019)
import { LAKE_SPECS as LAKE_SPECS_SEED, ZV_CURVES as ZV_CURVES_SEED } from './script/lakeSpecsData.js';
import { adminAuth } from './api/middlewares/admin.middleware.js';

// Import thêm để clean data cũ sai
import ReservoirAlert from './core/entities/ReservoirAlert.js';
import OperationLog from './core/entities/OperationLog.js';

// ?clean=1 để xóa log/alert cũ sai trước khi seed
// Ghi thông số hồ vào CSDL (và ?clean=1 xóa OperationLog/ReservoirAlert) → chỉ admin
app.get('/api/seed-lake-specs', adminAuth, async (req, res) => {
    try {
        const doClean = req.query.clean === '1';
        const results = [];

        // Bước 1: Xóa dữ liệu cũ sai nếu có ?clean=1
        if (doClean) {
            const delLog   = await OperationLog.deleteMany({});
            const delAlert = await ReservoirAlert.deleteMany({});
            results.push(`🗑️ Xóa ${delLog.deletedCount} OperationLog cũ`);
            results.push(`🗑️ Xóa ${delAlert.deletedCount} ReservoirAlert cũ`);
            console.log('🗑️ [SEED] Cleaned old OperationLog + ReservoirAlert');
        }

        // Bước 2: Upsert LakeSpec
        for (const spec of LAKE_SPECS_SEED) {
            await LakeSpec.findOneAndUpdate({ lake_id: spec.lake_id }, { $set: { ...spec, updated_at: new Date() } }, { upsert: true });
            results.push(`✅ LakeSpec: ${spec.name} (id=${spec.lake_id})`);
        }

        // Bước 3: Upsert ZVCurve
        for (const curve of ZV_CURVES_SEED) {
            await ZVCurve.findOneAndUpdate({ lake_id: curve.lake_id }, { $set: { ...curve, updated_at: new Date() } }, { upsert: true });
            results.push(`✅ ZVCurve: ${curve.name} (id=${curve.lake_id})`);
        }

        console.log('✅ [SEED] Done:', results.length, 'items');
        res.json({ success: true, cleaned: doClean, total: results.length, details: results });
    } catch (err) {
        console.error('❌ [SEED]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 🔍 Debug: Test scraper + GOV API
import pcttScraperService from './services/pcttScraper.service.js';
import inflowLakeHistoryService from './services/inflowLakeHistory.service.js';

app.get('/api/test-scraper', async (req, res) => {
    try {
        const data = await pcttScraperService.scrapeAllLakes();
        const summary = {};
        for (const [id, records] of data) {
            summary[id] = { count: records.length, latest: records[0] };
        }
        res.json({ ok: true, lakes: data.size, summary });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/test-govapi', async (req, res) => {
    try {
        const token = await inflowLakeHistoryService.getToken();
        res.json({ ok: true, tokenLength: token?.length, tokenPreview: token?.slice(0, 30) + '...' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 🏢 Proxy: Lấy tòa nhà cao qua Overpass (server-side, không bị rate limit mobile)
// Overpass từ chối (HTTP 406/429) mọi request dùng User-Agent mặc định của axios/okhttp —
// bắt buộc gửi User-Agent định danh (chính sách sử dụng của Overpass), nếu không API luôn
// trả [] vì tất cả mirror thất bại.
const OVERPASS_UA = 'NCKH-FloodWarning/1.0 (Vu Gia - Thu Bon flood warning; contact: annguyen14032004@gmail.com)';
const BUILDINGS_CACHE = new Map(); // key "lat2,lng2,radius" → { at, data }
const BUILDINGS_TTL_MS = 6 * 60 * 60 * 1000; // dữ liệu công trình gần như không đổi

app.get('/api/buildings', async (req, res) => {
    const { lat, lng } = req.query;
    const radius = Math.min(Number(req.query.radius) || 3000, 5000);
    const latN = Number(lat), lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return res.status(400).json({ error: 'Thiếu hoặc sai lat/lng' });

    const cacheKey = `${latN.toFixed(2)},${lngN.toFixed(2)},${radius}`;
    const hit = BUILDINGS_CACHE.get(cacheKey);
    if (hit && Date.now() - hit.at < BUILDINGS_TTL_MS) return res.json(hit.data);

    const query =
        `[out:json][timeout:25];` +
        `(` +
        `way["building"]["building:levels"~"^([5-9]|[1-9][0-9]+)$"](around:${radius},${latN},${lngN});` +
        `way["building"]["height"](around:${radius},${latN},${lngN});` +
        `way["building"]["name"](around:${radius},${latN},${lngN});` +
        `way["tourism"="hotel"](around:${radius},${latN},${lngN});` +
        `relation["building"]["name"](around:${radius},${latN},${lngN});` +
        `);out center tags 300;`;

    const MIRRORS = [
        'https://overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
    ];

    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    let buildings = [];
    let lastError = null;
    let anyMirrorAnswered = false;
    for (const mirror of MIRRORS) {
        try {
            const { data } = await axios.post(
                mirror,
                `data=${encodeURIComponent(query)}`,
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': OVERPASS_UA },
                    timeout: 30000,
                }
            );
            anyMirrorAnswered = true;
            const parsed = (data.elements || [])
                .filter(el => el.center || (el.lat != null && el.lon != null))
                .map(el => ({
                    id:           el.id,
                    lat:          el.center?.lat ?? el.lat,
                    lng:          el.center?.lon ?? el.lon,
                    name:         el.tags?.['name:vi'] || el.tags?.name || 'Tòa nhà cao tầng',
                    levels:       el.tags?.['building:levels'] || null,
                    height:       el.tags?.height || null,
                    buildingType: el.tags?.building || el.tags?.tourism || null,
                }))
                .filter(b => b.lat && b.lng)
                // Ưu tiên nhà cao nhất (số tầng, rồi chiều cao) — app chỉ hiển thị vài chục toà gần nhất
                .sort((a, b) => (num(b.levels) - num(a.levels)) || (num(b.height) - num(a.height)))
                .slice(0, 60);

            console.log(`[Buildings API] ${mirror.split('/')[2]}: ${parsed.length} kết quả`);
            buildings = parsed;
            break; // mirror đã trả lời hợp lệ — kể cả rỗng (khu vực thật sự không có dữ liệu)
        } catch (e) {
            lastError = e;
            console.log(`[Buildings API] ${mirror.split('/')[2]} thất bại: ${e.message}`);
        }
    }

    // Chỉ cache khi có mirror trả lời — không cache kết quả do lỗi mạng/rate-limit
    if (anyMirrorAnswered) BUILDINGS_CACHE.set(cacheKey, { at: Date.now(), data: buildings });
    else console.error(`[Buildings API] tất cả mirror thất bại: ${lastError?.message}`);

    res.json(buildings);
});

// Error-handling middleware (4 tham số, BẮT BUỘC đặt sau tất cả routes) — trả JSON thay vì
// trang HTML mặc định của Express, đặc biệt cho lỗi Multer (sai định dạng ảnh, vượt quá 5 ảnh)
// vốn trước đây phá luồng try/catch JSON-based ở cả web lẫn mobile.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_UNEXPECTED_FILE"
            ? "Chỉ được gửi tối đa 5 ảnh."
            : err.message;
        return res.status(400).json({ error: message });
    }

    console.error("❌ Unhandled error:", err);
    res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// Start Server
const PORT = ENV.PORT || 5001;

app.listen(PORT, () => {
    console.log(` Server is running on port: ${PORT}`);
});
