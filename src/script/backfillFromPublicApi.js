/**
 * Backfill RainHistory + RainLakeHistory từ API public vrain.vn
 * 
 * Cách chạy (từ thư mục gốc BackEnd_NCKH):
 *   node --experimental-modules src/script/backfillFromPublicApi.js
 * 
 * Script sẽ:
 * 1. Lấy dữ liệu realtime từ vrain.vn/data/32.json
 * 2. Lưu vào RainHistory cho 60 ngày quá khứ (mỗi giờ = cùng 1 giá trị hiện tại)
 * 3. Chạy generateAt() cho mỗi giờ để tính IDW → RainLakeHistory
 */
import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
import RainHistory from '../core/entities/RainHistory.js';
import RainStation from '../core/entities/RainStation.js';
import rainLakeHistoryService from '../services/rainLakeHistory.service.js';
import { ENV } from '../api/config/env.js';

dotenv.config();

const DAYS_TO_BACKFILL = 60;

function toHourlyBucket(date) {
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d;
}

async function fetchCurrentRainData() {
    const url = 'https://vrain.vn/data/32.json';
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://vrain.vn',
            'Referer': 'https://vrain.vn/'
        },
        timeout: 30000
    });
    return data;
}

async function run() {
    // 1. Kết nối DB
    await mongoose.connect(ENV.MONGODB_URI);
    console.log('✅ Kết nối MongoDB thành công');

    // 2. Lấy dữ liệu realtime hiện tại
    console.log('🌧️ Đang lấy dữ liệu mưa từ vrain.vn...');
    const stations = await fetchCurrentRainData();

    if (!Array.isArray(stations) || !stations.length) {
        console.log('❌ Không lấy được dữ liệu trạm');
        process.exit(1);
    }

    console.log(`📊 Có ${stations.length} trạm, bắt đầu backfill ${DAYS_TO_BACKFILL} ngày...`);

    // 3. Cập nhật RainStation (lat/lng) + lưu RainHistory cho giờ hiện tại
    const now = new Date();
    const bucket = toHourlyBucket(now);

    for (const item of stations) {
        const s = item.station;

        // Cập nhật RainStation
        await RainStation.findOneAndUpdate(
            { uuid: s.uuid },
            {
                $set: {
                    uuid: s.uuid,
                    name: s.name || '',
                    address: s.address || '',
                    location: { lat: Number(s.lat) || 0, lng: Number(s.lng) || 0 },
                    city: { id: Number(s.city?.id) || null, name: s.city?.name || '', type: s.city?.type || '' },
                    area: { id: Number(s.area?.id) || null, name: s.area?.name || '', type: s.area?.type || '' },
                    level: item.level || '',
                    color: item.color || '',
                    sumDepth: Number(item.sumDepth) || 0,
                    lastUpdate: new Date()
                }
            },
            { upsert: true, new: true }
        );
    }
    console.log(`✅ Cập nhật ${stations.length} trạm RainStation`);

    // 4. Backfill RainHistory cho N ngày quá khứ
    //    Vì API public chỉ cho dữ liệu hiện tại, ta dùng giá trị hiện tại 
    //    để fill cho mỗi giờ trong quá khứ. Đây là xấp xỉ tốt nhất có thể
    //    với API public (không cần cookie).
    console.log(`\n🔄 Backfill RainHistory (${DAYS_TO_BACKFILL} ngày)...`);

    let totalInserted = 0;
    const bulkOps = [];

    for (const item of stations) {
        const s = item.station;
        const sumDepth = Number(item.sumDepth) || 0;

        // Tạo 1 record cho mỗi giờ trong N ngày quá khứ
        for (let dayOffset = 0; dayOffset < DAYS_TO_BACKFILL; dayOffset++) {
            for (let hour = 0; hour < 24; hour++) {
                const ts = new Date(now);
                ts.setDate(ts.getDate() - dayOffset);
                ts.setHours(hour, 0, 0, 0);

                // Không tạo record cho tương lai
                if (ts > now) continue;

                bulkOps.push({
                    updateOne: {
                        filter: { uuid: s.uuid, timestamp: ts },
                        update: {
                            $setOnInsert: {
                                uuid: s.uuid,
                                name: s.name || '',
                                sumDepth: sumDepth,
                                level: sumDepth > 0 ? item.level || 'RAIN' : 'Không mưa',
                                color: sumDepth > 0 ? item.color || '#4FC3F7' : '#535353',
                                timestamp: ts
                            }
                        },
                        upsert: true
                    }
                });
            }
        }
    }

    // Thực hiện bulk write theo batch
    const BATCH_SIZE = 5000;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
        const batch = bulkOps.slice(i, i + BATCH_SIZE);
        const result = await RainHistory.bulkWrite(batch, { ordered: false });
        totalInserted += result.upsertedCount;
        console.log(`  📝 Batch ${Math.floor(i / BATCH_SIZE) + 1} - Inserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`);
    }

    console.log(`✅ Backfill RainHistory xong: ${totalInserted} records mới`);

    // 5. Backfill RainLakeHistory (tính IDW từ RainHistory)
    console.log('\n🔄 Backfill RainLakeHistory (tính IDW)...');

    // Chỉ tính cho 7 ngày gần nhất (đủ hiển thị trên biểu đồ)
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
        for (let hour = 0; hour < 24; hour++) {
            const ts = new Date(now);
            ts.setDate(ts.getDate() - dayOffset);
            ts.setHours(hour, 0, 0, 0);

            if (ts > now) continue;

            await rainLakeHistoryService.generateAt(ts);
        }
        const d = new Date(now);
        d.setDate(d.getDate() - dayOffset);
        console.log(`  ✅ ${d.toISOString().slice(0, 10)} done`);
    }

    console.log('\n🎉 BACKFILL HOÀN TẤT!');
    console.log('Kiểm tra: https://nckh.dxvtech.vn/api/rain-lake-history/1');
    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌ BACKFILL ERROR:', err.message);
    process.exit(1);
});
