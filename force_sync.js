import mongoose from "mongoose";
import inflowLakeHistoryService from "./src/services/inflowLakeHistory.service.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected! Forcing InflowLakeHistory Sync...");
        
        await inflowLakeHistoryService.syncRecentData();
        
        console.log("Done!");
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
