import mongoose from "mongoose";

const RainLakeQLakeSchema = new mongoose.Schema(
  {
    lakeId: {
      type: Number,
      required: true,
      index: true
    },

    time: {
      type: Date,
      required: true,
      index: true
    },

    rain: {
      type: Number, // sumdept
      default: null
    },

    q: {
      type: Number,
      required: true
    }
  },
  {
    timestamps: true
  }
);

RainLakeQLakeSchema.index({ lakeId: 1, time: 1 }, { unique: true });

export default mongoose.model("RainLake_QLake", RainLakeQLakeSchema);
