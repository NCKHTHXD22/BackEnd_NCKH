import rateLimit from "express-rate-limit";

export const strictLimit = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: "Bạn đang thao tác quá nhanh, vui lòng thử lại sau.",
});

export const publicLimit = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: "Đang có quá nhiều truy vấn, vui lòng thử lại sau.",
});
