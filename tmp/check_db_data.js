import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

const InflowLakeSchema = new mongoose.Schema({
    Id_Lake: Number,
    name: String
});

const InflowLakeHistorySchema = new mongoose.Schema({
    Id_Lake: Number,
    lakeName: String,
    qvao: Number,
    luuluongxa: Number,
    htl: Number,
    timestamp: Date
});

const InflowLake = mongoose.model('InflowLake', InflowLakeSchema);
const InflowLakeHistory = mongoose.model('InflowLakeHistory', InflowLakeHistorySchema);

async function checkDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ Connected to MongoDB Atlas.");

        console.log("\n--- LAKES IN DATABASE ---");
        const lakes = await InflowLake.find().sort({ Id_Lake: 1 });
        lakes.forEach(l => console.log(`ID: ${l.Id_Lake} | Name: ${l.name}`));

        const idsToCheck = [1, 4];
        for (const id of idsToCheck) {
            const count = await InflowLakeHistory.countDocuments({ Id_Lake: id });
            console.log(`\n--- Lake ID ${id}: ${count} historical records ---`);
            if (count > 0) {
                const records = await InflowLakeHistory.find({ Id_Lake: id })
                    .sort({ timestamp: -1 })
                    .limit(3);
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
