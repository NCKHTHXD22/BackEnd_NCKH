import mongoose from 'mongoose';

const LakeSpecSchema = new mongoose.Schema(
    {
        lake_id:            { type: Number, required: true, unique: true },
        name:               { type: String, required: true },           // Tên hồ
        river:              { type: String },                            // Sông
        province:           { type: String },                            // Tỉnh
        regulation_doc:     { type: String },                            // Số QĐ quy trình

        // ── Mực nước vận hành (m) ──────────────────────────────────────
        MNC:    { type: Number, required: true },   // Mực nước chết
        MNDBT:  { type: Number, required: true },   // Mực nước dâng bình thường
        MNGC:   { type: Number, required: true },   // Mực nước gia cường
        crest:  { type: Number, required: true },   // Cao trình đỉnh đập

        // ── Dung tích (triệu m³) ───────────────────────────────────────
        total_volume:   { type: Number },   // Tổng dung tích toàn hồ
        dead_volume:    { type: Number },   // Dung tích chết (dưới MNC)
        flood_volume:   { type: Number },   // Dung tích phòng lũ

        // ── Phát điện ─────────────────────────────────────────────────
        turbines:           { type: Number, default: 2 },   // Số tổ máy
        capacity_mw:        { type: Number },               // Công suất lắp máy (MW)
        turbine_efficiency: { type: Number, default: 0.88 },// Hiệu suất tuabin
        tailwater_elev:     { type: Number },               // Cao trình hạ lưu (m)
        design_head:        { type: Number },               // Cột nước thiết kế (m)
        max_turbine_flow:   { type: Number },               // Q max qua tuabin (m³/s)

        // ── Tràn xả lũ ────────────────────────────────────────────────
        spillway_crest_elev:{ type: Number },   // Cao trình ngưỡng tràn (m)
        spillway_width:     { type: Number },   // Chiều rộng tràn (m)
        spillway_coef:      { type: Number, default: 0.42 }, // Hệ số lưu lượng m

        // ── Môi trường ─────────────────────────────────────────────────
        min_env_flow:       { type: Number, default: 4 },   // Q sinh thái tối thiểu (m³/s)

        updated_at: { type: Date, default: Date.now },
    },
    { versionKey: false }
);

export default mongoose.model('LakeSpec', LakeSpecSchema);
