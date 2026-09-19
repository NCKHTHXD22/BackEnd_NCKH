import rateLimit from "express-rate-limit";

// message trả JSON { error } — app web/mobile đọc err.response.data.error để
// hiển thị lý do thật; trước đây trả chuỗi thuần nên UI chỉ hiện lỗi chung chung.
export const strictLimit = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: { error: "Bạn đang thao tác quá nhanh, vui lòng thử lại sau." },
});

export const publicLimit = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: { error: "Đang có quá nhiều truy vấn, vui lòng thử lại sau." },
});

// Chatbot tốn phí theo từng tin nhắn — giới hạn chặt hơn để tránh lạm dụng key
export const chatbotLimit = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 8,
    message: { message: "Bạn hỏi quá nhanh, vui lòng đợi một chút rồi thử lại." },
});
