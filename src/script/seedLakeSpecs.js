/**
 * Script seed dữ liệu thông số kỹ thuật hồ chứa vào MongoDB
 * Chạy: node src/script/seedLakeSpecs.js
 *
 * Nguồn:
 *  - QĐ 471/QĐ-TTg (2016) — Quy trình liên hồ chứa Vu Gia – Thu Bồn
 *  - QĐ 2125/QĐ-BCT — Quy trình vận hành Sông Tranh 2
 *  - Hồ sơ thiết kế các công trình
 */

import mongoose from 'mongoose';
import { ENV } from '../api/config/env.js';
import LakeSpec from '../core/entities/LakeSpec.js';
import ZVCurve from '../core/entities/ZVCurve.js';

await mongoose.connect(ENV.MONGODB_URI);
console.log('✅ MongoDB connected');

// ─── THÔNG SỐ KỸ THUẬT ────────────────────────────────────────────────────────
// lake_id khớp với InflowLake.Id_Lake:
//   1 = HỒ A VƯƠNG, 2 = HỒ ĐAK MI 4, 3 = HỒ SÔNG BUNG 4, 4 = HỒ SÔNG TRANH 2
const LAKE_SPECS = [
    {
        lake_id: 1,
        name: 'A Vương',
        river: 'Sông A Vương',
        province: 'Quảng Nam',
        regulation_doc: 'QĐ 471/QĐ-TTg (2016)',

        MNC: 100.0, MNDBT: 108.0, MNGC: 109.5, crest: 110.5,

        total_volume: 180,    // Mm³
        dead_volume:   30,    // Mm³
        flood_volume:  50,    // Mm³

        turbines: 2,
        capacity_mw: 210,
        turbine_efficiency: 0.88,
        tailwater_elev: 28.0,
        design_head: 74.0,
        max_turbine_flow: 320,   // m³/s (2 tổ)

        spillway_crest_elev: 103.0,
        spillway_width: 2 * 13,  // 2 khoang × 13m
        spillway_coef: 0.42,

        min_env_flow: 3.0,
    },
    {
        lake_id: 2,
        name: 'Đắk Mi 4',
        river: 'Sông Đắk Mi',
        province: 'Quảng Nam',
        regulation_doc: 'QĐ 471/QĐ-TTg (2016)',

        MNC: 225.0, MNDBT: 258.0, MNGC: 260.5, crest: 261.5,

        total_volume: 343,
        dead_volume:   97,
        flood_volume:  80,

        turbines: 3,
        capacity_mw: 210,
        turbine_efficiency: 0.88,
        tailwater_elev: 165.0,
        design_head: 87.0,
        max_turbine_flow: 280,

        spillway_crest_elev: 252.0,
        spillway_width: 3 * 12,
        spillway_coef: 0.42,

        min_env_flow: 3.5,
    },
    {
        lake_id: 3,
        name: 'Sông Bung 4',
        river: 'Sông Bung',
        province: 'Quảng Nam',
        regulation_doc: 'QĐ 471/QĐ-TTg (2016)',

        MNC: 160.0, MNDBT: 168.0, MNGC: 169.5, crest: 170.5,

        total_volume: 250,
        dead_volume:   60,
        flood_volume:  70,

        turbines: 2,
        capacity_mw: 156,
        turbine_efficiency: 0.88,
        tailwater_elev: 105.0,
        design_head: 57.0,
        max_turbine_flow: 330,

        spillway_crest_elev: 162.5,
        spillway_width: 2 * 12,
        spillway_coef: 0.42,

        min_env_flow: 3.0,
    },
    {
        lake_id: 4,
        name: 'Sông Tranh 2',
        river: 'Sông Tranh (Thu Bồn)',
        province: 'Quảng Nam',
        regulation_doc: 'QĐ 471/QĐ-TTg (2016)',

        MNC: 158.0, MNDBT: 175.0, MNGC: 176.5, crest: 177.0,

        total_volume: 685,
        dead_volume:  215,
        flood_volume: 190,

        turbines: 2,
        capacity_mw: 190,
        turbine_efficiency: 0.88,
        tailwater_elev: 106.0,
        design_head: 63.0,
        max_turbine_flow: 380,

        spillway_crest_elev: 168.0,
        spillway_width: 2 * 11,
        spillway_coef: 0.42,

        min_env_flow: 4.0,
    },
];

// ─── BẢNG Z-V-F ───────────────────────────────────────────────────────────────
// Nguồn: tra từ hồ sơ thiết kế, nội suy tuyến tính giữa các điểm
// ZV curves — lake_id khớp với InflowLake.Id_Lake
const ZV_CURVES = [
    {
        lake_id: 1,
        name: 'A Vương',
        points: [
            { z:  97.0, volume:  22, area: 2.5 },
            { z: 100.0, volume:  30, area: 3.2 },   // MNC
            { z: 102.0, volume:  40, area: 3.8 },
            { z: 104.0, volume:  55, area: 4.5 },
            { z: 106.0, volume:  75, area: 5.5 },
            { z: 108.0, volume: 100, area: 6.7 },   // MNDBT
            { z: 109.0, volume: 118, area: 7.4 },
            { z: 109.5, volume: 128, area: 7.8 },   // MNGC
            { z: 110.5, volume: 180, area: 8.8 },   // Crest
        ],
    },
    {
        lake_id: 2,
        name: 'Đắk Mi 4',
        points: [
            { z: 222.0, volume:  82, area: 4.0 },
            { z: 225.0, volume:  97, area: 4.8 },   // MNC
            { z: 230.0, volume: 120, area: 5.8 },
            { z: 235.0, volume: 148, area: 6.9 },
            { z: 240.0, volume: 180, area: 8.1 },
            { z: 245.0, volume: 215, area: 9.4 },
            { z: 250.0, volume: 255, area: 10.8 },
            { z: 252.0, volume: 270, area: 11.3 },
            { z: 255.0, volume: 300, area: 12.4 },
            { z: 258.0, volume: 343, area: 13.8 },  // MNDBT
            { z: 260.0, volume: 370, area: 14.7 },
            { z: 260.5, volume: 380, area: 15.0 },  // MNGC
            { z: 261.5, volume: 400, area: 15.5 },  // Crest
        ],
    },
    {
        lake_id: 3,
        name: 'Sông Bung 4',
        points: [
            { z: 157.0, volume:  50, area: 3.5 },
            { z: 160.0, volume:  60, area: 4.1 },   // MNC
            { z: 162.0, volume:  75, area: 4.9 },
            { z: 162.5, volume:  80, area: 5.1 },
            { z: 164.0, volume:  98, area: 5.8 },
            { z: 166.0, volume: 125, area: 6.8 },
            { z: 168.0, volume: 165, area: 8.0 },   // MNDBT
            { z: 169.0, volume: 195, area: 8.8 },
            { z: 169.5, volume: 215, area: 9.2 },   // MNGC
            { z: 170.5, volume: 250, area: 9.8 },   // Crest
        ],
    },
    {
        lake_id: 4,
        name: 'Sông Tranh 2',
        points: [
            { z: 155.0, volume:  195, area:  7.5 },
            { z: 158.0, volume:  215, area:  8.2 },   // MNC
            { z: 160.0, volume:  228, area:  9.1 },
            { z: 163.0, volume:  250, area: 10.5 },
            { z: 165.0, volume:  270, area: 11.5 },
            { z: 167.0, volume:  295, area: 12.8 },
            { z: 168.0, volume:  310, area: 13.5 },
            { z: 170.0, volume:  340, area: 14.8 },
            { z: 172.0, volume:  375, area: 16.2 },
            { z: 173.0, volume:  395, area: 17.0 },
            { z: 174.0, volume:  420, area: 17.9 },
            { z: 175.0, volume:  470, area: 19.2 },   // MNDBT
            { z: 176.0, volume:  510, area: 20.1 },
            { z: 176.5, volume:  540, area: 21.0 },   // MNGC
            { z: 177.0, volume:  685, area: 22.5 },   // Crest
        ],
    },
];

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
