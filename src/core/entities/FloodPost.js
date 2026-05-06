import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    location: {
        province: { type: String, required: true },
        district: { type: String, required: true },
        address: { type: String },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
    },
    floodLevel: {
        type: Number,
        required: true,
        min: 0,
    },
    areaType: {
        type: String,
        enum: ['Trong nhà', 'Ngoài đường', 'Khu vực khác'],
        required: true,
    },
    floodTime: {
        type: Date,
        required: true,
    },
    description: {
        type: String,
        maxlength: 500,
    },
    imageUrls: {
        type: [String],
        default: [],
    },
    isFrequentFlood: {
        type: Boolean,
        default: false,
    },
    // ── Kết quả AI xử lý ảnh ──────────────────────────────────────
    aiProcessed:    { type: Boolean, default: false },
    aiLabel:        { type: String, default: null },   // SAFE | HIGH | DEEP | DANGEROUS | UNDETECTED | ERROR_AI
    aiFloodLevel:   { type: Number, default: null },   // cm (do AI tính từ ảnh)
    aiScore:        { type: Number, default: null },   // confidence 0–1
    aiAutoApproved: { type: Boolean, default: false }, // true nếu AI tự duyệt (không cần Admin)
    // ─────────────────────────────────────────────────────────────
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true,
    },
    rejectReason: {
        type: String,
        default: '',
    },
}, { timestamps: true });

const Post = mongoose.model("Post", postSchema);

export default Post;
