import { postRepo } from "../../infrastructure/repositories/post.repo.js";
import { notificationRepo } from "../../infrastructure/repositories/notification.repo.js";
import cloudinary from "../config/cloudinary.js";

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
        let imageUrls = [];
        if (req.files?.length > 0) {
            for (const file of req.files) {
                const result = await cloudinary.uploader.upload(file.path, { folder: "flood-posts" });
                imageUrls.push(result.secure_url);
            }
        }

        const newPost = await postRepo.create({
            user: req.user._id,
            location: typeof req.body.location === "string" ? JSON.parse(req.body.location) : req.body.location,
            floodLevel: req.body.floodLevel,
            areaType: req.body.areaType,
            floodTime: req.body.floodTime,
            description: req.body.description,
            imageUrls,
            isFrequentFlood: req.body.isFrequentFlood || false,
            status: "pending"
        });

        res.status(201).json(newPost);
    } catch (error) {
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
