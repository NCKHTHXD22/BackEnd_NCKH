import { postRepo } from "../../infrastructure/repositories/post.repo.js";
import { notificationRepo } from "../../infrastructure/repositories/notification.repo.js";
import cloudinary from "../config/cloudinary.js";
import { analyzeFloodImage, determinePostStatus } from "../../services/aiInference.service.js";

export const getAllFloodPosts = async (req, res) => {
    try {
        const posts = await postRepo.findWithPopulate({ status: "approved" }, "user");
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

export const createFloodPost = async (req, res) => {
    try {
        // ── 1. Phân tích AI với ảnh đầu tiên (nếu có) ─────────────
        let aiResult = { success: false, label: null, floodLevel: null, score: null, warnable: false };

        if (req.files?.length > 0) {
            const firstImagePath = req.files[0].path;
            console.log(`🤖 Bắt đầu phân tích AI: ${firstImagePath}`);
            aiResult = await analyzeFloodImage(firstImagePath);
        }

        // ── 2. Xác định status dựa trên kết quả AI ────────────────
        const status = determinePostStatus(aiResult);
        const isAutoApproved = (status === "approved");
        console.log(`📋 AI → label=${aiResult.label}, flood=${aiResult.floodLevel}cm, status=${status}`);

        // ── 3. Upload ảnh lên Cloudinary ───────────────────────────
        let imageUrls = [];
        if (req.files?.length > 0) {
            for (const file of req.files) {
                const result = await cloudinary.uploader.upload(file.path, { folder: "flood-posts" });
                imageUrls.push(result.secure_url);
            }
        }

        // ── 4. Lưu vào DB (kèm kết quả AI) ────────────────────────
        const newPost = await postRepo.create({
            user: req.user._id,
            location: typeof req.body.location === "string" ? JSON.parse(req.body.location) : req.body.location,
            floodLevel: req.body.floodLevel,
            areaType: req.body.areaType,
            floodTime: req.body.floodTime,
            description: req.body.description,
            imageUrls,
            isFrequentFlood: req.body.isFrequentFlood || false,
            // AI fields
            aiProcessed:    aiResult.success !== undefined,
            aiLabel:        aiResult.label        ?? null,
            aiFloodLevel:   aiResult.floodLevel   ?? null,
            aiScore:        aiResult.score        ?? null,
            aiAutoApproved: isAutoApproved,
            status,
        });

        // ── 5. Gửi thông báo cho user ──────────────────────────────
        const notifContent = isAutoApproved
            ? `✅ Bài đăng của bạn đã được duyệt tự động (AI phát hiện mức ngập ~${aiResult.floodLevel?.toFixed(0)} cm).`
            : aiResult.label === "UNDETECTED" || !aiResult.success
                ? `⏳ Bài đăng của bạn đang chờ Admin xét duyệt (AI không nhận diện được mức ngập).`
                : `⏳ Bài đăng của bạn đang chờ Admin xét duyệt.`;

        await notificationRepo.create({
            user: req.user._id,
            type: "post_moderation",
            title: isAutoApproved ? "Bài đăng đã được duyệt" : "Bài đăng đang chờ duyệt",
            content: notifContent,
            priority: isAutoApproved ? 2 : 1,
        });

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
        res.status(500).json({ error: error.message });
    }
};


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

        const updated = await postRepo.update(req.params.id, req.body);
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

export const moderateFloodPost = async (req, res) => {
    try {
        if (!req.user || req.user.role !== "admin") {
            return res.status(403).json({ message: "Only admin can moderate posts" });
        }

        const { status, rejectReason } = req.body;
        const updated = await postRepo.update(req.params.id, {
            status,
            rejectReason: status === "rejected" ? rejectReason : ""
        });

        if (!updated) return res.status(404).json({ message: "Post not found" });

        await updated.populate("user", "name email clerkId");

        await notificationRepo.create({
            user: updated.user._id,
            type: "post_moderation",
            content: status === "approved"
                ? "Bài đăng của bạn đã được duyệt"
                : `Bài đăng của bạn đã bị từ chối. Lý do: ${rejectReason || "Không rõ"}`,
        });

        res.status(200).json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
