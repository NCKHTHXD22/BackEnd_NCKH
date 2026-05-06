import axios from 'axios';

const AUTH = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');
const PYTHON_API_URL = "http://103.107.182.191:8000/predict";
const PROXY_URL = PYTHON_API_URL.replace("/predict", "") + "/proxy/danang";

async function testToken() {
    try {
        console.log(`🔄 Testing token fetch via: ${PROXY_URL}`);
        const res = await axios.post(PROXY_URL, {
            method: "POST",
            url: "https://apiv2.danang.gov.vn/oauth2/token",
            data: "grant_type=client_credentials",
            headers: {
                'Authorization': `Basic ${AUTH}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }, { timeout: 30000 });
        
        console.log("Response status:", res.status);
        console.log("Response data:", JSON.stringify(res.data, null, 2));

    } catch (err) {
        console.error("❌ Error:", err.message);
        if (err.response) console.log("Response data:", err.response.data);
    }
}

testToken();
