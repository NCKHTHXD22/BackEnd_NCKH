import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        
        // Find the collection that stores the fallback hydro data
        const collections = await db.listCollections().toArray();
        let targetCol = '';
        for (const c of collections) {
            if (c.name.toLowerCase().includes('inflow') && c.name.toLowerCase().includes('histor')) {
                targetCol = c.name;
                break;
            }
        }
        
        if (!targetCol) {
            targetCol = 'rainlake_qlakes'; // another guess
        }
        
        console.log(`Using collection: ${targetCol}`);
        
        const col = db.collection(targetCol);
        
        const earliest = await col.find({}).sort({ timestamp: 1 }).limit(1).toArray();
        const latest = await col.find({}).sort({ timestamp: -1 }).limit(1).toArray();
        
        console.log(`Earliest record: ${earliest.length > 0 ? earliest[0].timestamp : 'None'}`);
        console.log(`Latest record: ${latest.length > 0 ? latest[0].timestamp : 'None'}`);
        
        const pipeline = [
            {
                $group: {
                    _id: { $year: "$timestamp" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ];
        
        const stats = await col.aggregate(pipeline).toArray();
        console.log(`Records by year:`);
        stats.forEach(s => console.log(`- Year ${s._id}: ${s.count} records`));
        
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
run();
