import mongoose from 'mongoose';

const ForecastXGBSchema = new mongoose.Schema({
    Id_Lake: { type: Number, required: true },
    qvao_forecast: { type: Number, required: true }, // P50
    p10: { type: Number, default: null },
    p90: { type: Number, default: null },
    forecastTime: { type: Date, required: true },
    generatedAt: { type: Date, required: true, default: Date.now }
}, {
    collection: 'forecast_XGB',
    versionKey: false
});

ForecastXGBSchema.index({ Id_Lake: 1, forecastTime: 1 }, { unique: true });

export default mongoose.model('ForecastXGB', ForecastXGBSchema);
