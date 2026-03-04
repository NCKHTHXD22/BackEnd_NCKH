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
    "X-Org-Uid": process.env.VRAIN_ORG_UID || '1f3402a7-8c40-4517-bf5e-be1f77330056',
    "X-Vrain-User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

    Cookie: process.env.VRAIN_COOKIE || '_account_sid=s%3Ax2KdKSjpoOnFpftBpyGF2gbD4ZqdlZyC.QtGGFu3RqPb3NrrekR8iky4PcDndIHSP2NK5Q4YBTEE ;sid=3094d396-3c92-42e7-8954-32ac8675d14a'
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

export async function getRainDetailByDay(date) {
  return getRainByDay(date, date);
}
