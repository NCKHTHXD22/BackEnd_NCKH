import express from "express";
import jwt from "jsonwebtoken";
import { adminRepo } from "../../infrastructure/repositories/admin.repo.js";
import { ENV } from "../config/env.js";

const router = express.Router();

router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await adminRepo.findByUsername(username);

        if (!admin || !(await admin.comparePassword(password))) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        const token = jwt.sign({ adminId: admin._id }, ENV.JWT_SECRET, { expiresIn: "24h" });
        res.json({ token, admin: { id: admin._id, username: admin.username, name: admin.name } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
