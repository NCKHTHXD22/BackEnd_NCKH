import mongoose from "mongoose";

/**
 * Notification — thông báo cá nhân (dùng auth) + cảnh báo hệ thống (public)
 *
 *  Types cá nhân   : post_approved | post_rejected
 *  Types hệ thống  : flood_alert | rain_warning | reservoir_warning | route_warning
 */
const notificationSchema = new mongoose.Schema({
    // null => thông báo công khai (hệ thống), có ObjectId => thông báo cá nhân
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    type: {
        type: String,
        enum: [
            // Cá nhân
            'post_approved', 'post_rejected', 'post_moderation',
            // Hệ thống (public)
            'flood_alert',       // khu vực ngập
            'rain_warning',      // mưa lớn sắp/đang xảy ra
            'reservoir_warning', // hồ chứa ở mức nguy hiểm / cảnh báo
            'route_warning',     // tuyến đường sắp ngập
        ],
        required: true,
    },

    // Nội dung hiển thị
    title:   { type: String, default: null },   // tiêu đề ngắn
    content: { type: String, required: true },

    // Mức ưu tiên: 1 (info) → 2 (warning) → 3 (danger)
    priority: { type: Number, default: 1, index: true },

    // Metadata tuỳ theo type (vị trí, mức ngập, tên hồ...)
    meta: { type: mongoose.Schema.Types.Mixed, default: null },

    read:      { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },  // dùng cho system alerts (auto-expire)
    expires_at:{ type: Date, default: null },      // null = không hết hạn
}, { timestamps: true });

// Index để lấy nhanh system alerts đang active
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ type: 1, is_active: 1 });

export default mongoose.model("Notification", notificationSchema);
