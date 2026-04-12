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
    // ── 11 hồ còn lại (thông số tham khảo — cần cập nhật từ hồ sơ thiết kế) ──
    {
        lake_id: 7,
        name: 'Sông Bung 4A',
        river: 'Sông Bung', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 130.0, MNDBT: 138.0, MNGC: 139.0, crest: 140.0,
        total_volume: 20, dead_volume: 5, flood_volume: 8,
        turbines: 1, capacity_mw: 16, turbine_efficiency: 0.88,
        tailwater_elev: 80.0, design_head: 52.0, max_turbine_flow: 40,
        spillway_crest_elev: 134.0, spillway_width: 12, spillway_coef: 0.42, min_env_flow: 1.0,
    },
    {
        lake_id: 8,
        name: 'Sông Bung 5',
        river: 'Sông Bung', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 175.0, MNDBT: 185.0, MNGC: 186.5, crest: 187.5,
        total_volume: 100, dead_volume: 28, flood_volume: 30,
        turbines: 2, capacity_mw: 50, turbine_efficiency: 0.88,
        tailwater_elev: 130.0, design_head: 49.0, max_turbine_flow: 130,
        spillway_crest_elev: 180.0, spillway_width: 2 * 10, spillway_coef: 0.42, min_env_flow: 2.0,
    },
    {
        lake_id: 9,
        name: 'Sông Bung 2',
        river: 'Sông Bung', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 330.0, MNDBT: 340.0, MNGC: 342.0, crest: 343.0,
        total_volume: 250, dead_volume: 70, flood_volume: 60,
        turbines: 2, capacity_mw: 100, turbine_efficiency: 0.88,
        tailwater_elev: 265.0, design_head: 69.0, max_turbine_flow: 185,
        spillway_crest_elev: 336.0, spillway_width: 2 * 12, spillway_coef: 0.42, min_env_flow: 2.5,
    },
    {
        lake_id: 11,
        name: 'Sông Bung 6',
        river: 'Sông Bung', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 93.0, MNDBT: 100.0, MNGC: 101.0, crest: 102.0,
        total_volume: 50, dead_volume: 12, flood_volume: 15,
        turbines: 1, capacity_mw: 30, turbine_efficiency: 0.88,
        tailwater_elev: 55.0, design_head: 40.0, max_turbine_flow: 95,
        spillway_crest_elev: 96.0, spillway_width: 12, spillway_coef: 0.42, min_env_flow: 1.5,
    },
    {
        lake_id: 12,
        name: 'Sông Tranh 3',
        river: 'Sông Tranh (Thu Bồn)', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 60.0, MNDBT: 65.0, MNGC: 66.0, crest: 67.0,
        total_volume: 60, dead_volume: 15, flood_volume: 18,
        turbines: 2, capacity_mw: 60, turbine_efficiency: 0.88,
        tailwater_elev: 25.0, design_head: 35.0, max_turbine_flow: 215,
        spillway_crest_elev: 61.0, spillway_width: 2 * 10, spillway_coef: 0.42, min_env_flow: 2.0,
    },
    {
        lake_id: 13,
        name: 'Za Hung',
        river: 'Sông Za Hung (A Vương)', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 150.0, MNDBT: 160.0, MNGC: 161.5, crest: 162.5,
        total_volume: 130, dead_volume: 35, flood_volume: 40,
        turbines: 2, capacity_mw: 90, turbine_efficiency: 0.88,
        tailwater_elev: 90.0, design_head: 64.0, max_turbine_flow: 175,
        spillway_crest_elev: 155.0, spillway_width: 2 * 11, spillway_coef: 0.42, min_env_flow: 2.0,
    },
    {
        lake_id: 14,
        name: 'Đắk Mi 3',
        river: 'Sông Đắk Mi', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 340.0, MNDBT: 352.0, MNGC: 353.5, crest: 354.5,
        total_volume: 70, dead_volume: 18, flood_volume: 20,
        turbines: 1, capacity_mw: 30, turbine_efficiency: 0.88,
        tailwater_elev: 270.0, design_head: 76.0, max_turbine_flow: 50,
        spillway_crest_elev: 348.0, spillway_width: 12, spillway_coef: 0.42, min_env_flow: 1.5,
    },
    {
        lake_id: 15,
        name: 'Khe Diên',
        river: 'Sông Vu Gia', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 18.0, MNDBT: 24.0, MNGC: 25.0, crest: 26.0,
        total_volume: 35, dead_volume: 8, flood_volume: 10,
        turbines: 1, capacity_mw: 30, turbine_efficiency: 0.88,
        tailwater_elev: 5.0, design_head: 17.0, max_turbine_flow: 225,
        spillway_crest_elev: 21.0, spillway_width: 3 * 10, spillway_coef: 0.42, min_env_flow: 2.0,
    },
    {
        lake_id: 16,
        name: 'Sông Côn 2',
        river: 'Sông Côn', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 320.0, MNDBT: 334.0, MNGC: 335.5, crest: 336.5,
        total_volume: 90, dead_volume: 22, flood_volume: 25,
        turbines: 2, capacity_mw: 60, turbine_efficiency: 0.88,
        tailwater_elev: 252.0, design_head: 76.0, max_turbine_flow: 100,
        spillway_crest_elev: 330.0, spillway_width: 2 * 10, spillway_coef: 0.42, min_env_flow: 1.5,
    },
    {
        lake_id: 17,
        name: 'Sông Tranh 4',
        river: 'Sông Tranh (Thu Bồn)', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 53.0, MNDBT: 58.0, MNGC: 59.0, crest: 60.0,
        total_volume: 40, dead_volume: 10, flood_volume: 12,
        turbines: 1, capacity_mw: 40, turbine_efficiency: 0.88,
        tailwater_elev: 20.0, design_head: 34.0, max_turbine_flow: 150,
        spillway_crest_elev: 55.0, spillway_width: 2 * 10, spillway_coef: 0.42, min_env_flow: 1.5,
    },
    {
        lake_id: 19,
        name: 'Đắk Mi 4C',
        river: 'Sông Đắk Mi', province: 'Quảng Nam', regulation_doc: 'QĐ 471/QĐ-TTg (2016)',
        MNC: 153.0, MNDBT: 162.0, MNGC: 163.0, crest: 164.0,
        total_volume: 45, dead_volume: 12, flood_volume: 15,
        turbines: 1, capacity_mw: 35, turbine_efficiency: 0.88,
        tailwater_elev: 100.0, design_head: 57.0, max_turbine_flow: 75,
        spillway_crest_elev: 158.0, spillway_width: 12, spillway_coef: 0.42, min_env_flow: 1.5,
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
