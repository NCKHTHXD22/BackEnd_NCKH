import mongoose from "mongoose";

const RainSnapshotSchema = new mongoose.Schema(
  {
    uuid: { type: String, required: true },
    name: String,
    depth: { type: Number, required: true },
    timePoint: { type: Date, required: true }
  },
  { versionKey: false }
);

RainSnapshotSchema.index(
  { uuid: 1, timePoint: 1 },
  { unique: true }
);

export default mongoose.model("RainSnapshot", RainSnapshotSchema);
