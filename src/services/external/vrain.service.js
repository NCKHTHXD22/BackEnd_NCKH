import axios from "axios";

const vrainClient = axios.create({
  baseURL: "https://vrain.vn",
  timeout: 30000,
  withCredentials: true,
  headers: {
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    Referer: "https://vrain.vn/home/29/dashboard",
    Origin: "https://vrain.vn",
    "X-Requested-With": "XMLHttpRequest",

    // 🔴 BẮT BUỘC
    "X-Org-Uid": process.env.VRAIN_ORG_UID,
    "X-Vrain-User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

    Cookie: process.env.VRAIN_COOKIE
  }
});

export async function getRainByDay(from, to) {
  const res = await vrainClient.get(
    "/api/vrain/private/v1/organizations/details",
    {
      params: { from, to }
    }
  );

  return res.data;
}
