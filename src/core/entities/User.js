import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    clerkId: {
        type: String,
        required: true,
        unique: true,
    },
    email: String,
    name: String,
    phone: String,
    allowNotification: Boolean,
    favoriteLocation: [String],
    expoPushToken: { type: String, default: null },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'banned'], default: 'active' },
    // "Tôi an toàn" — người dùng tự báo cáo tình trạng an toàn trong sự kiện lũ
    safetyCheckin: {
        isSafe: { type: Boolean, default: null },
        checkedAt: { type: Date, default: null },
        lat: { type: Number, default: null },
        lon: { type: Number, default: null },
    },
    // Vị trí gần nhất app gửi lên khi đang mở (không phải theo dõi liên tục
    // nền hệ điều hành) — dùng để proximityAlert.job.js kiểm tra cảnh báo
    // ngập/mưa cực lớn gần người dùng ngay cả khi app đang ở background/đã
    // tắt, miễn app còn được mở đủ gần đây (xem PROXIMITY_LOCATION_MAX_AGE_MS).
    lastLocation: {
        lat: { type: Number, default: null },
        lon: { type: Number, default: null },
        updatedAt: { type: Date, default: null },
    },
    // Ngưỡng cảnh báo cận kề cá nhân hoá — đồng bộ từ lib/alertPrefs.js trên
    // app (SecureStore) để job cảnh báo phía server dùng đúng lựa chọn của
    // từng người thay vì áp mặc định 300m/30cm cho tất cả.
    alertRadiusKm: { type: Number, default: 0.3 },
    alertLevelCm: { type: Number, default: 30 },
    // Chống spam cảnh báo cận kề — tương tự cơ chế dismiss/cooldown phía
    // client (30 phút) nhưng áp dụng khi cảnh báo được gửi từ server.
    // Map key ("flood-nearby" | "rain-extreme") -> lần gửi push gần nhất, vì
    // 2 loại cảnh báo có thể cùng hoạt động độc lập với cooldown riêng.
    lastProximityAlertAt: {
        type: Map,
        of: Date,
        default: {},
    },
}, {
    timestamps: true,
});

const User = mongoose.model('User', userSchema);

export default User;
