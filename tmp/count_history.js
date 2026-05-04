import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

const InflowLakeHistorySchema = new mongoose.Schema({
    Id_Lake: Number
});

const InflowLakeHistory = mongoose.model('InflowLakeHistory', InflowLakeHistorySchema);

async function countDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        const count = await InflowLakeHistory.countDocuments({});
        console.log(`Current record count in MongoDB: ${count}`);
        
        if (count > 0) {
            const sample = await InflowLakeHistory.findOne({ Id_Lake: 1 }).sort({ timestamp: -1 });
            if (sample) console.log(`Latest Sample (Lake 1): ${sample.timestamp.toISOString()} | Q: ${sample.qvao}`);
        }

        mongoose.connection.close();
    } catch (err) {
        console.error("❌ DB Error:", err.message);
    }
}

countDB();
