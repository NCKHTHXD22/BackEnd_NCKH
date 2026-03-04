import mongoose from "mongoose";

const helpSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    address: {
        province: { type: String, required: true },
        ward: { type: String, required: true },
        street: { type: String, required: true },
    },
    description: {
        type: String,
        required: true,
    },
    what3words: {
        type: String,
    },
    location: {
        latitude: { type: Number },
        longitude: { type: Number },
    },
    imageUrls: [
        {
            type: String,
        }
    ],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Help = mongoose.model("HelpRequest", helpSchema);

export default Help;
