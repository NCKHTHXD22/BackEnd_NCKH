import InflowLakeHistoryRepo from "../src/infrastructure/repositories/inflowLakeHistory.repo.js";
import mongoose from 'mongoose';
import { RESERVOIRS } from "../src/api/config/reservoirs.js";

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

async function testJobReferenceTime() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ Connected to DB");
        
        const rid = 1; // A Vương
        const latestRecords = await InflowLakeHistoryRepo.findLatest(rid, 1);
        
        if (latestRecords && latestRecords.length > 0) {
            const referenceTimeUTC = latestRecords[0].timestamp.toISOString();
            const referenceTimeLocal = new Date(latestRecords[0].timestamp.getTime() + 7 * 60 * 60 * 1000).toISOString();
            
            console.log(`RESERVOIR ${rid} (${RESERVOIRS[rid].name})`);
            console.log(`  UTC Time in DB: ${referenceTimeUTC}`);
            console.log(`  VN Time (Local): ${referenceTimeLocal}`);
            console.log(`  Target Forecast Start (UTC+1): ${new Date(new Date(referenceTimeUTC).getTime() + 1000 * 60 * 60).toISOString()}`);
        } else {
            console.log("  ⚠️ No history found for rid 1.");
        }
        
        await mongoose.connection.close();
    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

testJobReferenceTime();
