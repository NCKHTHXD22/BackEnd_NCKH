import RainHistory from "../core/entities/RainHistory.js";
import { connectDB } from "../api/config/database.js";
import { getRainDetailByDay } from "../services/external/vrain.service.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
async function getLastBackfillDate() {
  const last = await RainHistory
    .findOne({})
    .sort({ timestamp: -1 })
    .select("timestamp");

  if (!last) return new Date("2025-12-01"); // chưa có gì trong DB

  const d = new Date(last.timestamp);
  d.setDate(d.getDate() + 1); // sang ngày tiếp theo
  return d;
}

async function backfill() {
  await connectDB();

  let current = await getLastBackfillDate();
  const today = new Date();

  console.log("▶️ RESUME FROM:", current.toISOString().slice(0, 10));

  while (current <= today) {
    const dateStr = current.toISOString().slice(0, 10);
    console.log(`📅 BACKFILL DATE: ${dateStr}`);

    const stations = await getRainDetailByDay(dateStr);
    console.log(`📡 Stations: ${stations.length}`);

    for (const st of stations) {
      const intervals = normalizeIntervals(st.intervals);

      for (const [hour, value] of Object.entries(intervals)) {
        const timestamp = new Date(`${dateStr}T${hour}:00`);

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

    current = addDays(current, 1);
  }

  console.log("✅ BACKFILL COMPLETED");
  process.exit(0);
}

backfill();
