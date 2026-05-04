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

async function checkDateSource() {
    try {
        const token = await getToken();
        const res = await axios.post(PROXY_URL, {
            method: "GET",
            // Use a specific time range where we know data exists on PCTT
            url: "https://apiv2.danang.gov.vn/apiPCTT/1.0/baocaothuydiens_bieudo",
            params: {
                thuydien_id: 1,
                ngaybatdau: "2026-03-30T10:00:00.000Z",
                ngayketthuc: "2026-03-30T20:00:00.000Z"
            },
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        if (data.data) {
            console.log("SAMPLE RECORD FROM API:");
            console.log(JSON.stringify(data.data[0], null, 2));
        } else {
            console.log("No data returned or error:", data);
        }

    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

checkDateSource();
