import { rainStationRepo } from "../infrastructure/repositories/rainStation.repo.js";
import { rainHistoryRepo } from "../infrastructure/repositories/rainHistory.repo.js";

export const rainStationService = {

    getAll: () => rainStationRepo.findAll(),

    getByUUID: (uuid) => rainStationRepo.findOne({ uuid }),

    upsertFromVrain: async (item) => {
        const s = item.station;

        // 🔒 FIX LỖI: đảm bảo city là object hợp lệ
        const safeCity = {
            id: Number(s.city?.id) || null,
            name: s.city?.name || "",
            type: s.city?.type || ""
        };

        // 🔒 FIX LỖI: đảm bảo area là object hợp lệ
        const safeArea = {
            id: Number(s.area?.id) || null,
            name: s.area?.name || "",
            type: s.area?.type || ""
        };

        // 🔧 Dữ liệu chuẩn theo schema
        const data = {
            uuid: s.uuid,
            name: s.name || "",
            address: s.address || "",

            location: {
                lat: Number(s.lat) || 0,
                lng: Number(s.lng) || 0
            },

            city: safeCity,
            area: safeArea,

            level: item.level || "",
            color: item.color || "",
            sumDepth: Number(item.sumDepth) || 0,

            lastUpdate: new Date()
        };

        // 1) cập nhật realtime
        const station = await rainStationRepo.upsertByUUID(data);

        // 2) lưu lịch sử theo giờ
        await rainHistoryRepo.create({
            uuid: data.uuid,
            name: data.name,
            sumDepth: data.sumDepth,
            level: data.level,
            color: data.color,
            timestamp: new Date()
        });

        return station;
    },

    deleteManyNotIn: (uuidList) => {
        return rainStationRepo.deleteMany({
            uuid: { $nin: uuidList }
        });
    }
};
