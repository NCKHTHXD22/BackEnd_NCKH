import axios from 'axios';

const AUTH = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');

async function checkReservoirs() {
    try {
        const PROXY_URL = "http://103.107.182.191:8000/proxy/danang";
        console.log(`Calling Proxy for Reservoir List with Auth...`);
        const res = await axios.post(PROXY_URL, {
            method: "GET",
            url: "https://apiv2.danang.gov.vn/apiPCTT/1.0/thuydiens",
            headers: {
                'Authorization': `Basic ${AUTH}`
            }
        });
        
        let data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        if (data.data) {
            console.log("DANANG RESERVOIRS LIST:");
            data.data.forEach(item => {
                console.log(`ID: ${item.id} | Name: ${item.ten_thuydien} | Code: ${item.ma_thuydien}`);
            });
        } else {
            console.log("FULL DATA:", JSON.stringify(data, null, 2));
        }

    } catch (err) {
        console.error("❌ Error:", err.message);
        if (err.response) console.log("Response headers:", err.response.headers);
    }
}

checkReservoirs();
