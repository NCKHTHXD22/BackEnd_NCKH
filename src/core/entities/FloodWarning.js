import mongoose from "mongoose";
import Counter from "./Counter.js";

const FloodWarningSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    location: {
        lat: Number,
        lng: Number
    },
    waterLevel: Number,
    thresholds: {
        level1: Number,
        level2: Number,
        level3: Number
    },
    createdAt: { type: Date, default: Date.now }
});

FloodWarningSchema.pre("save", async function (next) {
    if (this.id) return next();

    const counter = await Counter.findOneAndUpdate(
        { model: "FloodWarning" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    this.id = counter.seq;
    next();
});

export default mongoose.model("FloodWarning", FloodWarningSchema);
