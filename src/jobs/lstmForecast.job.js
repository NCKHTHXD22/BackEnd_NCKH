import cron from "node-cron";
import axios from "axios";
import ForecastLSTM from "../core/entities/ForecastLSTM.js";
import { RESERVOIRS } from "../api/config/reservoirs.js";

const RES_IDS = Object.keys(RESERVOIRS).map(Number);

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000/predict";

async function updateLSTMForecast() {
    const startTime = new Date();
    console.log(`\n🕒 [LSTM] STARTING UPDATE AT ${startTime.toISOString()}`);
    console.log(`   Python API: ${PYTHON_API_URL}`);
    console.log(`   Reservoirs: ${RES_IDS.join(", ")}`);

    let successCount = 0;
    let failCount = 0;

    for (const rid of RES_IDS) {
        try {
            console.log(`\n🔄 [LSTM] Reservoir ${rid} — calling Python API...`);

            const response = await axios.post(PYTHON_API_URL, { rid }, {
                timeout: 120000, // 2 min per reservoir (model load + API calls)
                headers: { "Content-Type": "application/json" }
            });

            const { predictions, modelUsed, referenceTime } = response.data;

            if (!predictions || predictions.length === 0) {
                console.warn(`⚠ [LSTM] Reservoir ${rid}: no predictions returned`);
                failCount++;
                continue;
            }

            // Upsert by (Id_Lake, forecastTime) — matches Mongoose Schema exactly
            const operations = predictions.map(p => ({
                updateOne: {
                    filter: { Id_Lake: rid, forecastTime: new Date(p.targetTime) },
                    update: {
                        $set: {
                            qvao_forecast: p.p50,
                            p10: p.p10,
                            p90: p.p90,
                            generatedAt: new Date()
                        }
                    },
                    upsert: true
                }
            }));

            const result = await ForecastLSTM.bulkWrite(operations, { ordered: false });
            console.log(`✅ [LSTM] Reservoir ${rid}: ${result.upsertedCount} new, ${result.modifiedCount} updated | model=${modelUsed} | refTime=${referenceTime}`);
            successCount++;

        } catch (error) {
            failCount++;
            if (error.code === "ECONNREFUSED") {
                console.error(`❌ [LSTM] Reservoir ${rid}: Python API không khả dụng (${PYTHON_API_URL})`);
            } else if (error.code === "ETIMEDOUT" || error.message.includes("timeout")) {
                console.error(`❌ [LSTM] Reservoir ${rid}: Timeout sau 2 phút`);
            } else {
                console.error(`❌ [LSTM] Reservoir ${rid}: ${error.message}`);
            }
        }
    }

    const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
    console.log(`\n📊 [LSTM] Completed: ${successCount}/${RES_IDS.length} success, ${failCount} failed (${elapsed}s)\n`);
}

// Chạy theo lịch: phút :06 của mỗi giờ
// Đủ thời gian sau xx:00 để dữ liệu hydro giờ đó đã được cập nhật
cron.schedule("6 * * * *", () => {
    updateLSTMForecast();
});

export { updateLSTMForecast };
