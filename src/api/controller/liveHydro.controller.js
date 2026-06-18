import axios from 'axios';
import inflowLakeHistoryRepo from '../../infrastructure/repositories/inflowLakeHistory.repo.js';
import rainLakeHistoryRepo from '../../infrastructure/repositories/rainLakeHistory.repo.js';

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

    _buildDBResponse(dbHistory, rainHistory = []) {
        // Build a map of rain history by ISO timestamp string
        const rainMap = new Map();
        rainHistory.forEach(r => {
            const ts = r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date(r.timestamp).toISOString();
            rainMap.set(ts, r.sumDepth || 0);
        });

        const latest = dbHistory[dbHistory.length - 1];
        return {
            qvao: latest.qvao || 0,
            luuluongxa: latest.luuluongxa || 0,
            htl: latest.htl || 0,
            source: 'db',
            history: dbHistory.map(d => {
                const ts = d.timestamp instanceof Date ? d.timestamp.toISOString() : new Date(d.timestamp).toISOString();
                return {
                    time: ts,
                    qvao: d.qvao || 0,
                    luuluongxa: d.luuluongxa || 0,
                    q_turbine: d.q_turbine || 0,
                    q_spillway: d.q_spillway || 0,
                    htl: d.htl || 0,
                    rain: rainMap.get(ts) || 0
                };
            })
        };
    }

    async getLiveHydro(req, res, next) {
        const { lakeId } = req.params;

        const end = new Date();
        end.setMinutes(0, 0, 0);
        // Extend to 36 hours history to match forecast tab logic
        const start = new Date(end.getTime() - 36 * 60 * 60 * 1000);
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

        // Fetch local rain history regardless of source
        const rainHistory = await rainLakeHistoryRepo.getByLakeAndRange(Number(lakeId), start, end).catch(() => []);
        const rainMap = new Map();
        rainHistory.forEach(r => {
            const ts = r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date(r.timestamp).toISOString();
            rainMap.set(ts, r.sumDepth || 0);
        });

        // ── 2. Return API data if available ──────────────────────────────────
        if (apiData) {
            apiData.sort((a, b) => (a.thoigianxa || '').localeCompare(b.thoigianxa || ''));
            const latest = apiData[apiData.length - 1];
            return res.json({
                qvao: latest.qvao || 0,
                luuluongxa: latest.luuluongxa || 0,
                htl: latest.htl || 0,
                source: 'api',
                history: apiData.map(d => {
                    const ts = d.thoigianxa ? new Date(d.thoigianxa + '+07:00').toISOString() : null;
                    return {
                        time: ts,
                        qvao: d.qvao || 0,
                        luuluongxa: d.luuluongxa || 0,
                        q_turbine: d.luuluongchayMay ?? d.q_turbine ?? d.q_may ?? 0,
                        q_spillway: d.luuluongquatran ?? d.q_spillway ?? d.q_tran ?? 0,
                        htl: d.htl || 0,
                        rain: ts ? (rainMap.get(ts) || 0) : 0
                    };
                })
            });
        }

        // ── 3. Fallback: DB — try last 36h, then 7 days ───────────────────────
        try {
            let dbHistory = await this._fetchFromDB(lakeId, 36);
            if (dbHistory.length === 0) {
                dbHistory = await this._fetchFromDB(lakeId, 7 * 24);
                // If fetching 7 days, we need more rain history too
                const rain7d = await rainLakeHistoryRepo.getByLakeAndRange(Number(lakeId), new Date(Date.now() - 7 * 24 * 3600000), new Date()).catch(() => []);
                return res.json(this._buildDBResponse(dbHistory, rain7d));
            }
            if (dbHistory.length > 0) {
                return res.json(this._buildDBResponse(dbHistory, rainHistory));
            }
        } catch (dbErr) {
            console.warn(`[liveHydro] DB fallback failed for lake ${lakeId}: ${dbErr.message}`);
        }

        // ── 4. No data at all ────────────────────────────────────────────────
        return res.json({ qvao: 0, luuluongxa: 0, htl: 0 });
    }
}

export default new LiveHydroController();
