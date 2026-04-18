import inflowLakeRepo from '../infrastructure/repositories/inflowLake.repo.js';
import rainLakeHistoryRepo from '../infrastructure/repositories/rainLakeHistory.repo.js';

class InflowLakeService {
    async getAll() {
        return inflowLakeRepo.findAll();
    }

    async getByLakeId(Id_Lake) {
        return inflowLakeRepo.findByLakeId(Id_Lake);
    }

    /**
     * 🔥 Update InflowLake từ RainLakeHistory mới nhất
     */
    async updateAllLakeFromHistory() {
        const lakes = await inflowLakeRepo.findAll();

        if (!lakes.length) {
            console.warn('⚠️ Không có InflowLake');
            return;
        }

        for (const lake of lakes) {
            const latest = await rainLakeHistoryRepo.getLatestByLake(lake.Id_Lake);

            if (!latest) {
                console.warn(`⚠️ Hồ ${lake.Id_Lake} chưa có RainLakeHistory`);
                continue;
            }

            await inflowLakeRepo.updateFromHistory(
                lake.Id_Lake,
                latest.sumDepth,
                latest.level,
                latest.timestamp
            );

            console.log(
                `✔ Hồ ${lake.Id_Lake} ← ${latest.sumDepth}mm | ${latest.level}`
            );
        }

        console.log('✅ InflowLake đã cập nhật level + sumDepth');
    }

    /**
     * 🔥 Update InflowLake hydro data (inflow, outflow, waterlevel) from Danang API
     */
    async syncAllLakeHydroData() {
        const lakes = await inflowLakeRepo.findAll();
        if (!lakes.length) return;

        const axios = (await import('axios')).default;
        const PYTHON_API_URL = process.env.PYTHON_API_URL ? process.env.PYTHON_API_URL.replace("/predict", "") : "http://localhost:8000";
        const PROXY_URL = `${PYTHON_API_URL}/proxy/danang`;

        // Get Token via VPS proxy (Render is foreign IP, blocked by danang.gov.vn)
        const auth = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');
        let token;
        try {
            const res = await axios.post(PROXY_URL, {
                method: "POST",
                url: "https://apiv2.danang.gov.vn/oauth2/token",
                data: { grant_type: "client_credentials" },
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }, { timeout: 30000 });
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            token = data.access_token;
        } catch (err) {
            console.error("❌ Token fetch error via Proxy:", err.message);
            return;
        }

        const end = new Date();
        end.setMinutes(0, 0, 0); // floor to hour
        const start = new Date(end.getTime() - (180 * 24 * 60 * 60 * 1000)); // Lùi lại 180 ngày tương tự logic Python data_fetcher.py

        for (const lake of lakes) {
            try {
                const formatDateISO = (date) => {
                    return date.toISOString().split('.')[0] + ".000Z";
                };

                const hydroRes = await axios.post(PROXY_URL, {
                    method: "GET",
                    url: "https://apiv2.danang.gov.vn/apiPCTT/1.0/baocaothuydiens_bieudo",
                    params: {
                        thuydien_id: lake.Id_Lake,
                        ngaybatdau: formatDateISO(start),
                        ngayketthuc: formatDateISO(end)
                    },
                    headers: { 'Authorization': `Bearer ${token}` }
                }, { timeout: 60000 });

                let data = typeof hydroRes.data === 'string' ? JSON.parse(hydroRes.data) : hydroRes.data;
                if (data && data.data) data = data.data; // Hỗ trợ cả trường hợp trả về { data: [...] } hoặc [...]

                if (Array.isArray(data) && data.length > 0) {
                    // Sort by thoigianxa descending to get the truly latest record
                    data.sort((a, b) => new Date(b.thoigianxa || b.thoigian || 0) - new Date(a.thoigianxa || a.thoigian || 0));
                    const latest = data[0];
                    // Parse VN time correctly (no timezone suffix → append +07:00)
                    const rawTime = latest.thoigianxa || latest.thoigian || null;
                    const hasTimezone = rawTime && /Z$|[+-]\d{2}:\d{2}$/.test(rawTime);
                    const recordTime = rawTime ? (hasTimezone ? new Date(rawTime) : new Date(rawTime + '+07:00')) : new Date();
                    await inflowLakeRepo.updateHydroData(
                        lake.Id_Lake,
                        latest.qvao || 0,
                        latest.luuluongxa || 0,
                        latest.htl || 0,
                        recordTime,
                        latest.luuluongchayMay ?? latest.q_turbine ?? latest.q_may ?? 0,
                        latest.luuluongquatran ?? latest.q_spillway ?? latest.q_tran ?? 0,
                    );
                    const logMsg = `✔ Hồ ${lake.Id_Lake} (${lake.name}) ← Inflow: ${latest.qvao || 0} | Outflow: ${latest.luuluongxa || 0} | Level: ${latest.htl || 0}`;
                    console.log(logMsg);
                } else {
                    console.log(`ℹ Hồ ${lake.Id_Lake} (${lake.name}) không có dữ liệu mới từ API.`);
                    // Giữ nguyên dữ liệu cũ, không set về 0 nếu không có data mới
                }
            } catch (err) {
                console.error(`❌ Lỗi đồng bộ data hồ ${lake.Id_Lake}:`, err.message);
            }
        }
        console.log('✅ InflowLake đã cập nhật thông số thủy văn (hydro data)');
    }
}

export default new InflowLakeService();
