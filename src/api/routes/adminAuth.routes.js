import express from "express";
import jwt from "jsonwebtoken";
import { adminRepo } from "../../infrastructure/repositories/admin.repo.js";
import { ENV } from "../config/env.js";
import { strictLimit } from "../middlewares/rateLimit.middleware.js";

const router = express.Router();

router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await adminRepo.findByUsername(username);

        if (!admin || !(await admin.comparePassword(password))) {
            return res.status(401).json({ error: "Invalid username or password" });
        }
        // status undefined (admin tạo trước khi field này tồn tại) == active —
        // chỉ chặn khi rõ ràng là 'pending' (tự đăng ký, chưa được duyệt).
        if (admin.status === "pending") {
            return res.status(403).json({ error: "Tài khoản đang chờ quản trị viên khác phê duyệt." });
        }

        const token = jwt.sign({ adminId: admin._id }, ENV.JWT_SECRET, { expiresIn: "24h" });
        res.json({ token, admin: { id: admin._id, username: admin.username, name: admin.name } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tự đăng ký — PUBLIC (không cần đăng nhập), nhưng tài khoản tạo ra luôn ở
// trạng thái 'pending', không đăng nhập được cho tới khi 1 admin đang hoạt
// động duyệt qua PATCH /api/admin/admins/:id/approve. Không tự cấp quyền.
router.post("/register", strictLimit, async (req, res) => {
    try {
        const { username, password, email, fullname } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Thiếu tên đăng nhập hoặc mật khẩu" });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: "Mật khẩu phải có ít nhất 6 ký tự" });
        }
        const exists = await adminRepo.findByUsername(username);
        if (exists) {
            return res.status(400).json({ error: "Tên đăng nhập đã tồn tại" });
        }

        const admin = await adminRepo.create({ username, email, name: fullname, status: "pending" });
        await admin.setPassword(password);
        await admin.save();

        res.status(201).json({ message: "Đăng ký thành công, đang chờ phê duyệt." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
