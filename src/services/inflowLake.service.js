import inflowLakeRepo from '../infrastructure/repositories/inflowLake.repo.js';
import rainLakeHistoryRepo from '../infrastructure/repositories/rainLakeHistory.repo.js';
import pcttScraperService from './pcttScraper.service.js';

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
     * Nếu API chính (apiv2.danang.gov.vn) bị sập → tự động dùng fallback scraper từ pctt.danang.gov.vn
     */
    async syncAllLakeHydroData() {
        const lakes = await inflowLakeRepo.findAll();
        if (!lakes.length) return;

        // ── Thử API chính ──────────────────────────────────────────────────────────
        const apiSuccess = await this._syncFromGovApi(lakes);

        if (!apiSuccess) {
            // ── Fallback: cào dữ liệu từ HTML pctt.danang.gov.vn ──────────────────
            console.warn('⚠️  [HYDRO] API chính thất bại → chuyển sang FALLBACK SCRAPER (pctt.danang.gov.vn)...');
            await this._syncFromScraper(lakes);
        }

        console.log('✅ InflowLake đã cập nhật thông số thủy văn (hydro data)');
    }

    /**
     * Lấy dữ liệu từ API chính của Đà Nẵng (apiv2.danang.gov.vn)
     * @returns {boolean} true nếu ít nhất 1 hồ được cập nhật thành công
     */
    async _syncFromGovApi(lakes) {
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
            console.error("❌ [GOV_API] Lấy token thất bại:", err.message);
            return false; // Báo hiệu thất bại để dùng fallback
        }

        const end = new Date();
        end.setMinutes(0, 0, 0);
        const start = new Date(end.getTime() - (6 * 60 * 60 * 1000)); // last 6 hours

        let successCount = 0;
        for (const lake of lakes) {
            try {
                const formatDateISO = (date) => date.toISOString().split('.')[0] + ".000Z";

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
                if (data && data.data) data = data.data;

                if (Array.isArray(data) && data.length > 0) {
                    data.sort((a, b) => new Date(b.thoigianxa || b.thoigian || 0) - new Date(a.thoigianxa || a.thoigian || 0));
                    const latest = data[0];
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
                    console.log(`✔ [GOV_API] Hồ ${lake.Id_Lake} (${lake.name}) ← Inflow: ${latest.qvao || 0} | HTL: ${latest.htl || 0}`);
                    successCount++;
                } else {
                    console.log(`ℹ [GOV_API] Hồ ${lake.Id_Lake} (${lake.name}) không có dữ liệu mới.`);
                }
            } catch (err) {
                // Lỗi 503 hoặc network → log và tiếp tục, không return false ngay
                console.error(`❌ [GOV_API] Hồ ${lake.Id_Lake}: ${err.message}`);
            }
        }

        // Trả về true nếu ít nhất 1 hồ có dữ liệu, false nếu toàn bộ thất bại
        return successCount > 0;
    }

    /**
     * Fallback: lấy dữ liệu bằng cách cào HTML từ pctt.danang.gov.vn
     * Chỉ cập nhật các hồ được map trong LAKE_MAPPING, giữ nguyên dữ liệu cũ nếu không scrape được
     */
    async _syncFromScraper(lakes) {
        try {
            const scraperData = await pcttScraperService.scrapeAllLakes();

            if (scraperData.size === 0) {
                console.error('❌ [SCRAPER] Không lấy được dữ liệu từ pctt.danang.gov.vn');
                return;
            }

            for (const lake of lakes) {
                const lakeRecords = scraperData.get(lake.Id_Lake);
                if (!lakeRecords || lakeRecords.length === 0) {
                    console.log(`ℹ [SCRAPER] Hồ ${lake.Id_Lake} (${lake.name}): không có dữ liệu mới, giữ dữ liệu cũ.`);
                    continue;
                }

                // Lấy bản ghi mới nhất (thường là hàng đầu tiên trong bảng)
                const data = lakeRecords[0];

                await inflowLakeRepo.updateHydroData(
                    lake.Id_Lake,
                    data.qvao,
                    data.luuluongxa,
                    data.htl,
                    data.timestamp,
                    data.q_turbine,
                    data.q_spillway,
                );
                console.log(`✔ [SCRAPER] Hồ ${lake.Id_Lake} (${lake.name}) ← HTL: ${data.htl}m | Qvào: ${data.qvao} | Qxả: ${data.luuluongxa}`);
            }
        } catch (err) {
            console.error('❌ [SCRAPER] Lỗi fallback scraper:', err.message);
        }
    }
}

export default new InflowLakeService();
