import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";
import { adminRepo } from "../../infrastructure/repositories/admin.repo.js";

export const adminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.split(" ")[1];
        if (!token) return res.status(401).json({ error: "Missing token" });

        const payload = jwt.verify(token, ENV.JWT_SECRET);
        if (!payload?.adminId) return res.status(401).json({ error: "Invalid token" });

        const admin = await adminRepo.findOne({ _id: payload.adminId });
        if (!admin) return res.status(403).json({ error: "Admin not found" });

        req.admin = admin;
        next();
    } catch (err) {
        console.error("adminAuth error:", err.message);
        res.status(401).json({ error: "Invalid or expired token" });
    }
};
