import RainHistory from "../core/entities/RainHistory.js";
import { connectDB } from "../api/config/database.js";
import { getRainDetailByDay } from "../services/external/vrain.service.js";
import dotenv from "dotenv";
dotenv.config();

/**
 * Chuẩn hóa 24h
 */
function normalizeIntervals(intervals) {
  const result = {};
  for (let h = 0; h < 24; h++) {
    result[`${String(h).padStart(2, "0")}:00`] = 0;
  }
  if (intervals && typeof intervals === "object") {
    for (const [h, v] of Object.entries(intervals)) {
      result[h] = Number(v);
    }
  }
  return result;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/**
 * 🔥 Lấy các giờ đã tồn tại trong DB của 1 trạm – 1 ngày
 */
async function getExistingHours(uuid, dateStr) {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(`${dateStr}T23:59:59.999Z`);

  const docs = await RainHistory.find(
    { uuid, timestamp: { $gte: start, $lte: end } },
    { timestamp: 1 }
  );

  return new Set(
    docs.map(d => {
      const h = d.timestamp.getUTCHours();
      return `${String(h).padStart(2, "0")}:00`;
    })
  );
}

async function backfill() {
  await connectDB();

  let current = new Date("2025-12-13T00:00:00.000Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  while (current <= today) {
    const dateStr = current.toISOString().slice(0, 10);
    console.log(`📅 BACKFILL ${dateStr}`);

    const stations = await getRainDetailByDay(dateStr);
    if (!stations || !stations.length) {
      current = addDays(current, 1);
      continue;
    }

    const isToday =
      dateStr === new Date().toISOString().slice(0, 10);
    const currentHour = new Date().getUTCHours();

    for (const st of stations) {
      const intervals = normalizeIntervals(st.intervals);

      // 🔍 Lấy giờ đã tồn tại
      const existingHours = await getExistingHours(st.sid, dateStr);

      for (const [hour, value] of Object.entries(intervals)) {
        const h = Number(hour.slice(0, 2));

        // ⛔ Ngày hôm nay → không vượt quá giờ hiện tại
        if (isToday && h > currentHour) continue;

        // ⛔ Đã tồn tại → bỏ qua
        if (existingHours.has(hour)) continue;

        const ts = new Date(`${dateStr}T${hour}:00:00.000Z`);

        await RainHistory.create({
          uuid: st.sid,
          name: st.name,
          sumDepth: value,
          level: value > 0 ? "RAIN" : "Không mưa",
          color: value > 0 ? "#4FC3F7" : "#535353",
          timestamp: ts
        });
      }
    }

    current = addDays(current, 1);
  }

  console.log("✅ SMART BACKFILL DONE");
  process.exit(0);
}

backfill();
