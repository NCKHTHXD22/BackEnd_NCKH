import cron from "node-cron";
import RainHistory from "../core/entities/RainHistory.js";
import { getRainDetailByDay } from "../services/external/vrain.service.js";

const HOUR_REGEX = /^([01]\d|2[0-3]):00$/;

<<<<<<< HEAD
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Origin': 'https://vrain.vn',
                'Referer': 'https://vrain.vn/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'Connection': 'keep-alive'
            },
            timeout: 30000
        });
=======
function normalizeIntervals(intervals) {
  const result = {};
  for (let h = 0; h < 24; h++) {
    result[`${String(h).padStart(2, "0")}:00`] = 0;
  }
>>>>>>> 8b21e81f820f1f709cc2f24987295714084e5ebc

  if (intervals && typeof intervals === "object") {
    for (const [h, v] of Object.entries(intervals)) {
      if (HOUR_REGEX.test(h)) {
        result[h] = Number(v) || 0;
      }
    }
  }

  return result;
}

async function fetchRainOnce() {
  try {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const currentHour = now.getUTCHours();

    console.log(`🌧️ [VRAIN] AUTO UPDATE ${dateStr}`);

    const stations = await getRainDetailByDay(dateStr);
    if (!stations?.length) return;

    for (const st of stations) {
      const intervals = normalizeIntervals(st.intervals);

      for (const [hour, value] of Object.entries(intervals)) {
        if (!HOUR_REGEX.test(hour)) continue;

        const h = Number(hour.slice(0, 2));
        if (h > currentHour) continue; // ⛔ không ghi giờ tương lai

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

    console.log("✅ [VRAIN] UPDATE DONE");
  } catch (err) {
    console.error("❌ [VRAIN] ERROR:", err.message);
  }
}

// test tay
fetchRainOnce();

// cron mỗi giờ (chạy sau khi giờ kết thúc 5 phút cho an toàn)
cron.schedule("5 * * * *", fetchRainOnce);
