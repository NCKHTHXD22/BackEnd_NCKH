import mongoose from "mongoose";

// Chuỗi quan trắc mực nước theo thời gian tại trạm thủy văn (lộ trình mục 1.2).
// Mỗi (station_code, t_obs) là duy nhất – lấy lại nhiều lần không tạo bản ghi trùng.
const WaterLevelObservationSchema = new mongoose.Schema(
    {
        station_code: { type: String, required: true },     // khớp WaterLevelStation.code (vd. NONGSON)
        t_obs:        { type: Date, required: true },       // thời điểm đo (lưu UTC; nguồn ghi giờ Việt Nam)
        level:        { type: Number, required: true },     // mực nước (m) – hoặc độ sâu ngập nếu quantity = flood_depth
        quantity:     { type: String, default: "level" },   // level: mực nước sông/hồ; flood_depth: độ sâu ngập tại tháp
        unit:         { type: String, default: "m" },
        datum:        { type: String, default: "theo trạm (nguồn PCTT)" },  // hệ cao độ – chưa quy đổi
        source:       { type: String, default: "pctt.danang.gov.vn" },
        t_recv:       { type: Date, default: Date.now },    // thời điểm hệ thống nhận
        qc_flag:      { type: String, default: "raw" },     // raw | ok | suspect | corrected
    },
    { versionKey: false }
);
WaterLevelObservationSchema.index({ station_code: 1, t_obs: 1 }, { unique: true });

export default mongoose.model("WaterLevelObservation", WaterLevelObservationSchema);
