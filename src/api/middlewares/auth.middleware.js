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
