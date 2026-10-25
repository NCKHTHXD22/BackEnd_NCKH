/**
 * Nạp mực nước giờ đã chuẩn hóa của trạm KTTV (digital_twin/scripts/17_station_levels.py → station_levels_ok.jsonl.gz)
 * vào collection waterlevelobservations. Chỉ thêm bản ghi chưa có (station_code, t_obs) – không ghi đè số liệu job,
 * và KHÔNG đổi giá trị hiện tại của trạm (WaterLevelStation.level) vì đây là số liệu lịch sử.
 * Chạy:   node src/script/importStationLevels.js 2025-01-01 2025-12-31 [--dry-run]
 * CẢNH BÁO: ghi vào CSDL theo MONGODB_URI trong .env (production).
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import mongoose from 'mongoose';
import { ENV } from '../api/config/env.js';
import WaterLevelObservation from '../core/entities/WaterLevelObservation.js';

const FILE = new URL('../../digital_twin/data/work/station_levels_ok.jsonl.gz', import.meta.url);
const args = process.argv.slice(2);
const [a, b] = args.filter(x => !x.startsWith('--'));
if (!a) { console.error('Cần khoảng ngày: node src/script/importStationLevels.js <từ YYYY-MM-DD> [đến YYYY-MM-DD]'); process.exit(1); }
const from = new Date(`${a}T00:00:00+07:00`), to = new Date(`${b ?? a}T23:59:59+07:00`);
const SOURCE = { VNDMS_2025: 'VNDMS (Documents/Data_MucNuoc)', 'PCTT_0.2_2003_2019': 'PCTT Quảng Nam 2003–2019 (Documents/Data_MucNuoc)',
                 MIKE_lu_2002_2011: 'chuỗi MIKE 2002–2011 (Documents/Data_MucNuoc)', gio_lien_tuc: 'chuỗi giờ liên tục (Documents/Data_MucNuoc)' };

const rows = [];
const rl = readline.createInterface({ input: fs.createReadStream(FILE).pipe(zlib.createGunzip()) });
for await (const line of rl) {
    const r = JSON.parse(line);
    const t = new Date(r.t_obs);
    if (t < from || t > to) continue;
    rows.push({ station_code: r.station_code, t_obs: t, level: r.level, quantity: 'level', unit: 'm',
                datum: 'cao độ trạm KTTV', source: SOURCE[r.source] ?? r.source, qc_flag: 'ok' });
}
const per = rows.reduce((m, r) => ({ ...m, [r.station_code]: (m[r.station_code] ?? 0) + 1 }), {});
console.log(`${rows.length} giá trị ${a} → ${b ?? a}:`, per);
if (args.includes('--dry-run')) process.exit(0);

await mongoose.connect(ENV.MONGODB_URI);
try {
    await WaterLevelObservation.init();
    let upserted = 0;
    for (let i = 0; i < rows.length; i += 2000) {
        const ops = rows.slice(i, i + 2000).map(o => ({
            updateOne: { filter: { station_code: o.station_code, t_obs: o.t_obs }, update: { $setOnInsert: { ...o, t_recv: new Date() } }, upsert: true },
        }));
        upserted += (await WaterLevelObservation.bulkWrite(ops, { ordered: false })).upsertedCount;
    }
    console.log(`Đã thêm ${upserted} bản ghi mới (bỏ qua ${rows.length - upserted} đã có)`);
} finally {
    await mongoose.disconnect();
}
