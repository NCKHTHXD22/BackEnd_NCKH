import cron from "node-cron";
import axios from "axios";
import RainHistory from "../core/entities/RainHistory.js";
import RainStation from "../core/entities/RainStation.js";
import { getRainDetailByDay } from "../services/external/vrain.service.js";

const HOUR_REGEX = /^([01]\d|2[0-3]):00$/;

// ======== PHẦN 1: CẬP NHẬT REALTIME TỪ API PUBLIC ========
function toHourlyBucket(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

async function fetchRainStationRealtime() {
  try {
    const url = "https://vrain.vn/data/32.json";

    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://vrain.vn',
        'Referer': 'https://vrain.vn/'
      },
      timeout: 30000
    });

    if (!Array.isArray(data)) {
      console.log("⚠️ [VRAIN REALTIME] Dữ liệu không hợp lệ");
      return;
    }

    const uuidList = [];
    const bucket = toHourlyBucket(new Date());

    for (const item of data) {
      const s = item.station;
      uuidList.push(s.uuid);

      // Cập nhật RainStation realtime
      await RainStation.findOneAndUpdate(
        { uuid: s.uuid },
        {
          $set: {
            uuid: s.uuid,
            name: s.name || "",
            address: s.address || "",
            location: {
              lat: Number(s.lat) || 0,
              lng: Number(s.lng) || 0
            },
            city: {
              id: Number(s.city?.id) || null,
              name: s.city?.name || "",
              type: s.city?.type || ""
            },
            area: {
              id: Number(s.area?.id) || null,
              name: s.area?.name || "",
              type: s.area?.type || ""
            },
            level: item.level || "",
            color: item.color || "",
            sumDepth: Number(item.sumDepth) || 0,
            lastUpdate: new Date()
          }
        },
        { upsert: true, new: true }
      );

      // ✅ Lưu lịch sử mưa theo giờ (đảm bảo RainHistory luôn có dữ liệu từ API public)
      await RainHistory.updateOne(
        { uuid: s.uuid, timestamp: bucket },
        {
          $set: {
            name: s.name || "",
            sumDepth: Number(item.sumDepth) || 0,
            level: item.level || "Không mưa",
            color: item.color || "#535353"
          }
        },
        { upsert: true }
      );
    }

    console.log("✅ [VRAIN REALTIME] Cập nhật", uuidList.length, "trạm + lịch sử");
  } catch (err) {
    console.error("❌ [VRAIN REALTIME] ERROR:", err.message);
  }
}


// ======== PHẦN 2: CẬP NHẬT LỊCH SỬ TỪ API PRIVATE ========
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

async function fetchRainHistory() {
  try {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const currentHour = now.getUTCHours();

    console.log(`🌧️ [VRAIN HISTORY] AUTO UPDATE ${dateStr}`);

    const stations = await getRainDetailByDay(dateStr);
    if (!stations?.length) {
      console.log("⚠️ [VRAIN HISTORY] Không có dữ liệu trạm");
      return;
    }

    for (const st of stations) {
      const intervals = normalizeIntervals(st.intervals);

      for (const [hour, value] of Object.entries(intervals)) {
        if (!HOUR_REGEX.test(hour)) continue;

        const h = Number(hour.slice(0, 2));
        if (h > currentHour) continue;

        const timestamp = new Date(`${dateStr}T${hour}:00.000Z`);

        await RainHistory.updateOne(
          { uuid: st.sid, timestamp },
          {
            $setOnInsert: {
              uuid: st.sid,
              name: st.name,
              sumDepth: value,
              level: value > 0 ? "RAIN" : "Không mưa",
              color: value > 0 ? "#4FC3F7" : "#535353",
              timestamp
            }
          },
          { upsert: true }
        );
      }
    }

    console.log("✅ [VRAIN HISTORY] UPDATE DONE");
  } catch (err) {
    console.error("❌ [VRAIN HISTORY] ERROR:", err.message);
  }
}

// ======== CHẠY KHI KHỞI ĐỘNG ========
fetchRainStationRealtime();
fetchRainHistory();

// ======== CRON JOBS ========
// Cập nhật realtime mỗi giờ
cron.schedule("0 * * * *", fetchRainStationRealtime);

// Cập nhật lịch sử mỗi giờ (sau 5 phút)
cron.schedule("5 * * * *", fetchRainHistory);
