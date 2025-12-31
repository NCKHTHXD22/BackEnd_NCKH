import mongoose from 'mongoose';

const ForecastSchema = new mongoose.Schema({
  reservoirId: { type: Number, required: true },
  targetTime: { type: Date, required: true },
  value: { type: Number, required: true },
  actual: { type: Number, default: null },
  error: { type: Number, default: null },
  percentError: { type: Number, default: null },
  createdAt: { type: Date, required: true, default: Date.now }
}, {
  versionKey: false
});

ForecastSchema.index(
  { reservoirId: 1, targetTime: 1 },
  { unique: true }
);

export default mongoose.model('Forecast', ForecastSchema);
