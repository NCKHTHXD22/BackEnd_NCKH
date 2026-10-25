import axios from "axios";
import { ENV } from "../../api/config/env.js";

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
    "X-Org-Uid": ENV.VRAIN_ORG_UID,
    "X-Vrain-User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

    // Cookie phiên đăng nhập vrain.vn (tài khoản có quyền với tổ chức VRAIN_ORG_UID) – đặt trong .env, hết hạn thì
    // đăng nhập lại trên vrain.vn và chép cookie mới; trước đây ghi cứng ở đây
    Cookie: ENV.VRAIN_COOKIE ?? ''
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
