import { connectDB } from '../src/api/config/database.js';
import InflowLakeHistoryRepo from '../src/infrastructure/repositories/inflowLakeHistory.repo.js';
import InflowLakeRepo from '../src/infrastructure/repositories/inflowLake.repo.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkData() {
    await connectDB();
    console.log('--- LATEST DATA CHECK ---');
    
    const lakes = await InflowLakeRepo.findAll();
    for (const lake of lakes) {
        const latest = await InflowLakeHistoryRepo.findLatest(lake.Id_Lake, 1);
        if (latest && latest.length > 0) {
            console.log(`Lake ${lake.Id_Lake} (${lake.name}): Latest timestamp = ${latest[0].timestamp.toISOString()}`);
        } else {
            console.log(`Lake ${lake.Id_Lake} (${lake.name}): NO DATA FOUND`);
        }
    }
    
    await mongoose.connection.close();
}

checkData().catch(err => {
    console.error(err);
    process.exit(1);
});
