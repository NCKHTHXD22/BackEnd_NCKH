import mongoose from "mongoose";

const RainHistorySchema = new mongoose.Schema(
  {
    uuid: { type: String, required: true },
    name: { type: String },
    sumDepth: { type: Number, default: 0 },
    timestamp: { type: Date, required: true }
  },
  {
    versionKey: false,
    timestamps: true
  }
);

// ⛔ CỰC KỲ QUAN TRỌNG
RainHistorySchema.index(
  { uuid: 1, timestamp: 1 },
  { unique: true }
);

export default mongoose.model("RainHistory", RainHistorySchema);
