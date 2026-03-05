import mongoose from 'mongoose';

const InflowLakeSchema = new mongoose.Schema(
    {
        Id_Lake: { type: Number, unique: true, required: true },
        name: String,
        address: String,
        lat: Number,
        lon: Number,

        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true }
        },

        sumDepth: { type: Number, default: 0 },

        level: {
            type: String,
            enum: ['Không mưa', 'Mưa nhỏ', 'Mưa vừa', 'Mưa lớn'],
            default: 'Không mưa'
        },

        // HYDRO DATA
        qvao: { type: Number, default: 0 },
        luuluongxa: { type: Number, default: 0 },
        htl: { type: Number, default: 0 },

        lastUpdate: { type: Date, default: Date.now }
    },
    { timestamps: true, versionKey: false }
);

InflowLakeSchema.index({ location: '2dsphere' });

// Đổi tên model thành 'InflowLake' để MongoDB tạo/sử dụng collection 'inflowlakes'
export default mongoose.model('InflowLake', InflowLakeSchema);
