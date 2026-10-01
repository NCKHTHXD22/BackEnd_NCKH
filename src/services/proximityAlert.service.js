/**
 * ProximityAlert Service
 *
 * Cảnh báo ngập/mưa cực lớn gần vị trí người dùng — bản sao phía server của
 * logic vốn chỉ chạy client-side trong mobile/app/(tab)/index.jsx (useEffect
 * "Kiểm tra cảnh báo"). Vấn đề của bản client-only: chỉ hoạt động khi app
 * đang mở ở foreground, tắt app là mất cảnh báo dù đúng lúc cần nhất.
 *
 * Đây KHÔNG phải theo dõi vị trí nền (background location) của hệ điều hành
 * — app chỉ gửi lastLocation lên server khi đang mở (xem PATCH /api/users/location
 * gọi từ index.jsx). Vì vậy job này chỉ cảnh báo được cho user đã mở app gần
 * đây (trong PROXIMITY_LOCATION_MAX_AGE_MS), không phải mọi lúc mọi nơi.
 * Đây là đánh đổi có chủ đích để tránh phải xin quyền "always location" (rất
 * nhạy cảm, cần justification riêng khi lên store) — coi là bước cải thiện
 * trung gian, chưa phải theo dõi nền thực sự.
 */

import User from '../core/entities/User.js';
import Post from '../core/entities/FloodPost.js';
import RainStation from '../core/entities/RainStation.js';
import { sendExpoPush } from './expoPush.service.js';

// Vị trí cũ hơn ngưỡng này coi như không còn đáng tin — bỏ qua user (tránh
// cảnh báo dựa trên nơi họ đã rời khỏi từ lâu).
const PROXIMITY_LOCATION_MAX_AGE_MS = 30 * 60 * 1000; // 30 phút
const PROXIMITY_COOLDOWN_MS = 30 * 60 * 1000;          // khớp ALERT_COOLDOWN_MS phía client
const RAIN_HEAVY_MM = 50;
const RAIN_RADIUS_KM = 5;
const RECENT_POST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;  // khớp bộ lọc 7 ngày ở index.jsx

function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class ProximityAlertService {
    async checkAllUsers() {
        const now = Date.now();
        const minLocationTime = new Date(now - PROXIMITY_LOCATION_MAX_AGE_MS);
        const postsSince = new Date(now - RECENT_POST_WINDOW_MS);

        const users = await User.find({
            allowNotification: { $ne: false },
            expoPushToken: { $ne: null },
            'lastLocation.updatedAt': { $gte: minLocationTime },
            'lastLocation.lat': { $ne: null },
        }).lean();

        if (users.length === 0) return { checked: 0, notified: 0 };

        // Dữ liệu dùng chung cho mọi user trong lượt chạy này — tránh query lại theo từng user.
        const [posts, rainStations] = await Promise.all([
            Post.find({
                status: 'approved',
                'location.latitude': { $ne: null },
                'location.longitude': { $ne: null },
                createdAt: { $gte: postsSince },
                $or: [{ floodLevel: { $gt: 0 } }, { isFrequentFlood: true }],
            }).select('location floodLevel isFrequentFlood').lean(),
            RainStation.find({ sumDepth: { $gte: RAIN_HEAVY_MM } }).select('name location sumDepth').lean(),
        ]);

        let notified = 0;
        for (const user of users) {
            const sent = await this._checkUser(user, posts, rainStations, now);
            if (sent) notified += 1;
        }
        return { checked: users.length, notified };
    }

    async _checkUser(user, posts, rainStations, now) {
        const { lat, lon } = user.lastLocation;
        const radiusKm = user.alertRadiusKm || 0.3;
        const levelCm = user.alertLevelCm || 30;
        const lastAlertMap = user.lastProximityAlertAt || {};

        const canNotify = (key) => {
            const last = lastAlertMap[key];
            return !last || (now - new Date(last).getTime()) >= PROXIMITY_COOLDOWN_MS;
        };

        // 1. NGẬP nghiêm trọng gần vị trí user
        const nearbyFlood = posts.filter((p) => {
            const d = distanceKm(lat, lon, p.location.latitude, p.location.longitude);
            if (d > radiusKm) return false;
            return (p.floodLevel >= levelCm) || p.isFrequentFlood;
        });
        if (nearbyFlood.length > 0 && canNotify('flood-nearby')) {
            const maxLevel = Math.max(...nearbyFlood.map((p) => p.floodLevel || 0));
            await this._notify(user, 'flood-nearby', {
                title: `🌊 Ngập nghiêm trọng trong ${radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km`}${maxLevel > 0 ? ` (${maxLevel}cm)` : ''}`,
                body: `${nearbyFlood.length} điểm ngập gần bạn. Hãy cẩn thận khi di chuyển!`,
            });
            return true;
        }

        // 2. MƯA cực kỳ lớn gần vị trí user
        const nearbyRain = rainStations.filter((r) => {
            if (!r.location?.lat) return false;
            return distanceKm(lat, lon, r.location.lat, r.location.lng) <= RAIN_RADIUS_KM;
        });
        if (nearbyRain.length > 0 && canNotify('rain-extreme')) {
            const maxRain = Math.max(...nearbyRain.map((r) => r.sumDepth || 0));
            await this._notify(user, 'rain-extreme', {
                title: `🌧 Mưa đặc biệt lớn ${maxRain}mm/h — ${nearbyRain.length} trạm`,
                body: 'Nguy cơ ngập cao. Không di chuyển vào vùng trũng thấp ngay lúc này.',
            });
            return true;
        }

        return false;
    }

    async _notify(user, key, { title, body }) {
        try {
            await sendExpoPush(user.expoPushToken, { title, body, data: { type: 'proximity_alert', key } });
            await User.updateOne(
                { _id: user._id },
                { $set: { [`lastProximityAlertAt.${key}`]: new Date() } }
            );
            console.log(`  📣 [ProximityAlert] ${key} → user ${user._id}`);
        } catch (err) {
            console.error(`  ❌ [ProximityAlert] gửi thất bại cho user ${user._id}: ${err.message}`);
        }
    }
}

export default new ProximityAlertService();
