import fs from "fs";
import { postRepo } from "../../infrastructure/repositories/post.repo.js";
import { notificationRepo } from "../../infrastructure/repositories/notification.repo.js";
import cloudinary from "../config/cloudinary.js";
import { analyzeFloodImage, determinePostStatus } from "../../services/aiInference.service.js";
import { sendExpoPush } from "../../services/expoPush.service.js";
import { FLOOD_LEVEL_TYPES } from "../../core/entities/FloodPost.js";

const DEFAULT_LIST_LIMIT = 200;
// Tên field honeypot — không hiển thị ở UI thật, bot điền form thường tự động điền vào.
const HONEYPOT_FIELD = "website";

export const getAllFloodPosts = async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || DEFAULT_LIST_LIMIT, DEFAULT_LIST_LIMIT);
        const skip = Math.max(Number(req.query.skip) || 0, 0);
        const posts = await postRepo.findWithPopulate({ status: "approved" }, "user", { limit, skip });
        res.status(200).json(posts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getFloodPostById = async (req, res) => {
    try {
        const post = await postRepo.findOne({ _id: req.params.id });
        if (!post) return res.status(404).json({ message: "Flood post not found" });

        // Note: Population and access control logic simplified to use repository
        await post.populate("user", "name email phone clerkId role");

        if (post.status !== "approved") {
            const isOwner = req.user && post.user?.clerkId === req.user.clerkId;
            const isAdmin = req.user && req.user.role === "admin";

            if (!isOwner && !isAdmin) {
                return res.status(403).json({ message: "Forbidden" });
            }
        }

        res.status(200).json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Xoá các file tạm mà multer đã ghi ra đĩa (không chặn response nếu unlink lỗi)
function cleanupTempFiles(files) {
    for (const file of files || []) {
        fs.unlink(file.path, (err) => {
            if (err) console.warn(`⚠️  Không xoá được file tạm ${file.path}:`, err.message);
        });
    }
}

export const createFloodPost = async (req, res) => {
    try {
        // ── 0. Honeypot chống spam ─────────────────────────────────
        // Field ẩn ở form thật; nếu có giá trị nghĩa là bot tự điền form → âm thầm "giả vờ" thành công
        // mà không tạo bài, không tốn quota AI/Cloudinary, không lộ cho bot biết bị phát hiện.
        if (req.body[HONEYPOT_FIELD]) {
            console.warn(`🍯 Honeypot triggered — bỏ qua submit (ip=${req.ip})`);
            cleanupTempFiles(req.files);
            return res.status(201).json({ message: "Đã ghi nhận, cảm ơn bạn." });
        }

        const reportType = req.body.reportType || "flood_point";
        const runsAI = FLOOD_LEVEL_TYPES.includes(reportType);

        // ── 1. Phân tích AI với ảnh đầu tiên (chỉ với Điểm ngập/Đường ngập) ──
        let aiResult = { success: false, label: null, floodLevel: null, score: null, warnable: false };

        if (runsAI && req.files?.length > 0) {
            const firstImagePath = req.files[0].path;
            console.log(`🤖 Bắt đầu phân tích AI: ${firstImagePath}`);
            aiResult = await analyzeFloodImage(firstImagePath);
        }

        // ── 2. Xác định status ──────────────────────────────────────
        // Cây ngã đổ / Khu vực sạt lở không có AI đánh giá ảnh → luôn cần Admin duyệt tay.
        const status = runsAI ? determinePostStatus(aiResult) : "pending";
        const isAutoApproved = (status === "approved");
        if (runsAI) console.log(`📋 AI → label=${aiResult.label}, flood=${aiResult.floodLevel}cm, status=${status}`);

        // ── 3. Upload ảnh lên Cloudinary rồi dọn file tạm trên đĩa ───
        let imageUrls = [];
        if (req.files?.length > 0) {
            for (const file of req.files) {
                const result = await cloudinary.uploader.upload(file.path, { folder: "flood-posts" });
                imageUrls.push(result.secure_url);
            }
            cleanupTempFiles(req.files);
        }

        // ── 4. Lưu vào DB (kèm kết quả AI) ────────────────────────
        const newPost = await postRepo.create({
            reportType,
            user: req.user?._id ?? null,
            location: typeof req.body.location === "string" ? JSON.parse(req.body.location) : req.body.location,
            fromAddress: req.body.fromAddress,
            toAddress: req.body.toAddress,
            floodLevel: req.body.floodLevel,
            areaType: req.body.areaType,
            landslideStatus: req.body.landslideStatus,
            floodTime: req.body.floodTime,
            eventEndTime: req.body.eventEndTime || undefined,
            description: req.body.description,
            imageUrls,
            isFrequentFlood: req.body.isFrequentFlood === "true" || req.body.isFrequentFlood === true,
            // AI fields
            aiProcessed:    runsAI && aiResult.success !== undefined,
            aiLabel:        aiResult.label        ?? null,
            aiFloodLevel:   aiResult.floodLevel   ?? null,
            aiScore:        aiResult.score        ?? null,
            aiAutoApproved: isAutoApproved,
            status,
        });

        // ── 5. Gửi thông báo cho user (chỉ khi có tài khoản — bài ẩn danh không có ai để báo) ──
        if (req.user) {
            const notifContent = isAutoApproved
                ? `✅ Bài đăng của bạn đã được duyệt tự động (AI phát hiện mức ngập ~${aiResult.floodLevel?.toFixed(0)} cm).`
                : runsAI && (aiResult.label === "UNDETECTED" || !aiResult.success)
                    ? `⏳ Bài đăng của bạn đang chờ Admin xét duyệt (AI không nhận diện được mức ngập).`
                    : `⏳ Bài đăng của bạn đang chờ Admin xét duyệt.`;

            await notificationRepo.create({
                user: req.user._id,
                type: "post_moderation",
                title: isAutoApproved ? "Bài đăng đã được duyệt" : "Bài đăng đang chờ duyệt",
                content: notifContent,
                priority: isAutoApproved ? 2 : 1,
            });

            if (req.user.expoPushToken) {
                sendExpoPush(req.user.expoPushToken, {
                    title: isAutoApproved ? "Bài đăng đã được duyệt ✅" : "Bài đăng đang chờ duyệt ⏳",
                    body: notifContent,
                    data: { type: "post_moderation", postId: newPost._id?.toString() },
                });
            }
        }

        res.status(201).json({
            ...newPost.toObject(),
            _aiInfo: {
                label: aiResult.label,
                floodLevel: aiResult.floodLevel,
                score: aiResult.score,
                autoApproved: isAutoApproved,
            }
        });
    } catch (error) {
        console.error("❌ createFloodPost error:", error);
        cleanupTempFiles(req.files);
        res.status(500).json({ error: error.message });
    }
};


// Chỉ các field nội dung mới được chủ bài/admin sửa qua route này — không cho ghi đè
// status/aiScore/aiAutoApproved/rejectReason/user (tránh mass-assignment).
const OWNER_EDITABLE_FIELDS = [
    "description", "floodLevel", "areaType", "floodTime", "eventEndTime",
    "location", "fromAddress", "toAddress", "landslideStatus", "isFrequentFlood",
];

export const updateFloodPost = async (req, res) => {
    try {
        const post = await postRepo.findOne({ _id: req.params.id });
        if (!post) return res.status(404).json({ message: "Flood post not found" });

        await post.populate("user", "clerkId");
        const isOwner = req.user && post.user?.clerkId === req.user.clerkId;
        const isAdmin = req.user && req.user.role === "admin";

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: "Unauthorized to update this post" });
        }

        const updateData = {};
        for (const key of OWNER_EDITABLE_FIELDS) {
            if (req.body[key] !== undefined) updateData[key] = req.body[key];
        }

        const updated = await postRepo.update(req.params.id, updateData);
        res.status(200).json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteFloodPost = async (req, res) => {
    try {
        const post = await postRepo.findOne({ _id: req.params.id });
        if (!post) return res.status(404).json({ message: "Flood post not found" });

        await post.populate("user", "clerkId");
        const isOwner = req.user && post.user?.clerkId === req.user.clerkId;
        const isAdmin = req.user && req.user.role === "admin";

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: "Unauthorized to delete this post" });
        }

        await postRepo.delete(req.params.id);
        res.status(200).json({ message: "Post deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

