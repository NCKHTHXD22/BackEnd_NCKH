import axios from 'axios';
import InflowLakeHistoryRepo from '../infrastructure/repositories/inflowLakeHistory.repo.js';
import InflowLakeRepo from '../infrastructure/repositories/inflowLake.repo.js';

class InflowLakeHistoryService {
    constructor() {
        this.API_URL = "https://apiv2.danang.gov.vn/apiPCTT/1.0/baocaothuydiens_bieudo";
        this.AUTH = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');
    }

    async getToken() {
        try {
            const res = await axios.post("https://apiv2.danang.gov.vn/oauth2/token", "grant_type=client_credentials", {
                headers: {
                    'Authorization': `Basic ${this.AUTH}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            return res.data.access_token;
        } catch (err) {
            console.error("❌ Token fetch error:", err.message);
            throw new Error("Cannot get token from Danang API");
        }
    }

    // Parses any date to the exact top of the hour `xx:00:00.000`
    _roundToHour(dateStr) {
        const d = new Date(dateStr);
        d.setMinutes(0, 0, 0); // Sets to xx:00:00.000
        return d;
    }

    _formatDateISO(date) {
        return date.toISOString().split('.')[0] + ".000Z";
    }

    /**
     * Fetch data from Danang API for a specific lake and time range
     */
    async fetchAndProcessLakeData(lake, token, start, end) {
        try {
            const res = await axios.get(this.API_URL, {
                params: {
                    thuydien_id: lake.Id_Lake,
                    ngaybatdau: this._formatDateISO(start),
                    ngayketthuc: this._formatDateISO(end)
                },
                headers: { 'Authorization': `Bearer ${token}` }
            });

            let data = res.data;
            if (data && data.data) data = data.data;

            if (!Array.isArray(data) || data.length === 0) {
                return 0; // No data fetched
            }

            const docsToUpsert = [];
            const seenHours = new Set();

            // Ensure we push data incrementally.
            // Often, the last entry for a particular hour is best if there are slight duplications.
            for (const record of data) {
                if (!record.thoigian) continue;

                const roundedTime = this._roundToHour(record.thoigian);
                const timeKey = roundedTime.toISOString();

                // Use the first record we see for an hour or override. We will override it (keeping the latest).
                // Since the Danang API returns data sequentially, overwriting gives the latest recorded value inside that hour bucket.
                seenHours.add(timeKey);

                // find if we already pushed this hour, update it
                const existingIndex = docsToUpsert.findIndex(d => d.timestamp.toISOString() === timeKey);
                const doc = {
                    Id_Lake: lake.Id_Lake,
                    lakeName: lake.name || Object.keys(lake).length ? lake.name : `Hồ ${lake.Id_Lake}`,
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
