import cron from "node-cron";
import axios from "axios";
import { rainStationService } from "../services/rainStation.service.js";

async function fetchRainData() {
    try {
        const url = "https://vrain.vn/data/32.json";  // bạn đã kiểm tra rồi OK

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

        if (!Array.isArray(data)) return;

        const uuidList = [];

        for (const item of data) {
            uuidList.push(item.station.uuid);

            await rainStationService.upsertFromVrain(item);
        }

        // ⭐ XÓA TRẠM KHÔNG CÒN TRÊN WEBSITE
        await rainStationService.deleteManyNotIn(uuidList);

        console.log("✔ Đồng bộ mưa hoàn tất:", new Date().toLocaleString());

    } catch (err) {
        console.error("❌ Lỗi đồng bộ mưa:", err.message);
    }
}

// Chạy mỗi 1 giờ
cron.schedule("0 * * * *", fetchRainData);

// Chạy ngay khi server khởi động
fetchRainData();

export default fetchRainData;
