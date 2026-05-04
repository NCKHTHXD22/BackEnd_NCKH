import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

async function checkCounts() {
    try {
        await mongoose.connect(MONGODB_URI);
        
        const count1 = await mongoose.connection.db.collection('inflowlakehistories').countDocuments({});
        const count2 = await mongoose.connection.db.collection('inflow_lake_histories').countDocuments({});
        
        console.log(`- inflowlakehistories: ${count1}`);
        console.log(`- inflow_lake_histories: ${count2}`);
        
        mongoose.connection.close();
    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

checkCounts();
