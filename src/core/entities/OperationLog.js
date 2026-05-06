import mongoose from 'mongoose';

/**
 * Nhật ký vận hành hồ — mỗi lần cron chạy hoặc admin ra lệnh thủ công
 */
const OperationLogSchema = new mongoose.Schema(
    {
        lake_id:   { type: Number, required: true, index: true },
        lake_name: { type: String },

        // Dữ liệu thực đo
        htl:      { type: Number },
        q_in:     { type: Number },
        q_out:    { type: Number },
        fill_pct: { type: Number },
        power_mw: { type: Number },

        // Dự báo
        htl_forecast_max: { type: Number },
        hour_to_max:      { type: Number },

        // Quyết định
        alert_level:   { type: String, enum: ['normal', 'watch', 'warning', 'danger', 'low'] },
        q_recommended: { type: Number },
        reason:        { type: String },
        actions:       [{ type: String }],

        source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
        logged_at: { type: Date, default: Date.now, index: true },
    },
    { versionKey: false }
);

// Giữ log 90 ngày — TTL index
OperationLogSchema.index({ logged_at: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export default mongoose.model('OperationLog', OperationLogSchema);
