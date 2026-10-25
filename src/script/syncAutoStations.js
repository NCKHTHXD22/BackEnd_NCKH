/**
 * Đồng bộ trạm mực nước tự động (muangap) và tháp báo ngập/lũ VRain; lấy lại số liệu VRain theo khoảng ngày.
 * Chạy:   node src/script/syncAutoStations.js                       (hiện tại + VRain 2 ngày gần nhất)
 *         node src/script/syncAutoStations.js 2025-10-24 2025-11-02  (lấy lại VRain một trận lũ)
 *         --hide-empty  chưa gắn tọa độ cho trạm muangap chưa có số liệu (web bản cũ hiện "0 m")
 *         --dry-run     chỉ đọc nguồn, không ghi CSDL
 * CẢNH BÁO: ghi vào CSDL theo MONGODB_URI trong .env (production).
 */
import mongoose from 'mongoose';
import { ENV } from '../api/config/env.js';
import { syncMuangap } from '../services/muangapWater.service.js';
import { syncVrain } from '../services/vrainFlood.service.js';

import { fetchMuangapStations } from '../services/muangapWater.service.js';
import { vrainClient } from '../services/vrainFlood.service.js';

const args = process.argv.slice(2);
const [a, b] = args.filter(x => !x.startsWith('--'));
if (args.includes('--dry-run')) {
    const st = await fetchMuangapStations();
    console.table(st.map(s => ({ code: s.code, name: s.name, kind: s.kind, lat: s.lat, lng: s.lng, level: s.level, time: s.level_time?.toISOString() })));
    const { client } = await vrainClient();
    const { data } = await client.get('/private/v1/stats/summary');
    const towers = data.flatMap(g => g.stats ?? []);
    console.log(`VRain: ${towers.length} tháp, ${towers.filter(t => t.currDepth > 0).length} đang ngập`);
    process.exit(0);
}
await mongoose.connect(ENV.MONGODB_URI);
try {
    if (!a) console.log('Muangap:', await syncMuangap({ locateEmpty: !args.includes('--hide-empty') }));
    const range = a ? { from: new Date(`${a}T00:00:00+07:00`), to: new Date(`${b ?? a}T23:59:59+07:00`) } : {};
    console.log('VRain:', await syncVrain(range));
} finally {
    await mongoose.disconnect();
}
