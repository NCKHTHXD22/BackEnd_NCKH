import "dotenv/config";
import mongoose from "mongoose";
import { getRainByDay } from "../services/external/vrain.service.js";
import RainHistory from "../core/entities/RainHistory.js";


await mongoose.connect(process.env.MONGODB_URI);
console.log("MongoDB connected successfully");

async function backfill(date) {
  const data = await getRainByDay(date, date);

  for (const block of data.stats) {
    if (block.timePoint === "Tổng") continue;

    // "20:00 04/02"
    const [time, dmy] = block.timePoint.split(" ");
    const [dd, mm] = dmy.split("/");
    const [hh] = time.split(":");

    const timestamp = new Date(
      `${date}T${hh.padStart(2, "0")}:00:00+07:00`
    );

    for (const st of block.stations) {
      if (st.depth === "-" || st.depth == null) continue;

      await RainHistory.updateOne(
        {
          stationId: st.id,
          time: timestamp
        },
        {
          $set: {
            stationId: st.id,
            stationName: st.name,
            rain: Number(st.depth),
            time: timestamp,
            source: "vrain-ui"
          }
        },
        { upsert: true }
      );
    }
  }

  console.log("Backfill done:", date);
}

await backfill("2026-02-01");
process.exit(0);
