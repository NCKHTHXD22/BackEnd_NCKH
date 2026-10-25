/**
 * Lấy ngưỡng báo động + mực nước trạm thủy văn từ pctt.danang.gov.vn và ghi vào CSDL (WaterLevelStation,
 * WaterLevelObservation). Job pcttHydro.job.js chạy hàng giờ; script này để chạy tay / lấy lại một khoảng ngày.
 * Chạy:   node src/script/syncPcttHydro.js [từ YYYY-MM-DD] [đến YYYY-MM-DD]
 *         node src/script/syncPcttHydro.js --dry-run      (chỉ đọc trang, không ghi CSDL)
 * CẢNH BÁO: ghi vào CSDL theo MONGODB_URI trong .env (production).
 */
import mongoose from 'mongoose';
import { ENV } from '../api/config/env.js';
import { fetchHydroHtml, parseHydroTable, syncPcttHydro } from '../services/pcttHydro.service.js';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const [a, b] = args.filter(x => !x.startsWith('--'));
const from = a ? new Date(`${a}T00:00:00+07:00`) : undefined;
const to = b ? new Date(`${b}T23:59:59+07:00`) : (a ? new Date(`${a}T23:59:59+07:00`) : undefined);

if (dry) {
    const p = parseHydroTable(await fetchHydroHtml(from ?? new Date(Date.now() - 2 * 86400e3), to ?? new Date()));
    console.log('Cột:', p.columns.join(' | '));
    for (const s of p.stations) console.log(`  ${s.code.padEnd(9)} ${s.name.padEnd(10)}`, p.thresholds[s.code] ?? '(không có ngưỡng)');
    console.log(`Số liệu mực nước: ${p.observations.length} giá trị; dòng không đọc được: ${p.unparsed}`);
} else {
    await mongoose.connect(ENV.MONGODB_URI);
    try {
        console.log(await syncPcttHydro({ ...(from && { from }), ...(to && { to }) }));
    } finally {
        await mongoose.disconnect();
    }
}
