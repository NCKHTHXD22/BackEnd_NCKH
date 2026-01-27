import mongoose from 'mongoose';

const RainLakeHistorySchema = new mongoose.Schema(
  {
    Id_Lake: { type: Number, required: true },
    lakeName: String,

    sumDepth: { type: Number, required: true },

    // 🔔 cảnh báo
    level: {
      type: String,
      enum: ['Không mưa', 'Mưa nhỏ', 'Mưa vừa', 'Mưa lớn'],
      default: 'Không mưa'
    },

    timestamp: { type: Date, required: true }
  },
  { versionKey: false }
);

RainLakeHistorySchema.index({ Id_Lake: 1, timestamp: -1 });

export default mongoose.model('RainLakeHistory', RainLakeHistorySchema);
