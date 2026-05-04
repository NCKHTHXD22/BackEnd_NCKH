import mongoose from "mongoose";
import { updateLSTMForecast } from "./src/jobs/lstmForecast.job.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected! Forcing LSTM Forecast Update...");
        
        await updateLSTMForecast();
        
        console.log("Done!");
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
