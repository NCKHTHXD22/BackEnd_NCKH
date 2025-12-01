import mongoose from "mongoose";

const RainHistorySchema = new mongoose.Schema({
    uuid: { type: String, required: true },
    name: String,

    sumDepth: Number,
    level: String,
    color: String,

    timestamp: { type: Date, default: Date.now }
}, {
    versionKey: false
});

export default mongoose.model("RainHistory", RainHistorySchema);
    