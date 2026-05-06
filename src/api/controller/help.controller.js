import { helpRepo } from "../../infrastructure/repositories/help.repo.js";
import { userRepo } from "../../infrastructure/repositories/user.repo.js";
import cloudinary from "../config/cloudinary.js";

// ─── POST /api/help — tạo yêu cầu hỗ trợ (user) ─────────────────────────────
export const createHelpRequest = async (req, res) => {
    try {
        const clerkId = req.auth.userId;

        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const { description, what3words, address, location } = req.body;

        if (!description || !address || !location) {
            return res.status(400).json({ error: "Thiếu dữ liệu bắt buộc" });
        }

        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const result = await cloudinary.uploader.upload(file.path, {
                    folder: "help_images",
                });
                imageUrls.push(result.secure_url);
            }
        }

        const help = await helpRepo.create({
            user: user._id,
            description,
            what3words,
            address: typeof address === "string" ? JSON.parse(address) : address,
            location: typeof location === "string" ? JSON.parse(location) : location,
            imageUrls,
            status: "pending", // mặc định chờ Admin duyệt
        });

        res.status(201).json(help);
    } catch (err) {
        res.status(500).json({ error: "Lỗi server" });
    }
};

// ─── GET /api/help — lấy tất cả (admin dashboard) ────────────────────────────
export const getAllHelpRequests = async (req, res) => {
    try {
        const { status } = req.query; // ?status=pending|approved|rejected|all
        const filter = status && status !== "all" ? { status } : {};

        const helps = await helpRepo.model
            .find(filter)
            .populate("user", "name email phone")
            .sort({ createdAt: -1 });

        res.status(200).json(helps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── GET /api/help/nearby?lat=&lng=&radius= — lấy yêu cầu approved gần nhất ──
// Public endpoint — dùng bởi mobile notification tab
export const getNearbyApprovedHelp = async (req, res) => {
    try {
        const lat    = parseFloat(req.query.lat);
        const lng    = parseFloat(req.query.lng);
        const radius = parseFloat(req.query.radius) || 5; // km, mặc định 5km

        if (!lat || !lng) {
            return res.status(400).json({ error: "Thiếu lat/lng" });
        }

        // Lấy tất cả approved (có thể dùng MongoDB geospatial nếu muốn optimize sau)
        const helps = await helpRepo.model
            .find({ status: "approved" })
            .populate("user", "name")
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        // Lọc theo khoảng cách Haversine
        const R = 6371;
        const toRad = (d) => (d * Math.PI) / 180;
        const distKm = (la1, lo1, la2, lo2) => {
            const dLat = toRad(la2 - la1);
            const dLon = toRad(lo2 - lo1);
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(la1)) * Math.cos(toRad(la2)) *
                Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        const nearby = helps
            .filter((h) => {
                const hLat = h.location?.latitude;
                const hLng = h.location?.longitude;
                if (!hLat || !hLng) return false;
                return distKm(lat, lng, hLat, hLng) <= radius;
            })
            .map((h) => ({
                ...h,
                distKm: Math.round(distKm(lat, lng, h.location.latitude, h.location.longitude) * 10) / 10,
            }));

        res.status(200).json(nearby);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── GET /api/help/me — lấy yêu cầu của user hiện tại ───────────────────────
export const getUserHelpRequests = async (req, res) => {
    try {
        const clerkId = req.auth.userId;

        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const helps = await helpRepo.findAll({ user: user._id });
        res.status(200).json(helps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── PATCH /api/help/:id/approve — Admin duyệt yêu cầu ──────────────────────
export const approveHelpRequest = async (req, res) => {
    try {
        const help = await helpRepo.model.findByIdAndUpdate(
            req.params.id,
            {
                status: "approved",
                approvedAt: new Date(),
                approvedBy: req.admin?._id || null,
                rejectReason: null,
            },
            { new: true }
        );
        if (!help) return res.status(404).json({ message: "Không tìm thấy yêu cầu" });
        res.json(help);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── PATCH /api/help/:id/reject — Admin từ chối yêu cầu ─────────────────────
export const rejectHelpRequest = async (req, res) => {
    try {
        const help = await helpRepo.model.findByIdAndUpdate(
            req.params.id,
            {
                status: "rejected",
                rejectReason: req.body.reason || "Không đủ điều kiện",
                approvedAt: null,
            },
            { new: true }
        );
        if (!help) return res.status(404).json({ message: "Không tìm thấy yêu cầu" });
        res.json(help);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
