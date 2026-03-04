import { notificationRepo } from "../../infrastructure/repositories/notification.repo.js";

export const getMyNotifications = async (req, res) => {
    try {
        // Note: Assuming req.user._id is populated by a middleware we'll add later
        const notifs = await notificationRepo.model.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(notifs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const markAsRead = async (req, res) => {
    try {
        const notif = await notificationRepo.model.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { read: true },
            { new: true }
        );

        if (!notif) return res.status(404).json({ message: "Notification not found" });

        res.json(notif);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
