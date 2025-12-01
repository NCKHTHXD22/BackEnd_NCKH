import cron from "node-cron";
import axios from "axios";
import { rainStationService } from "../services/rainStation.service.js";

async function fetchRainData() {
    try {
        const url = "https://vrain.vn/data/32.json";  // bạn đã kiểm tra rồi OK

        const { data } = await axios.get(url);

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
