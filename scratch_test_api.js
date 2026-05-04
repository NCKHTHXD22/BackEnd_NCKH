import axios from 'axios';

const AUTH = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');

async function testApi() {
    try {
        console.log("Fetching token...");
        const res = await axios.post("https://apiv2.danang.gov.vn/oauth2/token", "grant_type=client_credentials", {
            headers: {
                'Authorization': `Basic ${AUTH}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const token = res.data.access_token;
        console.log("Got token:", token);

        console.log("Fetching data for Lake 4 (Oct 2024)...");
        const dataRes = await axios.get("https://apiv2.danang.gov.vn/apiPCTT/1.0/baocaothuydiens_bieudo", {
            params: {
                thuydien_id: 4,
                ngaybatdau: "2024-10-01T00:00:00.000Z",
                ngayketthuc: "2024-10-31T23:59:59.000Z"
            },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log("Data sample:", dataRes.data.data.slice(0, 2));
    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) console.error(e.response.data);
    }
}

testApi();
