import axios from 'axios';

const AUTH = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');
const PROXY_URL = "http://103.107.182.191:8000/proxy/danang";

async function getToken() {
    const res = await axios.post(PROXY_URL, {
        method: "POST",
        url: "https://apiv2.danang.gov.vn/oauth2/token",
        data: "grant_type=client_credentials",
        headers: {
            'Authorization': `Basic ${AUTH}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return data.access_token;
}

async function checkReservoirData(lakeId) {
    try {
        const token = await getToken();
        console.log(`✅ Got token. Fetching data for Lake ID: ${lakeId}...`);
        
        const now = new Date();
        const start = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // Last 24h
        
        // Correct way to call the proxy: wrap everything in the request body
        const res = await axios.post(PROXY_URL, {
            method: "GET",
            url: "https://apiv2.danang.gov.vn/apiPCTT/1.0/baocaothuydiens_bieudo",
            params: {
                thuydien_id: lakeId,
                ngaybatdau: start.toISOString().split('.')[0] + ".000Z",
                ngayketthuc: now.toISOString().split('.')[0] + ".000Z"
            },
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        if (data.data) data = data.data;

        console.log(`RAW DATA FOR LAKE ${lakeId}:`);
        if (Array.isArray(data)) {
            data.slice(-5).forEach(item => {
                console.log(`Time: ${item.thoigian} | Q Đến (qvao): ${item.qvao} | HTL: ${item.htl} | Xả (luuluongxa): ${item.luuluongxa}`);
            });
        } else {
            console.log(JSON.stringify(data, null, 2));
        }

    } catch (err) {
        console.error("❌ Error for Lake", lakeId, ":", err.message);
        if (err.response) console.log("Response data:", err.response.data);
    }
}

async function run() {
    console.log("--- Investigating Lake A Vương (ID 1) ---");
    await checkReservoirData(1);
    console.log("\n--- Investigating Lake Sông Tranh 2 (ID 4) ---");
    await checkReservoirData(4);
}

run();
