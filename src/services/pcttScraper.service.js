import axios from 'axios';
import InflowLakeHistoryRepo from '../infrastructure/repositories/inflowLakeHistory.repo.js';

/**
 * Mapping các trường từ JSON API của PCTT sang Lake ID của hệ thống
 * API trả về dạng: htl1, qvao1, luuluongnhamay1, qxaquacua1 (số 1 là ID của PCTT)
 * Lake IDs: 1 (A Vương), 2 (Đắk Mi 4), 3 (Sông Bung 4), 4 (Sông Tranh 2)...
 */
const LAKE_FIELD_MAP = {
    1: { htl: 'htl1', qvao: 'qvao1', qmay: 'luuluongnhamay1', qtran: 'qxaquacua1' },
    2: { htl: 'htl2', qvao: 'qvao2', qmay: 'luuluongnhamay2', qtran: 'qxaquacua2' },
    3: { htl: 'htl3', qvao: 'qvao3', qmay: 'luuluongnhamay3', qtran: 'qxaquacua3' },
    4: { htl: 'htl4', qvao: 'qvao4', qmay: 'luuluongnhamay4', qtran: 'qxaquacua4' },
    7: { htl: 'htl7', qvao: 'qvao7', qmay: 'luuluongnhamay7', qtran: 'qxaquacua7' },
    8: { htl: 'htl8', qvao: 'qvao8', qmay: 'luuluongnhamay8', qtran: 'qxaquacua8' },
    9: { htl: 'htl9', qvao: 'qvao9', qmay: 'luuluongnhamay9', qtran: 'qxaquacua9' },
    11: { htl: 'htl11', qvao: 'qvao11', qmay: 'luuluongnhamay11', qtran: 'qxaquacua11' },
    12: { htl: 'htl12', qvao: 'qvao12', qmay: 'luuluongnhamay12', qtran: 'qxaquacua12' },
    13: { htl: 'htl13', qvao: 'qvao13', qmay: 'luuluongnhamay13', qtran: 'qxaquacua13' },
    14: { htl: 'htl14', qvao: 'qvao14', qmay: 'luuluongnhamay14', qtran: 'qxaquacua14' },
    15: { htl: 'htl15', qvao: 'qvao15', qmay: 'luuluongnhamay15', qtran: 'qxaquacua15' },
    16: { htl: 'htl16', qvao: 'qvao16', qmay: 'luuluongnhamay16', qtran: 'qxaquacua16' },
    17: { htl: 'htl17', qvao: 'qvao17', qmay: 'luuluongnhamay17', qtran: 'qxaquacua17' },
    19: { htl: 'htl19', qvao: 'qvao19', qmay: 'luuluongnhamay19', qtran: 'qxaquacua19' },
};

class PcttScraperService {
    constructor() {
        this.API_URL = "https://pctt.danang.gov.vn/DesktopModules/PCTT/api/PCTTApi/baocaothuydiens_thongke";
    }

    /**
     * Fetch dữ liệu từ API JSON trực tiếp của PCTT
     */
    async scrapeAllLakes() {
        const results = new Map();
        try {
            // Lấy dữ liệu 2 ngày gần nhất cho chắc
            const end = new Date();
            const start = new Date(end.getTime() - (48 * 60 * 60 * 1000));
            
            const startStr = start.toISOString().split('T')[0] + "T00:00:00.000Z";
            const endStr = end.toISOString().split('T')[0] + "T23:59:59.000Z";
            
            const allIds = [1, 2, 3, 4, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 19];
            const batchSize = 4;
            const allData = [];

            for (let i = 0; i < allIds.length; i += batchSize) {
                const batch = allIds.slice(i, i + batchSize).join(',');
                const fullUrl = `${this.API_URL}?ngaybatdau=${startStr}&ngayketthuc=${endStr}&lst_thuydien_id=${batch}`;
                
                console.log(`🚀 [PCTT_API] Fetching batch: ${batch}`);
                const response = await axios.get(fullUrl, { timeout: 30000 });
                if (Array.isArray(response.data)) {
                    allData.push(...response.data);
                }
            }

            if (allData.length === 0) {
                console.error("❌ [PCTT_API] No data received from any batch");
                return results;
            }

            console.log(`✅ [PCTT_API] Received ${allData.length} total rows`);
            const data = allData;

            // Duyệt từng hồ trong bản đồ Mapping
            for (const [lakeIdStr, fields] of Object.entries(LAKE_FIELD_MAP)) {
                const lakeId = parseInt(lakeIdStr);
                const lakeData = [];

                for (const row of data) {
                    const htl = row[fields.htl];
                    const qvao = row[fields.qvao];
                    if (htl === null && qvao === null) continue;

                    const q_turbine = row[fields.qmay] || 0;
                    const q_spillway = row[fields.qtran] || 0;
                    const luuluongxa = q_turbine + q_spillway;
                    
                    // Parse timestamp (PCTT trả về dạng ISO nhưng là giờ VN)
                    // Ví dụ: 2026-05-07T19:00:00 -> Coi là GMT+7
                    const timestamp = new Date(row.thoigianxa + "+07:00");

                    lakeData.push({
                        htl: Number(htl),
                        qvao: Number(qvao),
                        q_turbine: Number(q_turbine),
                        q_spillway: Number(q_spillway),
                        luuluongxa: Number(luuluongxa),
                        timestamp
                    });
                }

                if (lakeData.length > 0) {
                    results.set(lakeId, lakeData);
                    console.log(`  ✔ Lake ${lakeId}: found ${lakeData.length} records`);
                }
            }
        } catch (err) {
            console.error('❌ [PCTT_API] Critical Error:', err.message);
        }

        return results;
    }
}

export default new PcttScraperService();
