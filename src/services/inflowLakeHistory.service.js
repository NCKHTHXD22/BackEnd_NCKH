import axios from 'axios';
import InflowLakeHistoryRepo from '../infrastructure/repositories/inflowLakeHistory.repo.js';
import InflowLakeRepo from '../infrastructure/repositories/inflowLake.repo.js';

class InflowLakeHistoryService {
    constructor() {
        this.API_URL = "https://apiv2.danang.gov.vn/apiPCTT/1.0/baocaothuydiens_bieudo";
        this.AUTH = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');
    }

    async getToken() {
        const PYTHON_API_URL = process.env.PYTHON_API_URL ? process.env.PYTHON_API_URL.replace("/predict", "") : "http://localhost:8000";
        const PROXY_URL = `${PYTHON_API_URL}/proxy/danang`;

        try {
            console.log(`🔄 [PROXY] Fetching token via VPS: ${PROXY_URL}`);
            const res = await axios.post(PROXY_URL, {
                method: "POST",
                url: "https://apiv2.danang.gov.vn/oauth2/token",
                data: { grant_type: "client_credentials" },
                headers: {
                    'Authorization': `Basic ${this.AUTH}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }, { timeout: 30000 });
            
            // Nếu kết quả trả về là string (do proxy), parse nó
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            return data.access_token;
        } catch (err) {
            console.error("❌ Token fetch error via Proxy:", err.message);
            // Fallback: Nếu proxy lỗi, thử gọi trực tiếp (có thể fail nếu IP bị chặn)
            throw new Error("Cannot get token from Danang API via Proxy");
        }
    }

    // Parses any date to the exact top of the hour `xx:00:00.000`
    // API returns VN time (UTC+7) without timezone suffix (e.g. "2026-03-31T10:00:00")
    // Must append +07:00 so JS parses it as VN time, not UTC
    _roundToHour(dateStr) {
        // If string has no timezone info (no Z, no +, no -offset), treat as VN time (UTC+7)
        const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(dateStr);
        const d = hasTimezone ? new Date(dateStr) : new Date(dateStr + '+07:00');
        d.setMinutes(0, 0, 0);
        return d;
    }

    _formatDateISO(date) {
        return date.toISOString().split('.')[0] + ".000Z";
    }

    /**
     * Fetch data from Danang API for a specific lake and time range
     */
    async fetchAndProcessLakeData(lake, token, start, end) {
        const PYTHON_API_URL = process.env.PYTHON_API_URL ? process.env.PYTHON_API_URL.replace("/predict", "") : "http://localhost:8000";
        const PROXY_URL = `${PYTHON_API_URL}/proxy/danang`;

        try {
            const res = await axios.post(PROXY_URL, {
                method: "GET",
                url: this.API_URL,
                params: {
                    thuydien_id: lake.Id_Lake,
                    ngaybatdau: this._formatDateISO(start),
                    ngayketthuc: this._formatDateISO(end)
                },
                headers: { 'Authorization': `Bearer ${token}` }
            }, { timeout: 60000 });

            // Parse response (proxy returns string or object)
            let data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            if (data && data.data) data = data.data;

            if (!Array.isArray(data) || data.length === 0) {
                return 0; // No data fetched
            }

            const docsToUpsert = [];
            const seenHours = new Set();

            // Ensure we push data incrementally.
            for (const record of data) {
                // Use thoigianxa (YYYY-MM-DDTHH:mm:ss) which is more reliable than thoigian (DD/MM/YYYY HH:mm)
                const dateToParse = record.thoigianxa || record.thoigian;
                if (!dateToParse) continue;

                const roundedTime = this._roundToHour(dateToParse);
                const timeKey = roundedTime.toISOString();

                // find if we already pushed this hour, update it
                const existingIndex = docsToUpsert.findIndex(d => d.timestamp.toISOString() === timeKey);
                const doc = {
                    Id_Lake: lake.Id_Lake,
                    lakeName: lake.name || (lake.name ? lake.name : `Hồ ${lake.Id_Lake}`),
                    qvao: record.qvao || 0,
                    luuluongxa: record.luuluongxa || 0,
                    htl: record.htl || 0,
                    timestamp: roundedTime
                };

                if (existingIndex >= 0) {
                    docsToUpsert[existingIndex] = doc;
                } else {
                    docsToUpsert.push(doc);
                }
            }

            if (docsToUpsert.length > 0) {
                await InflowLakeHistoryRepo.bulkUpsert(docsToUpsert);
            }
            return docsToUpsert.length;
        } catch (err) {
            console.error(`❌ Error pulling data for Lake ${lake.Id_Lake}:`, err.message);
            return 0;
        }
    }

    /**
     * Called by cron: sync the last 2 days of data
     */
    async syncRecentData() {
        const lakes = await InflowLakeRepo.findAll();
        if (!lakes.length) return;

        const token = await this.getToken();

        const end = new Date();
        // Round end to current hour
        end.setMinutes(0, 0, 0);
        const start = new Date(end.getTime() - (2 * 24 * 60 * 60 * 1000)); // Last 2 days

        let totalSaved = 0;
        for (const lake of lakes) {
            const savedCount = await this.fetchAndProcessLakeData(lake, token, start, end);
            totalSaved += savedCount;
        }

        console.log(`✅ [CRON] InflowLakeHistory synced ${totalSaved} new/updated recent records.`);
    }

    /**
     * Backfill: Fetch data from 01/01/2026 to present
     */
    async backfillData() {
        const lakes = await InflowLakeRepo.findAll();
        if (!lakes.length) return "Không tìm thấy hồ chứa nào.";

        const token = await this.getToken();

        // We break the timeframe into 30-day chunks to not overwhelm the API
        const end = new Date();
        // Round end to current hour
        end.setMinutes(0, 0, 0);
        const backfillStart = new Date("2026-01-01T00:00:00Z");

        const chunkDays = 30;
        let currentStart = new Date(backfillStart);
        let totalSaved = 0;

        while (currentStart < end) {
            let currentEnd = new Date(currentStart.getTime() + (chunkDays * 24 * 60 * 60 * 1000));
            if (currentEnd > end) {
                currentEnd = end;
            }

            console.log(`🔄 [BACKFILL] Chunk: ${this._formatDateISO(currentStart)} to ${this._formatDateISO(currentEnd)}`);

            for (const lake of lakes) {
                const savedCount = await this.fetchAndProcessLakeData(lake, token, currentStart, currentEnd);
                totalSaved += savedCount;
            }

            currentStart = new Date(currentEnd);
        }

        console.log(`✅ [BACKFILL] Success. Total history records saved/updated: ${totalSaved}`);
        return { success: true, processed: totalSaved, từ: backfillStart, tới: end };
    }

    /**
     * Fetch logic for controllers/frontend
     */
    async getDataset(lakeId, start, end) {
        if (!start) {
            start = new Date();
            start.setDate(start.getDate() - 2);
        }
        if (!end) end = new Date();

        return InflowLakeHistoryRepo.findByLake(lakeId, new Date(start), new Date(end));
    }
}

export default new InflowLakeHistoryService();
