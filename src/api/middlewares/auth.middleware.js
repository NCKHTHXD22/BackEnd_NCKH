import { getAuth } from "@clerk/express";
import { userRepo } from "../../infrastructure/repositories/user.repo.js";

export const authMiddleware = async (req, res, next) => {
    try {
        const auth = getAuth(req);

        if (!auth || !auth.userId) {
            return res.status(401).json({ error: "Unauthorized: User not authenticated." });
        }

        let user = await userRepo.findByClerkId(auth.userId);

        // Nếu user có tài khoản Clerk nhưng bị mất/chưa có trong MongoDB -> tự động tạo
        if (!user) {
            user = await userRepo.create({
                clerkId: auth.userId,
            });
            console.log(`[Auth] Auto-created missing user in DB: ${auth.userId}`);
        }

        req.auth = auth;
        req.user = user;

        next();
    } catch (err) {
        console.error("authMiddleware error:", err.message);
        res.status(401).json({ error: "Authentication error: " + err.message });
    }
};

// Giống authMiddleware, nhưng cho phép request ẩn danh đi qua (req.user để undefined)
// thay vì 401 khi không có Clerk session — dùng cho các route web-ẩn-danh (VD: gửi báo cáo ngập).
// Nếu có session nhưng bị lỗi thật (token hỏng, lỗi DB...) vẫn báo lỗi như bình thường,
// tránh việc "âm thầm ẩn danh hoá" một request đăng nhập thật bị lỗi.
export const optionalAuthMiddleware = async (req, res, next) => {
    try {
        const auth = getAuth(req);

        if (!auth || !auth.userId) {
            req.user = undefined;
            return next();
        }

        let user = await userRepo.findByClerkId(auth.userId);

        if (!user) {
            user = await userRepo.create({
                clerkId: auth.userId,
            });
            console.log(`[Auth] Auto-created missing user in DB: ${auth.userId}`);
        }

        req.auth = auth;
        req.user = user;

        next();
    } catch (err) {
        console.error("optionalAuthMiddleware error:", err.message);
        res.status(401).json({ error: "Authentication error: " + err.message });
    }
};
