// Bước 16a – Xuất độ sâu ngập đo tại tháp báo ngập/lũ VRain trong cửa sổ các trận lũ thử (lộ trình 6.3).
//
// Nguồn: CSDL hệ thống (floodtowers + waterlevelobservations quantity = flood_depth), do job autoStations /
// src/script/syncAutoStations.js lấy từ mucnuoc.vrain.vn. Trước khi chạy cần lấy lại số liệu trận lũ:
//   node src/script/syncAutoStations.js 2025-10-24 2025-11-02
// Đầu ra: digital_twin/data/compute/flood_towers/<trận>.json (cùng tên với data/compute/routing/<trận>.json)
// Chạy (từ gốc repo, cần MONGODB_URI trong .env – CHỈ ĐỌC): node digital_twin/scripts/16_tower_export.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const { default: mongoose } = await import('mongoose');
const { ENV } = await import(pathToFileURL(path.join(repo, 'src/api/config/env.js')));

const events = JSON.parse(fs.readFileSync(path.join(repo, 'digital_twin/data/compute/events.json'), 'utf8'));
const outDir = path.join(repo, 'digital_twin/data/compute/flood_towers');
fs.mkdirSync(outDir, { recursive: true });
const vn = s => new Date(`${s}+07:00`);                 // events.json ghi giờ Việt Nam, không múi giờ

await mongoose.connect(ENV.MONGODB_URI);
const db = mongoose.connection.db;
try {
  const towers = await db.collection('floodtowers').find({ source: 'mucnuoc.vrain.vn' }).toArray();
  for (const key of ['calibration', 'validation']) {
    const ev = events[key];
    const name = `${key}_${ev.peak_st2.slice(0, 10).replaceAll('-', '')}`;
    const from = vn(ev.window_start), to = vn(ev.window_end);
    const obs = await db.collection('waterlevelobservations')
      .find({ quantity: 'flood_depth', t_obs: { $gte: from, $lte: to }, level: { $gte: 0 } })
      .sort({ t_obs: 1 }).toArray();
    const byCode = {};
    for (const o of obs) (byCode[o.station_code] ??= []).push(o);
    const rows = towers.map(t => {
      const s = byCode[t.code] ?? [];
      const peak = s.reduce((m, o) => (o.level > (m?.level ?? -1) ? o : m), null);
      const distinct = new Set(s.map(o => o.level)).size;
      return {
        code: t.code, name: t.name, type: t.tower_type, area: t.area, lat: t.location?.lat, lng: t.location?.lng,
        n_obs: s.length, max_depth_m: peak?.level ?? null, t_max: peak?.t_obs ?? null,
        // cảm biến đứng yên: cả trận chỉ một giá trị > 0 (vd. 1.0 suốt 72 giờ) – nghi lỗi, không dùng kiểm định
        stuck: s.length >= 24 && distinct === 1 && s[0].level > 0,
      };
    });
    const file = path.join(outDir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify({
      event: name, window: [from, to], source: 'mucnuoc.vrain.vn qua CSDL hệ thống', unit: 'm (độ sâu ngập so với mặt đất tại tháp)',
      towers: rows,
    }, null, 1));
    console.log(`${name}: ${rows.length} tháp, ${rows.filter(r => r.n_obs).length} có số liệu, `
      + `${rows.filter(r => r.max_depth_m > 0.1).length} ngập > 0,1 m, ${rows.filter(r => r.stuck).length} nghi đứng yên → ${path.relative(repo, file)}`);
  }
} finally {
  await mongoose.disconnect();
}
