import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

const InflowLakeHistorySchema = new mongoose.Schema({
    Id_Lake: Number,
    lakeName: String,
    qvao: Number,
    luuluongxa: Number,
    htl: Number,
    timestamp: Date
});

const InflowLakeHistory = mongoose.model('InflowLakeHistory', InflowLakeHistorySchema);

async function checkDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ Connected to MongoDB Atlas.");

        const idsToCheck = [1, 4];
        for (const id of idsToCheck) {
            console.log(`\n--- March 30th Data for Lake ID: ${id} ---`);
            // Look for data between March 20 and March 31
            const records = await InflowLakeHistory.find({ 
                Id_Lake: id,
                timestamp: { 
                    $gte: new Date("2026-03-20T00:00:00Z"),
                    $lte: new Date("2026-03-31T23:59:59Z")
                }
            }).sort({ timestamp: -1 }).limit(10);
            
            if (records.length === 0) {
                console.log("No records found for March 20-31 2026.");
            } else {
                records.forEach(r => {
                    console.log(`[${r.timestamp.toISOString()}] Q Đến: ${r.qvao} | Xả: ${r.luuluongxa} | MN: ${r.htl}`);
                });
            }
        }

        mongoose.connection.close();
    } catch (err) {
        console.error("❌ DB Error:", err.message);
    }
}

checkDB();
