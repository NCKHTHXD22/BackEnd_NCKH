import mongoose from 'mongoose';

const RainLakeSchema = new mongoose.Schema(
  {
    Id_Lake: { type: Number, unique: true, required: true },
    name: String,
    address: String,
    lat: Number,
    lon: Number,

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true } // [lon, lat]
    },

    sumDepth: { type: Number, default: 0 },
    lastUpdate: { type: Date, default: Date.now }
  },
  { timestamps: true, versionKey: false }
);

RainLakeSchema.index({ location: '2dsphere' });

const RainLake = mongoose.model('RainLake', RainLakeSchema);

export default RainLake;
