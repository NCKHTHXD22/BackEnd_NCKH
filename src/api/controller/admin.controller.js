import { postRepo } from "../../infrastructure/repositories/post.repo.js";
import { userRepo } from "../../infrastructure/repositories/user.repo.js";
import { adminRepo } from "../../infrastructure/repositories/admin.repo.js";
import { notificationRepo } from "../../infrastructure/repositories/notification.repo.js";
import { sendExpoPush } from "../../services/expoPush.service.js";

/* POSTS */
export const getPendingPosts = async (req, res) => {
    try {
        const posts = await postRepo.findWithPopulate({ status: "pending" });
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getApprovedPosts = async (req, res) => {
    try {
        const posts = await postRepo.findWithPopulate({ status: "approved" });
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getRejectedPosts = async (req, res) => {
    try {
        const posts = await postRepo.findWithPopulate({ status: "rejected" });
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const approvePost = async (req, res) => {
    try {
        const post = await postRepo.update(req.params.id, { status: "approved" });
        if (!post) return res.status(404).json({ error: "Post not found" });

        const content = `Bài đăng "${post.description}" đã được duyệt.`;
        await notificationRepo.create({
            user: post.user,
            type: "post_approved",
            content,
        });

        const owner = await userRepo.model.findById(post.user).select("expoPushToken").lean();
        if (owner?.expoPushToken) {
            sendExpoPush(owner.expoPushToken, {
                title: "Bài đăng được duyệt ✅",
                body: content,
                data: { type: "post_approved", postId: post._id?.toString() },
            });
        }

        res.json({ message: "Post approved", post });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const rejectPost = async (req, res) => {
    try {
        const { reason } = req.body;
        const post = await postRepo.update(req.params.id, { status: "rejected", rejectReason: reason });
        if (!post) return res.status(404).json({ error: "Post not found" });

        const content = `Bài đăng "${post.description}" bị từ chối. Lý do: ${reason}`;
        await notificationRepo.create({
            user: post.user,
            type: "post_rejected",
            content,
        });

        const owner = await userRepo.model.findById(post.user).select("expoPushToken").lean();
        if (owner?.expoPushToken) {
            sendExpoPush(owner.expoPushToken, {
                title: "Bài đăng bị từ chối ❌",
                body: content,
                data: { type: "post_rejected", postId: post._id?.toString() },
            });
        }

        res.json({ message: "Post rejected", post });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updatePostAdmin = async (req, res) => {
    try {
        const allowed = ["description", "floodLevel", "areaType", "floodTime", "location"];
        const updateData = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updateData[key] = req.body[key];
        }
        const post = await postRepo.update(req.params.id, updateData);
        if (!post) return res.status(404).json({ error: "Post not found" });
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deletePostAdmin = async (req, res) => {
    try {
        const post = await postRepo.delete(req.params.id);
        if (!post) return res.status(404).json({ error: "Post not found" });
        res.json({ message: "Post deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* USERS */
export const getAllUsersAdmin = async (req, res) => {
    try {
        const users = await userRepo.findAll();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const changeUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: "Invalid role" });
        const user = await userRepo.update(req.params.id, { role });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const banUser = async (req, res) => {
    try {
        const user = await userRepo.update(req.params.id, { status: "banned" });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const unbanUser = async (req, res) => {
    try {
        const user = await userRepo.update(req.params.id, { status: "active" });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updateUserAdmin = async (req, res) => {
    try {
        const allowed = ["name", "email", "phone"];
        const updateData = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updateData[key] = req.body[key];
        }
        const user = await userRepo.update(req.params.id, updateData);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteUserAdmin = async (req, res) => {
    try {
        const user = await userRepo.delete(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ message: "User deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ADMINS */
export const createAdmin = async (req, res) => {
    try {
        const { username, password, email, name } = req.body;
        if (!username || !password) return res.status(400).json({ error: "username and password required" });

        const exists = await adminRepo.findByUsername(username);
        if (exists) return res.status(400).json({ error: "username already exists" });

        const admin = await adminRepo.create({ username, email, name });
        await admin.setPassword(password);
        await admin.save();

        res.status(201).json({ id: admin._id, username: admin.username, email: admin.email, name: admin.name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const listAdmins = async (req, res) => {
    try {
        const admins = await adminRepo.findAll();
        res.json(admins);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteAdmin = async (req, res) => {
    try {
        const admin = await adminRepo.delete(req.params.id);
        if (!admin) return res.status(404).json({ error: "Admin not found" });
        res.json({ message: "Admin deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getUserStats = async (req, res) => {
    try {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        const weekCount = await userRepo.model.countDocuments({ createdAt: { $gte: startOfWeek } });
        const monthCount = await userRepo.model.countDocuments({ createdAt: { $gte: startOfMonth } });
        const yearCount = await userRepo.model.countDocuments({ createdAt: { $gte: startOfYear } });

        res.json({ week: weekCount, month: monthCount, year: yearCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
