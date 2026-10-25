import cron from 'node-cron';
import { syncPcttHydro } from '../services/pcttHydro.service.js';

/**
 * ⏱️ Mỗi giờ phút 20: lấy ngưỡng báo động + mực nước 2 ngày gần nhất các trạm thủy văn từ pctt.danang.gov.vn
 * (Hội Khách, Ái Nghĩa, Nông Sơn, Câu Lâu… – trạm quyết định vận hành liên hồ theo QĐ 1865)
 */
cron.schedule('20 * * * *', async () => {
    try {
        const r = await syncPcttHydro();
        console.log(`✅ [CRON] Thủy văn PCTT: ${r.created + r.updated} trạm, ${r.observations} số liệu (mới ${r.upserted})` +
            (r.unparsed_rows ? `, ${r.unparsed_rows} dòng không đọc được` : ''));
    } catch (err) {
        console.error('❌ [CRON] Thủy văn PCTT:', err.message);
    }
});
