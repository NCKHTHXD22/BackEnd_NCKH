/**
 * Script seed dữ liệu thông số kỹ thuật hồ chứa vào MongoDB
 * Chạy: node src/script/seedLakeSpecs.js
 *
 * Nguồn: QĐ 1865/QĐ-TTg ngày 23/12/2019 – Quy trình vận hành liên hồ chứa Vu Gia – Thu Bồn
 *  (thay thế QĐ 1537/QĐ-TTg ngày 07/9/2015) – xem src/api/config/qd1865.js, src/script/lakeSpecsData.js
 * CẢNH BÁO: ghi thẳng vào CSDL theo MONGODB_URI trong .env (production) – chỉ chạy khi đã thống nhất.
 */

import mongoose from 'mongoose';
import { ENV } from '../api/config/env.js';
import LakeSpec from '../core/entities/LakeSpec.js';
import ZVCurve from '../core/entities/ZVCurve.js';

await mongoose.connect(ENV.MONGODB_URI);
console.log('✅ MongoDB connected');

// Thông số hồ + bảng Z-V-F: nguồn duy nhất ở lakeSpecsData.js (tạo từ QĐ 1865/QĐ-TTg ngày 23/12/2019)
import { LAKE_SPECS, ZV_CURVES } from './lakeSpecsData.js';

// ─── SEED ─────────────────────────────────────────────────────────────────────
async function seed() {
    try {
        // LakeSpec
        for (const spec of LAKE_SPECS) {
            await LakeSpec.findOneAndUpdate(
                { lake_id: spec.lake_id },
                { $set: { ...spec, updated_at: new Date() } },
                { upsert: true, new: true }
            );
            console.log(`✅ LakeSpec upserted: ${spec.name} (id=${spec.lake_id})`);
        }

        // ZVCurve
        for (const curve of ZV_CURVES) {
            await ZVCurve.findOneAndUpdate(
                { lake_id: curve.lake_id },
                { $set: { ...curve, updated_at: new Date() } },
                { upsert: true, new: true }
            );
            console.log(`✅ ZVCurve  upserted: ${curve.name} (id=${curve.lake_id}), ${curve.points.length} điểm`);
        }

        console.log('\n🎉 Seed hoàn tất!');
    } catch (err) {
        console.error('❌ Seed lỗi:', err.message);
    } finally {
        await mongoose.disconnect();
    }
}

await seed();
