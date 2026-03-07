import express from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * Mở proxy cho luồng xin Token Đà Nẵng
 * endpoint mặt ngoài: POST /api/proxy/danang/token
 */
router.post('/token', async (req, res) => {
    try {
        const { authorization, 'content-type': ct } = req.headers;
        const response = await axios.post("https://apiv2.danang.gov.vn/oauth2/token", "grant_type=client_credentials", {
            headers: {
                'Authorization': authorization,
                'Content-Type': ct || 'application/x-www-form-urlencoded'
            },
            timeout: 10000
        });

        res.status(response.status).json(response.data);
    } catch (error) {
        console.error("❌ Proxy Token Error:", error.message);
        const status = error.response ? error.response.status : 500;
        const data = error.response ? error.response.data : { error: error.message };
        res.status(status).json(data);
    }
});

/**
 * Mở proxy cho luồng xin dữ liệu Hồ chứa Đà Nẵng (Hydro Data)
 * endpoint mặt ngoài: GET /api/proxy/danang/hydro
 */
router.get('/hydro', async (req, res) => {
    try {
        const { authorization } = req.headers;

        const response = await axios.get("https://apiv2.danang.gov.vn/apiPCTT/1.0/baocaothuydiens_bieudo", {
            headers: {
                'Authorization': authorization
            },
            params: req.query, // Pass toàn bộ query string (thuydien_id, ngaybatdau...)
            timeout: 30000
        });

        res.status(response.status).json(response.data);
    } catch (error) {
        console.error("❌ Proxy Hydro Error:", error.message);
        const status = error.response ? error.response.status : 500;
        const data = error.response ? error.response.data : { error: error.message };
        res.status(status).json(data);
    }
});

export default router;
