// src/core/entities/RainLakeHistory.js
import mongoose from 'mongoose';

const RainLakeHistorySchema = new mongoose.Schema(
  {
    Id_Lake: { type: Number, required: true },
    lakeName: String,

    sumDepth: { type: Number, default: 0 },
    level: String,

    timestamp: { type: Date, required: true }
  },
  { versionKey: false }
);

// 🔒 Mỗi hồ + mỗi giờ chỉ có 1 record
RainLakeHistorySchema.index(
  { Id_Lake: 1, timestamp: 1 },
  { unique: true }
);

export default mongoose.model('RainLakeHistory', RainLakeHistorySchema);
