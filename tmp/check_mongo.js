import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const ForecastLSTMSchema = new mongoose.Schema({
    Id_Lake: Number,
    forecastTime: Date,
    qvao_forecast: Number
}, { collection: 'forecast_LSTM' });

const ForecastLSTM = mongoose.model('ForecastLSTM', ForecastLSTMSchema);

async function checkData() {
    try {
        console.log(`Connecting to: ${MONGODB_URI}`);
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const count = await ForecastLSTM.countDocuments();
        console.log(`Total forecast records: ${count}`);

        if (count > 0) {
            const sample = await ForecastLSTM.findOne().sort({ generatedAt: -1 });
            console.log('Latest sample:', JSON.stringify(sample, null, 2));

            const distinctLakes = await ForecastLSTM.distinct('Id_Lake');
            console.log('Lakes with data:', distinctLakes);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

checkData();
