import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';

const url = "https://anvo2004-flood-ai-inference.hf.space/predict";
const imagePath = process.argv[2];

if (!imagePath) {
    console.error("Vui lòng cung cấp đường dẫn ảnh: node test_ai.js <path_to_image>");
    process.exit(1);
}

async function testAI() {
    try {
        console.log(`Đang gửi ảnh ${imagePath} lên AI...`);
        const form = new FormData();
        form.append('image', fs.createReadStream(imagePath));

        const res = await axios.post(url, form, {
            headers: {
                ...form.getHeaders()
            }
        });
        
        console.log("Kết quả từ AI:");
        console.log(JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error("Lỗi:", err.response?.data || err.message);
    }
}

testAI();
