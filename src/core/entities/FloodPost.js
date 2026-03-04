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
