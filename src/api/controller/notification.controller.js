import { notificationRepo } from "../../infrastructure/repositories/notification.repo.js";
import ReservoirAlert from "../entities/ReservoirAlert.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isExpired = (n) => n.expires_at && new Date(n.expires_at) < new Date();

// ─── GET /api/notifications/me  (auth required) ───────────────────────────────
export const getMyNotifications = async (req, res) => {
    try {
        const notifs = await notificationRepo.model
            .find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(notifs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── PATCH /api/notifications/:id/read  (auth required) ──────────────────────
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

// ─── GET /api/notifications/public  (NO auth — mobile dùng để lấy cảnh báo) ──
/**
 * Trả về tổng hợp cảnh báo hệ thống:
 *  1. Cảnh báo hồ chứa  (từ ReservoirAlert collection)
 *  2. Thông báo hệ thống lưu trong Notification collection (user=null, is_active=true)
 */
export const getPublicAlerts = async (req, res) => {
    try {
        const now = new Date();

        // 1. Hồ chứa: lấy tất cả bản ghi active có alert_level ≠ normal
        const reservoirAlerts = await ReservoirAlert.find({
            is_active: true,
            alert_level: { $in: ["watch", "warning", "danger"] },
        })
            .sort({ alert_level: -1, checked_at: -1 })
            .limit(20)
            .lean();

        const reservoirNotifs = reservoirAlerts.map((r) => {
            const isPriority = r.alert_level === "danger" || r.alert_level === "warning";
            return {
                _id: `res-${r._id}`,
                type: "reservoir_warning",
                priority: r.alert_level === "danger" ? 3 : r.alert_level === "warning" ? 2 : 1,
                title: r.alert_level === "danger"
                    ? `⚠️ Nguy hiểm: ${r.lake_name || `Hồ ${r.lake_id}`}`
                    : `Cảnh báo: ${r.lake_name || `Hồ ${r.lake_id}`}`,
                content: r.reason || `Hồ ${r.lake_name || r.lake_id} đang ở mức ${r.alert_level}.` +
                    (r.htl_current ? ` Mực nước: ${r.htl_current.toFixed(2)}m.` : "") +
                    (r.q_recommended ? ` Q xả khuyến nghị: ${r.q_recommended.toFixed(0)} m³/s.` : ""),
                meta: {
                    lake_id: r.lake_id,
                    lake_name: r.lake_name,
                    alert_level: r.alert_level,
                    htl_current: r.htl_current,
                    fill_pct: r.fill_pct,
                    q_in: r.q_in,
                    q_recommended: r.q_recommended,
                    actions: r.actions,
                    checked_at: r.checked_at,
                },
                read: false,
                is_active: true,
                createdAt: r.checked_at || r.created_at,
            };
        });

        // 2. System notifications (user=null, is_active=true, không hết hạn)
        const systemNotifs = await notificationRepo.model
            .find({
                user: null,
                is_active: true,
                $or: [{ expires_at: null }, { expires_at: { $gt: now } }],
            })
            .sort({ priority: -1, createdAt: -1 })
            .limit(30)
            .lean();

        // Gộp + sắp xếp theo priority desc, createdAt desc
        const allAlerts = [...reservoirNotifs, ...systemNotifs].sort((a, b) => {
            if ((b.priority || 1) !== (a.priority || 1)) return (b.priority || 1) - (a.priority || 1);
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        res.json(allAlerts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /api/notifications/system  (admin only) ────────────────────────────
/**
 * Tạo system notification (user=null → hiển thị cho tất cả người dùng)
 * Body: { type, title, content, priority, meta, expires_at }
 */
export const createSystemNotification = async (req, res) => {
    try {
        const { type, title, content, priority, meta, expires_at } = req.body;
        if (!content) return res.status(400).json({ message: "content là bắt buộc" });

        const validTypes = [
            "flood_alert", "rain_warning", "reservoir_warning", "route_warning",
        ];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ message: `type phải là: ${validTypes.join(", ")}` });
        }

        const notif = await notificationRepo.model.create({
            user: null,
            type,
            title: title || null,
            content,
            priority: priority || 1,
            meta: meta || null,
            is_active: true,
            expires_at: expires_at ? new Date(expires_at) : null,
        });
        res.status(201).json(notif);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
