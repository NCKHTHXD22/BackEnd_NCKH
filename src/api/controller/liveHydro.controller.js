import axios from 'axios';
import inflowLakeHistoryRepo from '../../infrastructure/repositories/inflowLakeHistory.repo.js';

const AUTH = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');

class LiveHydroController {
    constructor() {
        this._token = null;
        this._expiry = null;
    }

    _getProxyUrl() {
        const base = process.env.PYTHON_API_URL
            ? process.env.PYTHON_API_URL.replace('/predict', '')
            : 'http://localhost:8000';
        return `${base}/proxy/danang`;
    }

    async getToken() {
        if (this._token && this._expiry && new Date() < this._expiry) {
            return this._token;
        }

        const proxyUrl = this._getProxyUrl();
        const res = await axios.post(proxyUrl, {
            method: 'POST',
            url: 'https://apiv2.danang.gov.vn/oauth2/token',
            data: { grant_type: 'client_credentials' },
            headers: {
                'Authorization': `Basic ${AUTH}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }, { timeout: 30000 });

        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        this._token = data.access_token;
        this._expiry = new Date(Date.now() + (data.expires_in - 60) * 1000);
        return this._token;
    }

    // Try fetching the last `hours` hours from InflowLakeHistory DB
    async _fetchFromDB(lakeId, hours) {
        const end = new Date();
        const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
        const rows = await inflowLakeHistoryRepo.findByLake(Number(lakeId), start, end);
        return Array.isArray(rows) ? rows : [];
    }

    _buildDBResponse(dbHistory) {
        // dbHistory is sorted ascending by timestamp (findByLake uses sort: 1)
        const latest = dbHistory[dbHistory.length - 1];
        const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Mongo lưu UTC, +7h để khớp giờ VN
        return {
            qvao: latest.qvao || 0,
            luuluongxa: latest.luuluongxa || 0,
            htl: latest.htl || 0,
            source: 'db',
            history: dbHistory.map(d => {
                const base = d.timestamp instanceof Date
                    ? d.timestamp
                    : new Date(d.timestamp);
                return {
                    time: new Date(base.getTime() + TZ_OFFSET_MS).toISOString(),
                    qvao: d.qvao || 0,
                    luuluongxa: d.luuluongxa || 0,
                    htl: d.htl || 0
                };
            })
        };
    }

    async getLiveHydro(req, res, next) {
        const { lakeId } = req.params;

        const end = new Date();
        end.setMinutes(0, 0, 0);
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        const formatISO = (d) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z');

        // ── 1. Try live Danang API ────────────────────────────────────────────
        let apiData = null;
        try {
            const token = await this.getToken();
            const proxyUrl = this._getProxyUrl();

            const hydroRes = await axios.post(proxyUrl, {
                method: 'GET',
                url: 'https://apiv2.danang.gov.vn/apiPCTT/1.0/baocaothuydiens_bieudo',
                params: {
                    thuydien_id: lakeId,
                    ngaybatdau: formatISO(start),
                    ngayketthuc: formatISO(end)
                },
                headers: { 'Authorization': `Bearer ${token}` }
            }, { timeout: 60000 });

            let raw = typeof hydroRes.data === 'string' ? JSON.parse(hydroRes.data) : hydroRes.data;
            if (raw && raw.data) raw = raw.data;
            if (Array.isArray(raw) && raw.length > 0) apiData = raw;
        } catch (err) {
            console.warn(`[liveHydro] Danang API failed for lake ${lakeId}: ${err.message}`);
        }

        // ── 2. Return API data if available ──────────────────────────────────
        if (apiData) {
            apiData.sort((a, b) => (a.thoigianxa || '').localeCompare(b.thoigianxa || ''));
            const latest = apiData[apiData.length - 1];
            return res.json({
                qvao: latest.qvao || 0,
                luuluongxa: latest.luuluongxa || 0,
                htl: latest.htl || 0,
                source: 'api',
                history: apiData.map(d => ({
                    time: d.thoigianxa ? new Date(d.thoigianxa + '+07:00').toISOString() : null,
                    qvao: d.qvao || 0,
                    luuluongxa: d.luuluongxa || 0,
                    htl: d.htl || 0
                }))
            });
        }

        // ── 3. Fallback: DB — try last 24h, then 7 days ───────────────────────
        try {
            let dbHistory = await this._fetchFromDB(lakeId, 24);
            if (dbHistory.length === 0) {
                dbHistory = await this._fetchFromDB(lakeId, 7 * 24);
            }
            if (dbHistory.length > 0) {
                return res.json(this._buildDBResponse(dbHistory));
            }
        } catch (dbErr) {
            console.warn(`[liveHydro] DB fallback failed for lake ${lakeId}: ${dbErr.message}`);
        }

        // ── 4. No data at all ────────────────────────────────────────────────
        return res.json({ qvao: 0, luuluongxa: 0, htl: 0 });
    }
}

export default new LiveHydroController();
