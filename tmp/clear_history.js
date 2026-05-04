import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

const InflowLakeHistorySchema = new mongoose.Schema({
    Id_Lake: Number
});

const InflowLakeHistory = mongoose.model('InflowLakeHistory', InflowLakeHistorySchema);

async function clearDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ Connected to MongoDB Atlas.");

        const result = await InflowLakeHistory.deleteMany({});
        console.log(`✅ Deleted ${result.deletedCount} old historical records.`);

        mongoose.connection.close();
    } catch (err) {
        console.error("❌ DB Error:", err.message);
    }
}

clearDB();
