import axios from 'axios';
import InflowLakeHistoryRepo from '../infrastructure/repositories/inflowLakeHistory.repo.js';
import InflowLakeRepo from '../infrastructure/repositories/inflowLake.repo.js';
import pcttScraperService from './pcttScraper.service.js';

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
                    q_turbine: record.luuluongchayMay ?? record.q_turbine ?? record.q_may ?? 0,
                    q_spillway: record.luuluongquatran ?? record.q_spillway ?? record.q_tran ?? 0,
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
     * Fallback to scraper if GOV API fails
     */
    async syncRecentData() {
        const lakes = await InflowLakeRepo.findAll();
        if (!lakes.length) return;

        let token;
        try {
            token = await this.getToken();
        } catch (err) {
            console.warn('⚠️ [HISTORY] API Token failed, switching to FALLBACK SCRAPER...');
            return await this._syncRecentFromScraper(lakes);
        }

        const end = new Date();
        end.setMinutes(0, 0, 0);
        const start = new Date(end.getTime() - (6 * 60 * 60 * 1000)); // last 6 hours (API paginates oldest-first, 2-day window misses today's data)

        let totalSaved = 0;
        let anySuccess = false;

        for (const lake of lakes) {
            const savedCount = await this.fetchAndProcessLakeData(lake, token, start, end);
            if (savedCount > 0) anySuccess = true;
            totalSaved += savedCount;
        }

        if (!anySuccess && totalSaved === 0) {
            console.warn('⚠️ [HISTORY] GOV API returned 0 records, trying FALLBACK SCRAPER...');
            return await this._syncRecentFromScraper(lakes);
        }

        console.log(`✅ [CRON] InflowLakeHistory synced ${totalSaved} records via GOV API.`);
    }

    /**
     * Fallback history sync using scraper
     */
    async _syncRecentFromScraper(lakes) {
        try {
            const scraperData = await pcttScraperService.scrapeAllLakes();
            if (scraperData.size === 0) {
                console.error('❌ [HISTORY_SCRAPER] No data found on pctt.danang.gov.vn');
                return;
            }

            let totalSaved = 0;
            for (const lake of lakes) {
                const records = scraperData.get(lake.Id_Lake);
                if (!records || records.length === 0) continue;

                const docs = records.map(r => ({
                    Id_Lake: lake.Id_Lake,
                    lakeName: lake.name,
                    qvao: r.qvao,
                    luuluongxa: r.luuluongxa,
                    q_turbine: r.q_turbine,
                    q_spillway: r.q_spillway,
                    htl: r.htl,
                    timestamp: r.timestamp
                }));

                await InflowLakeHistoryRepo.bulkUpsert(docs);
                totalSaved += docs.length;
            }
            console.log(`✅ [HISTORY_SCRAPER] Synced ${totalSaved} records from HTML tables.`);
        } catch (err) {
            console.error('❌ [HISTORY_SCRAPER] Error:', err.message);
        }
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
     * Clean all wrong-timestamped records then re-backfill from 2026-01-01
     * Use this once after fixing the +07:00 timezone bug to correct stored timestamps
     */
    async cleanAndBackfillData() {
        console.log('🗑️ [CLEAN] Deleting all inflowlakehistories (wrong UTC timestamps)...');
        const del = await InflowLakeHistoryRepo.deleteAll();
        console.log(`✅ [CLEAN] Deleted ${del.deletedCount} records. Starting backfill...`);
        return await this.backfillData();
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
