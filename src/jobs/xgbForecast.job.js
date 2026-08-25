import cron from "node-cron";
import axios from "axios";
import InflowLakeHistoryRepo from "../infrastructure/repositories/inflowLakeHistory.repo.js";
import ForecastXGB from "../../XGBoots/ForecastXGB.js";
import { RESERVOIRS } from "../api/config/reservoirs.js";

const RES_IDS = Object.keys(RESERVOIRS).map(Number);
// Same Python container as LSTM (PYTHON_API_URL trỏ tới /predict) — endpoint XGBoost
// nằm trên cùng FastAPI app, chỉ khác path /predict-xgb.
const PYTHON_API_BASE = (process.env.PYTHON_API_URL || "http://103.107.182.191:8000/predict").replace(/\/predict$/, "");
const PYTHON_API_URL = `${PYTHON_API_BASE}/predict-xgb`;

async function updateXGBForecast() {
    const startTime = new Date();
    const startTimeVN = new Date(startTime.getTime() + 7 * 60 * 60 * 1000).toISOString();

    console.log(`\n🕒 [XGB] STARTING UPDATE AT ${startTimeVN} (VN Time)`);
    console.log(`   Python API: ${PYTHON_API_URL}`);

    let successCount = 0;
    let failCount = 0;

    for (const rid of RES_IDS) {
        try {
            const resInfo = RESERVOIRS[rid] || { name: `Res ${rid}` };
            console.log(`\n🔄 [XGB] Reservoir ${rid} (${resInfo.name}) — Preparing forecast...`);

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
                timeout: 120000, // XGBoost inference rẻ hơn LSTM nhiều, không cần margin 3 phút
                headers: { "Content-Type": "application/json" }
            });

            const { predictions, modelUsed } = response.data;

            if (!predictions || predictions.length === 0) {
                console.warn(`⚠ [XGB] Reservoir ${rid}: no predictions returned`);
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

            const result = await ForecastXGB.bulkWrite(operations, { ordered: false });
            console.log(`   ✅ Success: ${result.upsertedCount} new, ${result.modifiedCount} updated | model=${modelUsed}`);
            successCount++;

        } catch (error) {
            failCount++;
            if (error.code === "ECONNREFUSED") {
                console.error(`❌ [XGB] Reservoir ${rid}: Python API không khả dụng (${PYTHON_API_URL})`);
            } else if (error.code === "ETIMEDOUT" || error.message.includes("timeout")) {
                console.error(`❌ [XGB] Reservoir ${rid}: Timeout`);
            } else {
                console.error(`❌ [XGB] Reservoir ${rid}: ${error.message}`);
            }
        }
    }

    const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
    console.log(`\n📊 [XGB] Completed: ${successCount}/${RES_IDS.length} success, ${failCount} failed (${elapsed}s)\n`);
}

// Chạy lệch 3 phút so với job LSTM (":06") để không cùng lúc dồn tải Python API
cron.schedule("9 * * * *", () => {
    updateXGBForecast();
});

export { updateXGBForecast };
