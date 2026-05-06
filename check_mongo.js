import mongoose from 'mongoose';
const uri = "mongodb+srv://nckhthxd22:thuydienvgtb@cluster0.k7apy.mongodb.net/VTGB_DSS?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Collections:");
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log("- \ (\ docs)");
      if (col.name.toLowerCase().includes('hydro') || col.name.toLowerCase().includes('lake') || col.name.toLowerCase().includes('arima')) {
          const sample = await db.collection(col.name).findOne({});
          console.log("  Sample from \:", JSON.stringify(sample).substring(0, 200));
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}
run().catch(console.dir);
