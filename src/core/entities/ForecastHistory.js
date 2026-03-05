import mongoose from 'mongoose';

const forecastHistorySchema = new mongoose.Schema({
    reservoirId: { type: Number, required: true, index: true },
    rainSource: { type: String, default: null }, // "RainLake", "BestMatch", "ECMWF", "GFS", "JMA", "ICON"
    targetTime: { type: Date, required: true },
    value: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    actual: { type: Number, default: null },
    error: { type: Number, default: null },
    percentError: { type: Number, default: null }
});

// Compound index: tránh duplicate + query nhanh
forecastHistorySchema.index(
    { reservoirId: 1, targetTime: 1, rainSource: 1, createdAt: 1 },
    { unique: true }
);

export default mongoose.model('ForecastHistory', forecastHistorySchema);
