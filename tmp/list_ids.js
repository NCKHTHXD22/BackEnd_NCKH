import axios from 'axios';

const AUTH = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');
const PROXY_URL = "http://103.107.182.191:8000/proxy/danang";

async function getToken() {
    const res = await axios.post(PROXY_URL, {
        method: "POST",
        url: "https://apiv2.danang.gov.vn/oauth2/token",
        data: { grant_type: "client_credentials" },
        headers: {
            'Authorization': `Basic ${AUTH}`
        }
    });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return data.access_token;
}

async function listReservoirs() {
    try {
        const token = await getToken();
        console.log("✅ Token obtained.");
        
        const res = await axios.post(PROXY_URL, {
            method: "GET",
            url: "https://apiv2.danang.gov.vn/apiPCTT/1.0/thuydiens",
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        console.log("--- RAW RESPONSE DATA ---");
        console.log(JSON.stringify(data, null, 2));

    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

listReservoirs();
