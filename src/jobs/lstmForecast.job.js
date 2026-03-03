import cron from "node-cron";
import axios from "axios";
import Forecast from "../core/entities/Forecast.js";
import { RESERVOIRS } from "../api/config/reservoirs.js";

const RES_IDS = Object.keys(RESERVOIRS).map(Number);

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000/predict";

async function updateLSTMForecast() {
    console.log(`🕒 [LSTM] STARTING HOURLY UPDATE AT ${new Date().toISOString()}`);

    for (const rid of RES_IDS) {
        try {
            console.log(`🔄 Fetching prediction for Reservoir ${rid}...`);

            const response = await axios.post(PYTHON_API_URL, { rid });
            const { predictions } = response.data;

            if (!predictions || predictions.length === 0) continue;

            // Logic: 
            // 1. Current hour (T0) - if exists, we might keep it or update actuals.
            // 2. Future hours (T1 to T12) - update with new predictions.

            const operations = predictions.map(p => ({
                updateOne: {
                    filter: { reservoirId: rid, targetTime: new Date(p.targetTime) },
                    update: {
                        $set: {
                            value: p.p50,
                            p10: p.p10,
                            p90: p.p90,
                            createdAt: new Date()
                        }
                    },
                    upsert: true
                }
            }));

            await Forecast.bulkWrite(operations);
            console.log(`✅ Updated ${predictions.length} forecast steps for Reservoir ${rid}`);

        } catch (error) {
            console.error(`❌ Error updating LSTM for Reservoir ${rid}:`, error.message);
        }
    }
}

// Chạy lần đầu khi start server
// updateLSTMForecast();

// Cron chạy vào đầu mỗi giờ
cron.schedule("0 * * * *", () => {
    updateLSTMForecast();
});

export { updateLSTMForecast };
