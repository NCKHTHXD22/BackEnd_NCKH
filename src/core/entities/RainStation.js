import mongoose from "mongoose";

const SubLocationSchema = new mongoose.Schema({
    id: Number,
    name: String,
    type: String
}, { _id: false });   // 👈 Quan trọng: không tạo _id cho subdocument

const RainStationSchema = new mongoose.Schema({

    uuid: { type: String, unique: true, required: true },

    name: String,
    address: String,

    location: {
        lat: Number,
        lng: Number
    },

    // ⭐ DÙNG SUB-SCHEMA → KHÔNG ERROR
    city: { type: SubLocationSchema, default: {} },
    area: { type: SubLocationSchema, default: {} },

    level: String,
    color: String,
    sumDepth: { type: Number, default: 0 },

    lastUpdate: { type: Date, default: Date.now }

}, { versionKey: false });

export default mongoose.model("RainStation", RainStationSchema);
