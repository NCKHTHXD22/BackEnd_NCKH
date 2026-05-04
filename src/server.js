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
import inflowlakeRoutes from "./api/routes/inflowLake.routes.js";
import inflowLakeHistoryRoutes from "./api/routes/inflowLakeHistory.routes.js";
import rainlakeHistory from "./api/routes/rainLakeHistories.routes.js";
import rainLake_QLake from "./api/routes/rainLakeQLake.routes.js";
import forecastLstmRoutes from "./api/routes/forecastLstm.routes.js";

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
import { logger } from "./api/middlewares/logger.js";

// ⭐ CRON JOB — BẮT BUỘC PHẢI IMPORT
import "./jobs/fetchRainData.job.js";
import "./jobs/inflowLake.job.js";
import "./jobs/rainLakeHistory.job.js";
import "./jobs/lstmForecast.job.js";
import "./jobs/inflowLakeHistory.job.js";
import "./jobs/floodAlert.job.js";
import "./jobs/keepAlive.job.js"; // Giữ server luôn thức

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 10MB cho batch upload forecast
// Clerk middleware: Bắt buộc cấu hình fallback key nếu Render chưa set Environment Variable
const { clerkMiddleware } = await import('@clerk/express');
app.use(clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || 'pk_test_YmFsYW5jZWQtY2hpY2tlbi0zLmNsZXJrLmFjY291bnRzLmRldiQ',
    secretKey: process.env.CLERK_SECRET_KEY || 'sk_test_5Hjv2P8a90Wv9HQjsAt85MWIEcrpszKWrJzX44xV2z'
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

// ID khớp với InflowLake.Id_Lake — 1=A Vương, 2=Đắk Mi 4, 3=Sông Bung 4, 4=Sông Tranh 2
const LAKE_SPECS_SEED = [
    { lake_id:1,  name:'A Vương',      river:'Sông A Vương',         province:'Quảng Nam', address:'Xã A Rooi, Đông Giang, Quảng Nam',       regulation_doc:'QĐ 1865/QĐ-TTg (2021) — Liên hồ Vu Gia - Thu Bồn', MNC:340.0, MNDBT:380.0, MNGC:381.0, crest:382.0, total_volume:343.5, dead_volume: 77.5, flood_volume: 80, turbines:2, capacity_mw:210, turbine_efficiency:0.88, tailwater_elev:100.0, design_head:280.0, max_turbine_flow:320, spillway_crest_elev:375.0, spillway_width:26, spillway_coef:0.42, min_env_flow:3.0 },
    { lake_id:2,  name:'Đắk Mi 4',     river:'Sông Đắk Mi',          province:'Quảng Nam', address:'Xã Phước Hòa, Phước Sơn, Quảng Nam',    regulation_doc:'QĐ 1865/QĐ-TTg (2021) — Liên hồ Vu Gia - Thu Bồn', MNC:225.0, MNDBT:258.0, MNGC:260.5, crest:261.5, total_volume:312.3, dead_volume: 97, flood_volume: 80, turbines:3, capacity_mw:208, turbine_efficiency:0.88, tailwater_elev:165.0, design_head:87.0, max_turbine_flow:280, spillway_crest_elev:252.0, spillway_width:36, spillway_coef:0.42, min_env_flow:3.5 },
    { lake_id:3,  name:'Sông Bung 4',  river:'Sông Bung',            province:'Quảng Nam', address:'Xã Tà Pơơ, Nam Giang, Quảng Nam',        regulation_doc:'QĐ 1865/QĐ-TTg (2021) — Liên hồ Vu Gia - Thu Bồn', MNC:205.0, MNDBT:222.5, MNGC:224.0, crest:225.0, total_volume:510.8, dead_volume:276.8, flood_volume: 70, turbines:2, capacity_mw:156, turbine_efficiency:0.88, tailwater_elev:105.0, design_head:110.0, max_turbine_flow:330, spillway_crest_elev:217.0, spillway_width:24, spillway_coef:0.42, min_env_flow:3.0 },
    { lake_id:4,  name:'Sông Tranh 2', river:'Sông Tranh (Thu Bồn)', province:'Quảng Nam', address:'Xã Trà Đốc, Bắc Trà My, Quảng Nam',     regulation_doc:'QĐ 1865/QĐ-TTg (2021) — Liên hồ Vu Gia - Thu Bồn', MNC:158.0, MNDBT:175.0, MNGC:176.5, crest:177.0, total_volume:730, dead_volume:215, flood_volume:190, turbines:2, capacity_mw:190, turbine_efficiency:0.88, tailwater_elev:106.0, design_head:63.0, max_turbine_flow:380, spillway_crest_elev:168.0, spillway_width:22, spillway_coef:0.42, min_env_flow:4.0 },
    { lake_id:7,  name:'Sông Bung 4A', river:'Sông Bung',            province:'Quảng Nam', address:'Nam Giang, Quảng Nam',                    regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (bậc thang Sông Bung)', MNC:130.0, MNDBT:138.0, MNGC:139.0, crest:140.0, total_volume: 20, dead_volume:  5, flood_volume:  8, turbines:1, capacity_mw: 16, turbine_efficiency:0.88, tailwater_elev: 80.0, design_head:52.0, max_turbine_flow: 40, spillway_crest_elev:134.0, spillway_width:12, spillway_coef:0.42, min_env_flow:1.0 },
    { lake_id:8,  name:'Sông Bung 5',  river:'Sông Bung',            province:'Quảng Nam', address:'Đông Giang, Quảng Nam',                   regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (bậc thang Sông Bung)', MNC:175.0, MNDBT:185.0, MNGC:186.5, crest:187.5, total_volume:100, dead_volume: 28, flood_volume: 30, turbines:2, capacity_mw: 50, turbine_efficiency:0.88, tailwater_elev:130.0, design_head:49.0, max_turbine_flow:130, spillway_crest_elev:180.0, spillway_width:20, spillway_coef:0.42, min_env_flow:2.0 },
    { lake_id:9,  name:'Sông Bung 2',  river:'Sông Bung',            province:'Quảng Nam', address:'Nam Giang, Quảng Nam',                    regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (bậc thang Sông Bung)', MNC:330.0, MNDBT:340.0, MNGC:342.0, crest:343.0, total_volume:250, dead_volume: 70, flood_volume: 60, turbines:2, capacity_mw:100, turbine_efficiency:0.88, tailwater_elev:265.0, design_head:69.0, max_turbine_flow:185, spillway_crest_elev:336.0, spillway_width:24, spillway_coef:0.42, min_env_flow:2.5 },
    { lake_id:11, name:'Sông Bung 6',  river:'Sông Bung',            province:'Quảng Nam', address:'Nam Giang, Quảng Nam',                    regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (bậc thang Sông Bung)', MNC: 93.0, MNDBT:100.0, MNGC:101.0, crest:102.0, total_volume: 50, dead_volume: 12, flood_volume: 15, turbines:1, capacity_mw: 30, turbine_efficiency:0.88, tailwater_elev: 55.0, design_head:40.0, max_turbine_flow: 95, spillway_crest_elev: 96.0, spillway_width:12, spillway_coef:0.42, min_env_flow:1.5 },
    { lake_id:12, name:'Sông Tranh 3', river:'Sông Tranh (Thu Bồn)', province:'Quảng Nam', address:'Tiên Phước, Quảng Nam',                   regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (bậc thang Sông Tranh)', MNC: 60.0, MNDBT: 65.0, MNGC: 66.0, crest: 67.0, total_volume: 60, dead_volume: 15, flood_volume: 18, turbines:2, capacity_mw: 60, turbine_efficiency:0.88, tailwater_elev: 25.0, design_head:35.0, max_turbine_flow:215, spillway_crest_elev: 61.0, spillway_width:20, spillway_coef:0.42, min_env_flow:2.0 },
    { lake_id:13, name:'Za Hung',      river:'Sông Za Hung',         province:'Quảng Nam', address:'Tây Giang, Quảng Nam',                    regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (thượng nguồn A Vương)', MNC:150.0, MNDBT:160.0, MNGC:161.5, crest:162.5, total_volume:130, dead_volume: 35, flood_volume: 40, turbines:2, capacity_mw: 90, turbine_efficiency:0.88, tailwater_elev: 90.0, design_head:64.0, max_turbine_flow:175, spillway_crest_elev:155.0, spillway_width:22, spillway_coef:0.42, min_env_flow:2.0 },
    { lake_id:14, name:'Đắk Mi 3',     river:'Sông Đắk Mi',          province:'Quảng Nam', address:'Phước Sơn, Quảng Nam',                    regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (bậc thang Đắk Mi)', MNC:340.0, MNDBT:352.0, MNGC:353.5, crest:354.5, total_volume: 70, dead_volume: 18, flood_volume: 20, turbines:1, capacity_mw: 30, turbine_efficiency:0.88, tailwater_elev:270.0, design_head:76.0, max_turbine_flow: 50, spillway_crest_elev:348.0, spillway_width:12, spillway_coef:0.42, min_env_flow:1.5 },
    { lake_id:15, name:'Khe Diên',     river:'Sông Vu Gia',          province:'Quảng Nam', address:'Nông Sơn, Quảng Nam',                     regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (hạ lưu Vu Gia)', MNC: 18.0, MNDBT: 24.0, MNGC: 25.0, crest: 26.0, total_volume: 35, dead_volume:  8, flood_volume: 10, turbines:1, capacity_mw: 30, turbine_efficiency:0.88, tailwater_elev:  5.0, design_head:17.0, max_turbine_flow:225, spillway_crest_elev: 21.0, spillway_width:30, spillway_coef:0.42, min_env_flow:2.0 },
    { lake_id:16, name:'Sông Côn 2',   river:'Sông Côn',             province:'Quảng Nam', address:'Đông Giang, Quảng Nam',                   regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương', MNC:320.0, MNDBT:334.0, MNGC:335.5, crest:336.5, total_volume: 90, dead_volume: 22, flood_volume: 25, turbines:2, capacity_mw: 60, turbine_efficiency:0.88, tailwater_elev:252.0, design_head:76.0, max_turbine_flow:100, spillway_crest_elev:330.0, spillway_width:20, spillway_coef:0.42, min_env_flow:1.5 },
    { lake_id:17, name:'Sông Tranh 4', river:'Sông Tranh (Thu Bồn)', province:'Quảng Nam', address:'Hiệp Đức, Quảng Nam',                     regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (bậc thang Sông Tranh)', MNC: 53.0, MNDBT: 58.0, MNGC: 59.0, crest: 60.0, total_volume: 40, dead_volume: 10, flood_volume: 12, turbines:1, capacity_mw: 40, turbine_efficiency:0.88, tailwater_elev: 20.0, design_head:34.0, max_turbine_flow:150, spillway_crest_elev: 55.0, spillway_width:20, spillway_coef:0.42, min_env_flow:1.5 },
    { lake_id:19, name:'Đắk Mi 4C',   river:'Sông Đắk Mi',          province:'Quảng Nam', address:'Phước Sơn, Quảng Nam',                    regulation_doc:'Quy trình vận hành đơn hồ — Bộ Công Thương (bậc thang Đắk Mi)', MNC:153.0, MNDBT:162.0, MNGC:163.0, crest:164.0, total_volume: 45, dead_volume: 12, flood_volume: 15, turbines:1, capacity_mw: 35, turbine_efficiency:0.88, tailwater_elev:100.0, design_head:57.0, max_turbine_flow: 75, spillway_crest_elev:158.0, spillway_width:12, spillway_coef:0.42, min_env_flow:1.5 },
];
const ZV_CURVES_SEED = [
    { lake_id:1, name:'A Vương',      points:[{z:330,volume:50,area:2.5},{z:340,volume:77.5,area:3.2},{z:350,volume:140,area:4.5},{z:360,volume:200,area:5.5},{z:370,volume:270,area:6.7},{z:380,volume:343.5,area:8.8},{z:381,volume:350,area:9.0},{z:382,volume:360,area:9.2}] },
    { lake_id:2, name:'Đắk Mi 4',     points:[{z:222,volume:82,area:4},{z:225,volume:97,area:4.8},{z:230,volume:120,area:5.8},{z:235,volume:148,area:6.9},{z:240,volume:180,area:8.1},{z:245,volume:215,area:9.4},{z:250,volume:255,area:10.8},{z:252,volume:270,area:11.3},{z:255,volume:300,area:12.4},{z:258,volume:343,area:13.8},{z:260,volume:370,area:14.7},{z:260.5,volume:380,area:15},{z:261.5,volume:400,area:15.5}] },
    { lake_id:3, name:'Sông Bung 4',  points:[{z:200,volume:220,area:3.5},{z:205,volume:276.8,area:4.1},{z:210,volume:340,area:4.9},{z:215,volume:400,area:5.8},{z:220,volume:460,area:6.8},{z:222.5,volume:510.8,area:8.0},{z:224,volume:530,area:8.8},{z:225,volume:540,area:9.8}] },
    { lake_id:4, name:'Sông Tranh 2', points:[{z:155,volume:195,area:7.5},{z:158,volume:215,area:8.2},{z:160,volume:228,area:9.1},{z:163,volume:250,area:10.5},{z:165,volume:270,area:11.5},{z:167,volume:295,area:12.8},{z:168,volume:310,area:13.5},{z:170,volume:340,area:14.8},{z:172,volume:375,area:16.2},{z:173,volume:395,area:17},{z:174,volume:420,area:17.9},{z:175,volume:470,area:19.2},{z:176,volume:510,area:20.1},{z:176.5,volume:540,area:21},{z:177,volume:685,area:22.5}] },
];

// Import thêm để clean data cũ sai
import ReservoirAlert from './core/entities/ReservoirAlert.js';
import OperationLog from './core/entities/OperationLog.js';

// ?clean=1 để xóa log/alert cũ sai trước khi seed
app.get('/api/seed-lake-specs', async (req, res) => {
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
