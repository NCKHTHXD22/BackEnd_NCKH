import { userRepo } from "../../infrastructure/repositories/user.repo.js";

export const createOrUpdateUser = async (req, res) => {
    const { userId } = req.auth;
    const { email, name, phone } = req.body;

    try {
        let user = await userRepo.findByClerkId(userId);

        if (user) {
            user.email = email || user.email;
            user.name = name || user.name;
            user.phone = phone || user.phone;
            await user.save();
        } else {
            user = await userRepo.create({
                clerkId: userId,
                email,
                name,
                phone,
            });
        }

        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getAllUsers = async (req, res) => {
    try {
        const users = await userRepo.findAll();
        res.status(200).json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getUserProfile = async (req, res) => {
    const { userId } = req.auth;

    try {
        const user = await userRepo.findByClerkId(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updateUserInfo = async (req, res) => {
    try {
        const clerkId = req.auth.userId;
        const { name, phone, allowNotification, favoriteLocation } = req.body;

        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (name) user.name = name;
        if (phone) user.phone = phone;
        if (allowNotification !== undefined) user.allowNotification = allowNotification;
        if (favoriteLocation) user.favoriteLocation = favoriteLocation;

        await user.save();
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const registerPushToken = async (req, res) => {
    try {
        const clerkId = req.auth.userId;
        const { token } = req.body;
        if (!token || !token.startsWith("ExponentPushToken[")) {
            return res.status(400).json({ message: "Token không hợp lệ" });
        }
        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });
        user.expoPushToken = token;
        await user.save();
        res.json({ message: "Push token đã được lưu" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteUser = async (req, res) => {
    try {
        const clerkId = req.auth.userId;
        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });

        await userRepo.delete(user._id);
        res.status(200).json({ message: "User deleted successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
