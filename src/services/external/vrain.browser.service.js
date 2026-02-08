// services/external/vrain.browser.service.js
import puppeteer from "puppeteer";

const BASE_URL = "https://vrain.vn";

let browser;
let page;

export async function initVrainBrowser() {
  if (browser && page) return;

  browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  page = await browser.newPage();

  // 1️⃣ Set cookie đăng nhập (QUAN TRỌNG NHẤT)
  const cookies = [
    {
      name: "sid",
      value: process.env.VRAIN_COOKIE.match(/sid=([^;]+)/)?.[1],
      domain: "vrain.vn",
      path: "/"
    }
  ];

  await page.setCookie(...cookies);

  // 2️⃣ Vào dashboard (đã login)
  await page.goto(`${BASE_URL}/home/29/dashboard`, {
    waitUntil: "networkidle2"
  });

  console.log("✅ [VRAIN] Browser initialized with cookie");
}

export async function fetchVrainIntervals(stationSid, date) {
  if (!page) throw new Error("Vrain browser not initialized");

  return page.evaluate(
    async (sid, date) => {
      const url =
        `https://vrain.vn/api/vrain/private/v1/stations/${sid}/intervals` +
        `?from=${date}T00:00:00&to=${date}T23:59:59`;

      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        }
      });

      // 🔎 DEBUG AN TOÀN
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { __html: text.slice(0, 300) };
      }
    },
    stationSid,
    date
  );
}
