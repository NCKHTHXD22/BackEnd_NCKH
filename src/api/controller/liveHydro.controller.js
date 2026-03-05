import axios from 'axios';

class LiveHydroController {
    constructor() {
        this.BASE_URL = "https://apiv2.danang.gov.vn/apiPCTT/1.0";
        this.TOKEN_URL = "https://apiv2.danang.gov.vn/oauth2/token";
        // Matching python backend data_fetcher keys
        this.CONSUMER_KEY = "rfm2O3ciJ3aOJy1iA2SAfS3P_qwa";
        this.CONSUMER_SECRET = "cklyddfdciGjQJGdtiPg936PDo8a";
        this._token = null;
        this._expiry = null;
    }

    async getToken() {
        if (this._token && this._expiry && new Date() < this._expiry) {
            return this._token;
        }

        const auth = Buffer.from(`${this.CONSUMER_KEY}:${this.CONSUMER_SECRET}`).toString('base64');

        try {
            const res = await axios.post(this.TOKEN_URL, "grant_type=client_credentials", {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            this._token = res.data.access_token;
            // Subtract 60 seconds as buffer
            this._expiry = new Date(Date.now() + (res.data.expires_in - 60) * 1000);
            return this._token;
        } catch (error) {
            console.error("Token fetch error:", error.message);
            throw new Error("Could not fetch Danang API token");
        }
    }

    async getLiveHydro(req, res, next) {
        try {
            const { lakeId } = req.params;
            const token = await this.getToken();

            const end = new Date();
            end.setMinutes(0, 0, 0); // floor to hour
            const start = new Date(end.getTime() - (24 * 60 * 60 * 1000)); // 1 day ago

            const hydroRes = await axios.get(`${this.BASE_URL}/baocaothuydiens_bieudo`, {
                params: {
                    thuydien_id: lakeId,
                    ngaybatdau: start.toISOString().replace(/\.\d{3}Z$/, ".000Z"),
                    ngayketthuc: end.toISOString().replace(/\.\d{3}Z$/, ".000Z")
                },
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = hydroRes.data?.data;
            if (!data || data.length === 0) {
                return res.json({ qvao: 0, luuluongxa: 0, htl: 0 });
            }

            // Get the latest valid record
            const latest = data[data.length - 1];
            res.json({
                qvao: latest.qvao || 0,
                luuluongxa: latest.luuluongxa || 0,
                htl: latest.htl || 0
            });

        } catch (error) {
            console.error("Hydro data fetch error:", error.message);
            res.status(500).json({ error: "Could not fetch hydro data" });
        }
    }
}

export default new LiveHydroController();
