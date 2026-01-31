import axios from "axios";

const BASE_URL = "https://vrain.vn/api/vrain/private/v1";
const GROUP_ID = 29; // Đà Nẵng

export async function getRainDetailByDay(date) {
  const res = await axios.get(
    `${BASE_URL}/groups/${GROUP_ID}/stats/details`,
    {
      params: { from: date, to: date },
      headers: {
        Cookie: process.env.VRAIN_COOKIE,
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
        Referer: "https://vrain.vn/home/29/dashboard"
      }
    }
  );

  // 👉 TOÀN BỘ BẢNG CHI TIẾT
  return res.data.stats[0].stations;
}
