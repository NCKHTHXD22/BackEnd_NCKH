import mongoose from "mongoose";
import Counter from "./Counter.js";

const WaterLevelSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    location: {
        lat: Number,
        lng: Number
    },
    level: Number,
    thresholds: {
        level1: Number,   // báo động I (m)
        level2: Number,   // báo động II (m)
        level3: Number    // báo động III (m)
    },
    // ── Trạm thủy văn lấy từ pctt.danang.gov.vn/so-lieu/thuy-van ──
    code: { type: String, unique: true, sparse: true },  // mã trạm (vd. NONGSON; MG431002 = trạm tự động trên muangap)
    kind: String,             // river_kttv (trạm KTTV, PCTT) | river_auto | reservoir_auto (trạm tự động muangap/VRain)
    river: String,
    source: String,
    decision_level: Number,   // QĐ 1865 Điều 6.4: mực nước quyết định vận hành cắt, giảm lũ = (BĐ II + BĐ III) / 2
    level_time: Date,         // thời điểm của `level` mới nhất
    location_note: String,
    thresholds_updated_at: Date,
    createdAt: { type: Date, default: Date.now }
});

// Mongoose 9: hook async không còn nhận `next` (gọi next() sẽ lỗi "next is not a function")
WaterLevelSchema.pre("save", async function () {
    if (this.id) return;

    const counter = await Counter.findOneAndUpdate(
        { model: "WaterLevelStation" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    this.id = counter.seq;
});

export default mongoose.model("WaterLevelStation", WaterLevelSchema);
