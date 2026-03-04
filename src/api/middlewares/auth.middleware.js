import { getAuth } from "@clerk/express";
import { userRepo } from "../../infrastructure/repositories/user.repo.js";

export const authMiddleware = async (req, res, next) => {
    try {
        const auth = getAuth(req);

        if (!auth || !auth.userId) {
            return res.status(401).json({ error: "Unauthorized: User not authenticated." });
        }

        const user = await userRepo.findByClerkId(auth.userId);
        if (!user) {
            return res.status(404).json({ error: "User not found in database." });
        }

        req.auth = auth;
        req.user = user;

        next();
    } catch (err) {
        console.error("authMiddleware error:", err.message);
        res.status(500).json({ error: "Authentication error" });
    }
};
