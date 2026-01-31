import cron from "node-cron";
import RainHistory from "../core/entities/RainHistory.js";
import { getRainDetailByDay } from "../services/external/vrain.service.js";

function normalizeIntervals(intervals) {
  const result = {};
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    result[`${hh}:00`] = 0;
  }

  if (intervals && typeof intervals === "object") {
    for (const [hour, value] of Object.entries(intervals)) {
      result[hour] = Number(value);
    }
  }

  return result;
}

async function fetchRainOnce() {
  try {
    console.log(" [VRAIN] START FETCH");

    const date = new Date().toISOString().slice(0, 10);
    console.log(" DATE:", date);

    const stations = await getRainDetailByDay(date);
    console.log(" STATIONS COUNT:", stations.length);

    for (const st of stations) {
      const intervals = normalizeIntervals(st.intervals);

      console.log(`🏷️ STATION: ${st.name}`);

      for (const [hour, value] of Object.entries(intervals)) {
        const timestamp = new Date(`${date}T${hour}:00`);

        await RainHistory.updateOne(
          { uuid: st.sid, timestamp },
          {
            $setOnInsert: {
              uuid: st.sid,
              name: st.name,
              sumDepth: value,
              level: "RAIN",
              color: "#4FC3F7",
              timestamp
            }
          },
          { upsert: true }
        );
      }
    }

    console.log("✅ [VRAIN] FETCH DONE");
  } catch (err) {
    console.error("❌ [VRAIN] ERROR:", err.message);
  }
}

// chạy test
fetchRainOnce();

// cron mỗi giờ
cron.schedule("0 * * * *", fetchRainOnce);
