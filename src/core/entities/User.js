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
}, {
    timestamps: true,
});

const User = mongoose.model('User', userSchema);

export default User;
