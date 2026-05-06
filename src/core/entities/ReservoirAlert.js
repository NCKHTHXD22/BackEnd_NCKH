import mongoose from 'mongoose';

/**
 * Cảnh báo vận hành hồ chứa — tạo tự động mỗi 15 phút bởi floodAlert.job
 */
const ReservoirAlertSchema = new mongoose.Schema(
    {
        lake_id:    { type: Number, required: true, index: true },
        lake_name:  { type: String },

        // Mức cảnh báo: normal | watch | warning | danger
        alert_level: {
            type: String,
            enum: ['normal', 'watch', 'warning', 'danger'],
            required: true,
            index: true,
        },

        // Dữ liệu thực đo tại thời điểm kiểm tra
        htl_current:  { type: Number },   // mực nước thực (m)
        q_in:         { type: Number },   // Q vào thực (m³/s)
        q_out:        { type: Number },   // Q xả thực (m³/s)
        fill_pct:     { type: Number },   // % dung tích

        // Kết quả dự báo cân bằng nước (water-balance)
        htl_forecast_max:   { type: Number },  // Z dự báo cao nhất (m)
        hour_to_max:        { type: Number },  // Bao nhiêu giờ nữa đạt đỉnh
        forecast_steps:     { type: Number },  // Số bước dự báo

        // Khuyến nghị vận hành
        q_recommended: { type: Number },
        reason:        { type: String },
        detail:        { type: String },
        actions:       [{ type: String }],

        is_active:  { type: Boolean, default: true, index: true },
        checked_at: { type: Date, default: Date.now },   // Lần cuối cron check
        resolved_at:{ type: Date, default: null },
    },
    {
        versionKey: false,
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

// 1 document active duy nhất per lake (upsert theo lake_id + is_active)
ReservoirAlertSchema.index({ lake_id: 1, is_active: 1 });

export default mongoose.model('ReservoirAlert', ReservoirAlertSchema);
