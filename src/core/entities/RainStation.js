import mongoose from "mongoose";
import Counter from "./Counter.js";

const RainStationSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    location: {
        lat: Number,
        lng: Number
    },
    rainfall: {
        today: Number,
        lastHour: Number,
        yesterday: Number,
        hourlyData: [Number]
    },
    createdAt: { type: Date, default: Date.now }
});

RainStationSchema.pre("save", async function (next) {
    if (this.id) return next();

    const counter = await Counter.findOneAndUpdate(
        { model: "RainStation" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    this.id = counter.seq;
    next();
});

export default mongoose.model("RainStation", RainStationSchema);
