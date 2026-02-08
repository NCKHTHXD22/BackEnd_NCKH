import mongoose from "mongoose";
import dotenv from "dotenv";
import RainHistory from "../core/entities/RainHistory.js";
import { connectDB } from "../api/config/database.js";

dotenv.config();

async function deleteByDate(date) { 
  await connectDB();

  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);

  const result = await RainHistory.deleteMany({
    timestamp: { $gte: start, $lte: end }
  });

  console.log(`🗑️ DELETED ${result.deletedCount} RECORDS ON ${date}`);
  process.exit(0);
}

// 🔥 ĐỔI NGÀY TẠI ĐÂY
deleteByDate("2026-02-01");
// deleteByDate("2026-02-01");
