import mongoose from "mongoose";
import Counter from "./Counter.js";

const FloodTowerSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    location: {
        lat: Number,
        lng: Number
    },
    floodLevel: Number,       // độ sâu ngập hiện tại (m)
    // ── Tháp báo ngập/lũ tự động (VRain – mucnuoc.vrain.vn) ──
    code: { type: String, unique: true, sparse: true },   // FT + mã trạm VRain (vd. FT431068)
    sid: String,              // mã định danh trạm trên VRain
    tower_type: String,       // flood_1m5 (tháp báo ngập) | flood_3m (tháp báo lũ)
    area: String,
    address: String,
    source: String,
    level_time: Date,
    thresholds: {
        level1: Number,
        level2: Number,
        level3: Number
    },
    createdAt: { type: Date, default: Date.now }
});

// Auto-increment ID
FloodTowerSchema.pre("save", async function () {   // Mongoose 9: hook async không nhận `next`
    if (this.id) return;

    const counter = await Counter.findOneAndUpdate(
        { model: "FloodTower" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    this.id = counter.seq;
});

export default mongoose.model("FloodTower", FloodTowerSchema);
