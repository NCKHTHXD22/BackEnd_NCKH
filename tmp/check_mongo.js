import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

const ForecastLSTMSchema = new mongoose.Schema({
    Id_Lake: Number,
    qvao_forecast: Number,
    p10: Number,
    p90: Number,
    forecastTime: Date,
    generatedAt: { type: Date, default: Date.now }
}, { collection: 'forecast_LSTM' });

const ForecastLSTM = mongoose.model('ForecastLSTM', ForecastLSTMSchema);

async function checkData() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        const count = await ForecastLSTM.countDocuments();
        console.log(`Total documents in forecast_LSTM: ${count}`);

        if (count > 0) {
            const latest = await ForecastLSTM.find().sort({ generatedAt: -1 }).limit(10);
            console.log("\nLatest 10 documents:");
            latest.forEach(doc => {
                console.log(`- RID: ${doc.Id_Lake} | ForecastTime: ${doc.forecastTime.toISOString()} | Q_Forecast: ${doc.qvao_forecast} | GeneratedAt: ${doc.generatedAt.toISOString()}`);
            });
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
