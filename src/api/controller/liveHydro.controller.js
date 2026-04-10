import axios from 'axios';

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

    async getLiveHydro(req, res, next) {
        try {
            const { lakeId } = req.params;
            const token = await this.getToken();
            const proxyUrl = this._getProxyUrl();

            const end = new Date();
            end.setMinutes(0, 0, 0);
            const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

            const formatISO = (d) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z');

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

            let data = typeof hydroRes.data === 'string' ? JSON.parse(hydroRes.data) : hydroRes.data;
            if (data && data.data) data = data.data;

            if (!Array.isArray(data) || data.length === 0) {
                return res.json({ qvao: 0, luuluongxa: 0, htl: 0 });
            }

            // Sort ascending by thoigianxa for chronological chart display
            data.sort((a, b) => (a.thoigianxa || '').localeCompare(b.thoigianxa || ''));
            const latest = data[data.length - 1]; // newest = last after ascending sort

            res.json({
                qvao: latest.qvao || 0,
                luuluongxa: latest.luuluongxa || 0,
                htl: latest.htl || 0,
                history: data.map(d => ({
                    // Parse VN time correctly with +07:00
                    time: d.thoigianxa ? new Date(d.thoigianxa + '+07:00').toISOString() : null,
                    qvao: d.qvao || 0,
                    luuluongxa: d.luuluongxa || 0,
                    htl: d.htl || 0
                }))
            });

        } catch (error) {
            console.error('Hydro data fetch error:', error.message);
            res.status(500).json({ error: 'Could not fetch hydro data' });
        }
    }
}

export default new LiveHydroController();
