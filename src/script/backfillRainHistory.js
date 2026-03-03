import RainHistory from "../core/entities/RainHistory.js";
import { connectDB } from "../api/config/database.js";
import { getRainDetailByDay } from "../services/external/vrain.service.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const HOUR_REGEX = /^([01]\d|2[0-3]):00$/;

function normalizeIntervals(intervals) {
  const result = {};
  for (let h = 0; h < 24; h++) {
    result[`${String(h).padStart(2, "0")}:00`] = 0;
  }

  if (intervals && typeof intervals === "object") {
    for (const [h, v] of Object.entries(intervals)) {
      if (HOUR_REGEX.test(h)) {
        result[h] = Number(v) || 0;
      }
    }
  }
  return result;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

async function backfill() {
  await connectDB();

  let current = new Date("2026-02-03T00:00:00.000Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  while (current <= today) {
    const dateStr = current.toISOString().slice(0, 10);
    console.log(`📅 BACKFILL ${dateStr}`);

    const stations = await getRainDetailByDay(dateStr);
    if (!stations?.length) {
      current = addDays(current, 1);
      continue;
    }

    const isToday = dateStr === new Date().toISOString().slice(0, 10);
    const currentHour = new Date().getUTCHours();

    const ops = [];

    for (const st of stations) {
      const intervals = normalizeIntervals(st.intervals);

      for (const [hour, value] of Object.entries(intervals)) {
        if (!HOUR_REGEX.test(hour)) continue;

        const h = Number(hour.slice(0, 2));
        if (isToday && h > currentHour) continue;

        const ts = new Date(`${dateStr}T${hour}:00.000Z`);
        if (isNaN(ts.getTime())) continue;

        ops.push({
          updateOne: {
            filter: { uuid: st.sid, timestamp: ts },
            update: {
              $set: {
                uuid: st.sid,
                name: st.name,
                sumDepth: value,
                level: value > 0 ? "RAIN" : "Không mưa",
                color: value > 0 ? "#4FC3F7" : "#535353",
                timestamp: ts
              }
            },
            upsert: true
          }
        });
      }
    }

    if (ops.length) {
      await RainHistory.bulkWrite(ops, { ordered: false });
      console.log(`✅ UPSERT ${ops.length} records`);
    }

    current = addDays(current, 1);
  }

  console.log("✅ BACKFILL DONE (SMART OVERWRITE)");
  await mongoose.disconnect();
}

backfill().catch(err => {
  console.error("❌ BACKFILL ERROR", err);
  process.exit(1);
});
