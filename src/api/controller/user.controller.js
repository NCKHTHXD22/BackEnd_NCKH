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
        const { name, phone, allowNotification, favoriteLocation, alertRadiusKm, alertLevelCm } = req.body;

        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (name) user.name = name;
        if (phone) user.phone = phone;
        if (allowNotification !== undefined) user.allowNotification = allowNotification;
        if (favoriteLocation) user.favoriteLocation = favoriteLocation;
        if (typeof alertRadiusKm === "number" && alertRadiusKm > 0) user.alertRadiusKm = alertRadiusKm;
        if (typeof alertLevelCm === "number" && alertLevelCm > 0) user.alertLevelCm = alertLevelCm;

        await user.save();
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── PATCH /api/users/location  (auth required) ───────────────────────────────
// App gọi định kỳ khi GPS cập nhật (xem index.jsx) — KHÔNG phải theo dõi vị
// trí nền liên tục của hệ điều hành, chỉ là vị trí gần nhất lúc app đang mở.
// proximityAlert.job.js dùng giá trị này để cảnh báo ngập/mưa cực lớn gần
// người dùng ngay cả khi họ vừa rời khỏi app (xem PROXIMITY_LOCATION_MAX_AGE_MS).
export const updateUserLocation = async (req, res) => {
    try {
        const clerkId = req.auth.userId;
        const { lat, lon } = req.body;
        if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
            return res.status(400).json({ message: "lat/lon không hợp lệ" });
        }
        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.lastLocation = { lat, lon, updatedAt: new Date() };
        await user.save();
        res.json({ message: "Đã cập nhật vị trí" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const registerPushToken = async (req, res) => {
    try {
        const clerkId = req.auth.userId;
        const { token } = req.body;
        // token === null -> người dùng tắt Push Notification trong Profile,
        // xoá token để job gửi cảnh báo (floodAlert.job.js) bỏ qua user này.
        if (token !== null && (!token || !token.startsWith("ExponentPushToken["))) {
            return res.status(400).json({ message: "Token không hợp lệ" });
        }
        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });
        user.expoPushToken = token;
        await user.save();
        res.json({ message: token ? "Push token đã được lưu" : "Đã tắt push notification" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const setSafetyCheckin = async (req, res) => {
    try {
        const clerkId = req.auth.userId;
        const { isSafe, lat, lon } = req.body;
        if (typeof isSafe !== "boolean") {
            return res.status(400).json({ message: "isSafe phải là true/false" });
        }
        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.safetyCheckin = {
            isSafe,
            checkedAt: new Date(),
            lat: typeof lat === "number" ? lat : null,
            lon: typeof lon === "number" ? lon : null,
        };
        await user.save();
        res.json({ message: "Đã ghi nhận trạng thái an toàn", safetyCheckin: user.safetyCheckin });
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
