import { chatbotService, MAX_MESSAGE_CHARS } from "../../services/chatbot.service.js";

export const sendChatMessage = async (req, res) => {
    const { message, history, lat, lon } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ message: "Vui lòng nhập câu hỏi." });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
        return res.status(400).json({ message: `Câu hỏi quá dài (tối đa ${MAX_MESSAGE_CHARS} ký tự).` });
    }

    // lat/lon là tuỳ chọn — chỉ dùng để bổ sung ngữ cảnh khu vực, bỏ qua nếu không hợp lệ
    const safeLat = typeof lat === "number" && Number.isFinite(lat) ? lat : undefined;
    const safeLon = typeof lon === "number" && Number.isFinite(lon) ? lon : undefined;

    try {
        const reply = await chatbotService.reply(message.trim(), history, { lat: safeLat, lon: safeLon });
        res.json({ reply });
    } catch (err) {
        console.error("❌ [Chatbot]", err.response?.data || err.message);
        if (err.status === 503) {
            return res.status(503).json({ message: "Trợ lý AI tạm thời chưa khả dụng." });
        }
        res.status(502).json({ message: "Trợ lý AI đang bận, vui lòng thử lại sau ít phút." });
    }
};
