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
}, {
    timestamps: true,
});

const User = mongoose.model('User', userSchema);

export default User;
