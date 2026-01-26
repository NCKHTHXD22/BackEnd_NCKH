import mongoose from 'mongoose';

const RainLakeHistorySchema = new mongoose.Schema(
  {
    Id_Lake: { type: Number, required: true },
    lakeName: { type: String },

    sumDepth: { type: Number, default: 0 },

    timestamp: { type: Date, required: true }
  },
  {
    versionKey: false
  }
);

// query nhanh theo hồ + thời gian
RainLakeHistorySchema.index({ Id_Lake: 1, timestamp: -1 });

export default mongoose.model('RainLakeHistory', RainLakeHistorySchema);
