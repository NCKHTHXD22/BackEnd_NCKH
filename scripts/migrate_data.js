import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const SOURCE_URI = process.env.MIGRATE_SOURCE_URI;
const TARGET_URI = process.env.MIGRATE_TARGET_URI;

if (!SOURCE_URI || !TARGET_URI) {
    console.error("Missing MIGRATE_SOURCE_URI or MIGRATE_TARGET_URI in environment (.env). Aborting.");
    process.exit(1);
}

const collectionsToMigrate = ['users', 'posts', 'alerts', 'notifications', 'helps', 'admins'];

async function migrate() {
    const sourceClient = new MongoClient(SOURCE_URI);
    const targetClient = new MongoClient(TARGET_URI);

    try {
        await sourceClient.connect();
        await targetClient.connect();

        const sourceDb = sourceClient.db('fw_db');
        const targetDb = targetClient.db('NCKH');

        console.log("Connected to both databases.");

        for (const colName of collectionsToMigrate) {
            console.log(`Migrating collection: ${colName}...`);
            const sourceCol = sourceDb.collection(colName);
            const data = await sourceCol.find({}).toArray();

            if (data.length > 0) {
                const targetCol = targetDb.collection(colName);

                // Clear target collection first to avoid duplicates if re-run
                await targetCol.deleteMany({});

                await targetCol.insertMany(data);
                console.log(`  ✅ Successfully migrated ${data.length} documents for ${colName}`);
            } else {
                console.log(`  ℹ️ No data found in source collection ${colName}`);
            }
        }

    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        await sourceClient.close();
        await targetClient.close();
        console.log("Database connections closed.");
    }
}

migrate();
