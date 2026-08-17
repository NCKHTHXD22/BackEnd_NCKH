import mongoose from 'mongoose';

// Các loại báo cáo — quyết định field nào bắt buộc bên dưới
const REPORT_TYPES = ['flood_point', 'flood_road', 'fallen_tree', 'landslide'];
const POINT_TYPES = ['flood_point', 'fallen_tree'];       // cần ghim toạ độ duy nhất
const RANGE_TYPES = ['flood_road', 'landslide'];          // cần cặp địa chỉ từ/đến
const FLOOD_LEVEL_TYPES = ['flood_point', 'flood_road'];  // có khối "Mức ngập"

const postSchema = new mongoose.Schema({
    reportType: {
        type: String,
        enum: REPORT_TYPES,
        required: true,
        default: 'flood_point',
        index: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        default: null,
    },
    location: {
        province: { type: String, required: true },
        district: { type: String, required: true },
        address: { type: String },
        latitude: {
            type: Number,
            required: function () { return POINT_TYPES.includes(this.reportType); },
        },
        longitude: {
            type: Number,
            required: function () { return POINT_TYPES.includes(this.reportType); },
        },
    },
    // Dùng chung cho "Đường ngập" (Ngập từ/Đến địa chỉ) và "Khu vực sạt lở"
    // (Địa chỉ bắt đầu/kết thúc sạt lở) — reportType luôn xác định ý nghĩa thực tế.
    fromAddress: {
        type: String,
        required: function () { return RANGE_TYPES.includes(this.reportType); },
    },
    toAddress: {
        type: String,
        required: function () { return RANGE_TYPES.includes(this.reportType); },
    },
    floodLevel: {
        type: Number,
        min: 0,
        required: function () { return FLOOD_LEVEL_TYPES.includes(this.reportType); },
    },
    areaType: {
        type: String,
        enum: ['Trong nhà', 'Ngoài đường', 'Khu vực khác'],
        required: function () { return FLOOD_LEVEL_TYPES.includes(this.reportType); },
    },
    landslideStatus: {
        type: String,
        enum: ['Có nguy cơ', 'Đã sạt lở'],
        required: function () { return this.reportType === 'landslide'; },
    },
    // "Thời điểm bắt đầu sự kiện" chung cho cả 4 loại (label đổi theo loại ở UI)
    floodTime: {
        type: Date,
        required: true,
    },
    // Chỉ dùng cho "Khu vực sạt lở" — "Thời gian kết thúc sạt lở"
    eventEndTime: {
        type: Date,
        required: function () { return this.reportType === 'landslide'; },
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

export { REPORT_TYPES, POINT_TYPES, RANGE_TYPES, FLOOD_LEVEL_TYPES };
export default Post;
