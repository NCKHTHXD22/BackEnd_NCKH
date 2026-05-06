import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

async function listCollections() {
    try {
        await mongoose.connect(MONGODB_URI);
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("COLLECTIONS IN NCKH:");
        collections.forEach(c => console.log(` - ${c.name}`));
        
        mongoose.connection.close();
    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

listCollections();
