import cron from "node-cron";
import axios from "axios";
import InflowLakeHistoryRepo from "../infrastructure/repositories/inflowLakeHistory.repo.js";
import ForecastLSTM from "../core/entities/ForecastLSTM.js";
import { RESERVOIRS } from "../api/config/reservoirs.js";

const RES_IDS = Object.keys(RESERVOIRS).map(Number);
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://103.107.182.191:8000/predict";

async function updateLSTMForecast() {
    const startTime = new Date();
    // Log in VN Time for clarity
    const startTimeVN = new Date(startTime.getTime() + 7 * 60 * 60 * 1000).toISOString();
    
    console.log(`\n🕒 [LSTM] STARTING UPDATE AT ${startTimeVN} (VN Time)`);
    console.log(`   Python API: ${PYTHON_API_URL}`);

    let successCount = 0;
    let failCount = 0;

    for (const rid of RES_IDS) {
        try {
            const resInfo = RESERVOIRS[rid] || { name: `Res ${rid}` };
            console.log(`\n🔄 [LSTM] Reservoir ${rid} (${resInfo.name}) — Preparing forecast...`);

            // Find the latest actual record in DB to use as Reference Time
            const latestRecords = await InflowLakeHistoryRepo.findLatest(rid, 1);
            let referenceTime = null;
            
            if (latestRecords && latestRecords.length > 0) {
                referenceTime = latestRecords[0].timestamp.toISOString();
                console.log(`   [Target] Reference Time (Latest DB): ${new Date(new Date(referenceTime).getTime() + 7 * 60 * 60 * 1000).toISOString()} (VN)`);
            } else {
                console.log(`   [Target] No history found, using default (current hour)`);
            }

            const response = await axios.post(PYTHON_API_URL, { 
                rid,
                reference_time: referenceTime 
            }, {
                timeout: 180000, // 3 min per reservoir (safety margin)
                headers: { "Content-Type": "application/json" }
            });

            const { predictions, modelUsed, referenceTime: pythonRefTime } = response.data;

            if (!predictions || predictions.length === 0) {
                console.warn(`⚠ [LSTM] Reservoir ${rid}: no predictions returned`);
                failCount++;
                continue;
            }

            // Upsert by (Id_Lake, forecastTime)
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
            console.log(`   ✅ Success: ${result.upsertedCount} new, ${result.modifiedCount} updated | model=${modelUsed}`);
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
