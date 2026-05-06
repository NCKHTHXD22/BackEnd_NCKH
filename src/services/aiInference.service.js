/**
 * aiInference.service.js
 * Gọi Python AI Service (HuggingFace / VPS) để xử lý ảnh ngập lụt.
 * Trả về { success, label, floodLevel, score, warnable }
 */

import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import { ENV } from "../api/config/env.js";

const AI_TIMEOUT_MS = 60_000; // 60s (HF cold start có thể chậm)

/**
 * Gửi ảnh lên AI service → nhận kết quả mức ngập.
 * @param {string} imagePath - Đường dẫn file ảnh trên disk (sau khi multer lưu)
 * @returns {Promise<{success, label, floodLevel, score, warnable, message}>}
 */
export async function analyzeFloodImage(imagePath) {
    const pythonUrl = ENV.HF_YOLO_API_URL;

    if (!pythonUrl) {
        console.warn("⚠️  HF_YOLO_API_URL chưa cấu hình — bỏ qua AI");
        return { success: false, label: "NO_SERVICE", floodLevel: null, score: null, warnable: false };
    }

    if (!fs.existsSync(imagePath)) {
        console.warn(`⚠️  File ảnh không tồn tại: ${imagePath}`);
        return { success: false, label: "NO_IMAGE", floodLevel: null, score: null, warnable: false };
    }

    try {
        const form = new FormData();
        form.append("image", fs.createReadStream(imagePath));

        const response = await axios.post(pythonUrl, form, {
            headers: form.getHeaders(),
            timeout: AI_TIMEOUT_MS,
        });

        const data = response.data;
        console.log(`🤖 AI result: label=${data.label}, flood=${data.floodLevel}cm, score=${data.score}, warnable=${data.warnable}`);
        return data;

    } catch (err) {
        const msg = err.response?.data?.detail || err.message;
        console.error(`❌ AI Service lỗi: ${msg}`);
        // Fallback: không crash, để post vào pending
        return { success: false, label: "ERROR_AI", floodLevel: null, score: null, warnable: false, message: msg };
    }
}

/**
 * Xác định status bài đăng dựa trên kết quả AI.
 * - warnable = true (flood >= 10cm, AI nhận ra)  → "approved" (tự động duyệt)
 * - Còn lại                                       → "pending" (Admin xét)
 */
export function determinePostStatus(aiResult) {
    if (aiResult?.warnable === true) return "approved";
    return "pending";
}
