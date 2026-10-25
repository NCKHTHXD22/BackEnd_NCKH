/**
 * Trạm đo mực nước tự động trên bản đồ mưa ngập TP Đà Nẵng (https://muangap.danang.gov.vn, API công khai
 * muangap-api.danang.gov.vn). Gồm "Trạm đo mực nước" (sông) và "Trạm đo mực nước hồ".
 * API chỉ cho giá trị HIỆN TẠI (depth, depthUpdatedAt) → job lấy hàng giờ để tích lũy chuỗi số liệu.
 * Kiểm tra 25/10/2026: 8 trạm sông + 5 trạm hồ; 5 trạm chưa từng cập nhật; mức báo động để 0 (chưa khai báo).
 */
import axios from 'axios';
import WaterLevelStation from '../core/entities/WaterLevelStation.js';
import { saveObservations } from './pcttHydro.service.js';

const API = 'https://muangap-api.danang.gov.vn/v2/client';
const KIND = { water_level: 'river_auto', reservoir_waterlevel: 'reservoir_auto' };
const http = axios.create({
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36', Origin: 'https://muangap.danang.gov.vn', Referer: 'https://muangap.danang.gov.vn/' },
});

/** Danh sách trạm mực nước (sông + hồ) kèm số liệu hiện tại */
export async function fetchMuangapStations() {
    const [types, list] = await Promise.all([http.get(`${API}/water_station/type`), http.get(`${API}/water_station/list_all`)]);
    const kindOf = Object.fromEntries(types.data.map(t => [t._id, KIND[t.code]]));
    const out = [];
    for (const s of list.data) {
        const kind = kindOf[s.waterStationTypeId];
        if (!kind) continue;                                     // bỏ tháp báo ngập/lũ (lấy từ VRain)
        const { data: d } = await http.get(`${API}/water_station/detail`, { params: { waterStationId: s.id } });
        out.push({
            code: `MG${s.code}`, name: d.waterStationName ?? s.name, kind,
            lat: Number(s.latitude), lng: Number(s.longitude), address: d.address ?? s.address, area: s.area,
            level: d.depthUpdatedAt ? Number(d.depth) : null,
            level_time: d.depthUpdatedAt ? new Date(d.depthUpdatedAt * 1000) : null,
            thresholds: [d.alarmLevel1, d.alarmLevel2, d.alarmLevel3].some(v => v > 0)
                ? { level1: d.alarmLevel1 || null, level2: d.alarmLevel2 || null, level3: d.alarmLevel3 || null } : null,
        });
    }
    return out;
}

/**
 * @param {boolean} locateEmpty  false: chưa gắn tọa độ cho trạm chưa có số liệu – bản web cũ hiển thị `level || 0`
 *                               nên trạm trống sẽ hiện "0 m" trên bản đồ (dùng cho tới khi deploy HomePage mới).
 */
export async function syncMuangap({ locateEmpty = true } = {}) {
    const stations = await fetchMuangapStations();
    let created = 0, updated = 0;
    for (const s of stations) {
        const located = locateEmpty || s.level != null;
        const fields = {
            name: s.name, code: s.code, kind: s.kind, source: 'muangap.danang.gov.vn', river: s.address,
            location_note: `Tọa độ theo muangap.danang.gov.vn: ${s.lat}, ${s.lng}`,
            ...(located && { location: { lat: s.lat, lng: s.lng } }),
            ...(s.thresholds && { thresholds: s.thresholds, thresholds_updated_at: new Date() }),
        };
        const doc = await WaterLevelStation.findOne({ code: s.code });
        if (doc) {
            await WaterLevelStation.updateOne({ _id: doc._id }, { $set: fields, ...(!located && { $unset: { location: 1 } }) });
            updated++;
        } else { await new WaterLevelStation({ ...fields, level: null }).save(); created++; }
    }
    // Trạm KTTV Hà Tân (PCTT) chưa có tọa độ – trùng vị trí trạm tự động "Cầu Hà Tân" trên muangap
    const haTan = stations.find(s => /Hà Tân/.test(s.name));
    if (haTan && locateEmpty) {
        await WaterLevelStation.updateOne({ code: 'HATAN', 'location.lat': { $exists: false } },
            { $set: { location: { lat: haTan.lat, lng: haTan.lng }, location_note: 'Lấy theo trạm "Cầu Hà Tân" trên muangap – cần xác nhận' } });
    }
    const obs = stations.filter(s => s.level != null)
        .map(s => ({ station_code: s.code, t_obs: s.level_time, level: s.level, source: 'muangap.danang.gov.vn', datum: 'theo trạm (muangap)' }));
    const r = await saveObservations(obs);
    return { stations: stations.length, created, updated, with_data: obs.length, upserted: r.upserted };
}
