import mongoose from 'mongoose';

/**
 * Bảng quan hệ Z – V – F (mực nước, dung tích, diện tích mặt nước)
 * Mỗi document = 1 hồ, chứa mảng các điểm đặc trưng
 */
const ZVCurveSchema = new mongoose.Schema(
    {
        lake_id: { type: Number, required: true, unique: true },
        name:    { type: String },

        // Mảng điểm đặc trưng Z-V-F, sắp xếp tăng dần theo z
        points: [
            {
                z: { type: Number, required: true },      // Mực nước (m)
                volume: { type: Number, required: true }, // Dung tích (triệu m³)
                area:   { type: Number },                 // Diện tích mặt nước (km²)
            }
        ],

        updated_at: { type: Date, default: Date.now },
    },
    { versionKey: false }
);

export default mongoose.model('ZVCurve', ZVCurveSchema);
