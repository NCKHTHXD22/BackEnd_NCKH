import mongoose from 'mongoose';

const InflowLakeHistorySchema = new mongoose.Schema(
    {
        Id_Lake: { type: Number, required: true },
        lakeName: String,

        qvao: { type: Number, default: 0 },
        luuluongxa: { type: Number, default: 0 },
        htl: { type: Number, default: 0 },

        timestamp: { type: Date, required: true }
    },
    {
        versionKey: false,
        timestamps: true
    }
);

// Unique index per lake per hour
InflowLakeHistorySchema.index(
    { Id_Lake: 1, timestamp: 1 },
    { unique: true }
);

export default mongoose.model('InflowLakeHistory', InflowLakeHistorySchema);
