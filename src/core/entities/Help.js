import mongoose from "mongoose";

const helpSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    address: {
        province: { type: String, required: true },
        ward:     { type: String, required: true },
        street:   { type: String, required: true },
    },
    description: {
        type: String,
        required: true,
    },
    what3words: {
        type: String,
    },
    location: {
        latitude:  { type: Number },
        longitude: { type: Number },
    },
    imageUrls: [{ type: String }],

    // ── Trạng thái duyệt bởi Admin ──────────────────────────────────────────
    // pending  = chờ duyệt (mặc định)
    // approved = đã được Admin chấp thuận → hiển thị cho người dùng lân cận
    // rejected = bị từ chối
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true,
    },
    approvedAt:  { type: Date, default: null },
    approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    rejectReason:{ type: String, default: null },

    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Help = mongoose.model("HelpRequest", helpSchema);

export default Help;
