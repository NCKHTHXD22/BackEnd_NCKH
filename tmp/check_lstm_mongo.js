import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

async function checkLstmData() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        
        // Find the latest record in forecast_LSTM
        const latest = await db.collection('forecast_LSTM').findOne({}, { sort: { createdAt: -1 } });
        
        console.log("LATEST LSTM RECORD IN MONGO:");
        console.log(JSON.stringify(latest, null, 2));
        
        mongoose.connection.close();
    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

checkLstmData();
