/**
 * Tháp báo ngập / báo lũ tự động – Hệ thống quan trắc tự động mực nước VRain (https://mucnuoc.vrain.vn).
 * Cần tài khoản (VRAIN_USERNAME / VRAIN_PASSWORD trong .env). Số liệu = độ sâu ngập tại tháp (m).
 *   POST /api/vwater/public/v1/login                    → cookie phiên
 *   GET  /api/vwater/private/v1/stats/summary            → danh sách tháp + độ sâu hiện tại
 *   GET  /api/vwater/private/v1/stats/details?groupID=&from=YYYY-MM-DD&to=YYYY-MM-DD&interval=1
 *        → chuỗi theo giờ (interval 0: 10 phút, 1: giờ, 5: ngày); timePoint dạng "HH:mm dd/MM" (không có năm)
 * Server xác định tổ chức qua Referer/Origin – thiếu sẽ báo "unable to resolve domain".
 */
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import FloodTower from '../core/entities/FloodTower.js';
import { saveObservations } from './pcttHydro.service.js';
import { ENV } from '../api/config/env.js';

const BASE = 'https://mucnuoc.vrain.vn/api/vwater';

export async function vrainClient() {
    if (!ENV.VRAIN_USERNAME || !ENV.VRAIN_PASSWORD) throw new Error('Thiếu VRAIN_USERNAME / VRAIN_PASSWORD trong .env');
    const c = wrapper(axios.create({
        baseURL: BASE, jar: new CookieJar(), timeout: 180000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36', Referer: 'https://mucnuoc.vrain.vn/', Origin: 'https://mucnuoc.vrain.vn' },
    }));
    const { data } = await c.post('/public/v1/login', { username: ENV.VRAIN_USERNAME, password: ENV.VRAIN_PASSWORD });
    return { client: c, groupId: data.authorizedCity };
}

/**
 * "HH:mm dd/MM" → Date (UTC), năm suy từ khoảng truy vấn: lấy năm của `from`, nếu tháng nhỏ hơn tháng của `from`
 * (khoảng vắt qua năm mới) thì cộng 1 năm.
 */
export function parseTimePoint(tp, from) {
    const m = String(tp).match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})$/);
    if (!m) return null;
    const [hh, mi, dd, mo] = m.slice(1).map(Number);
    const fromVN = new Date(from.getTime() + 7 * 3600e3);
    let year = fromVN.getUTCFullYear();
    if (mo < fromVN.getUTCMonth() + 1) year += 1;
    return new Date(Date.UTC(year, mo - 1, dd, hh - 7, mi));
}

const vnDate = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);

/** Độ sâu (m) hoặc null – VRain ghi "-999.0" khi tháp không có số liệu (chưa lắp, mất kết nối) */
export function toDepth(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Chuyển số liệu chi tiết thành danh sách quan trắc (mã FT + mã trạm VRain) */
export function detailsToObservations(details, from, codeBySid) {
    const out = [];
    for (const t of details.stats ?? []) {
        const time = parseTimePoint(t.timePoint, from);
        if (!time) continue;
        for (const s of t.stations ?? []) {
            const v = toDepth(s.depth);
            const code = codeBySid[s.sid];
            if (code && v != null) out.push({ station_code: code, t_obs: time, level: v, quantity: 'flood_depth', source: 'mucnuoc.vrain.vn', datum: 'độ sâu ngập so với mặt đất tại tháp' });
        }
    }
    return out;
}

export async function syncTowers(client) {
    const { data } = await client.get('/private/v1/stats/summary');
    const stats = (data ?? []).flatMap(g => g.stats ?? []);
    let created = 0, updated = 0;
    const codeBySid = {};
    for (const s of stats) {
        const code = `FT${s.stationCode}`;
        codeBySid[s.sid] = code;
        const fields = {
            name: s.stationName, code, sid: s.sid, tower_type: s.waterStationType, area: s.area, address: s.address,
            location: { lat: s.lat, lng: s.lng }, floodLevel: toDepth(s.currDepth), source: 'mucnuoc.vrain.vn',
        };
        const doc = await FloodTower.findOne({ code });
        if (doc) { await FloodTower.updateOne({ _id: doc._id }, { $set: fields }); updated++; }
        else { await new FloodTower(fields).save(); created++; }
    }
    return { towers: stats.length, created, updated, codeBySid };
}

/** Đồng bộ tháp + số liệu theo giờ trong [from, to] (mặc định 2 ngày gần nhất); khoảng dài chia theo 7 ngày */
export async function syncVrain({ from = new Date(Date.now() - 2 * 86400e3), to = new Date() } = {}) {
    const { client, groupId } = await vrainClient();
    const t = await syncTowers(client);
    let observations = 0, upserted = 0;
    for (let a = new Date(from); a <= to; a = new Date(a.getTime() + 7 * 86400e3)) {
        const b = new Date(Math.min(to.getTime(), a.getTime() + 6 * 86400e3));
        const { data } = await client.get('/private/v1/stats/details', { params: { groupID: groupId, from: vnDate(a), to: vnDate(b), interval: 1 } });
        const obs = detailsToObservations(data, a, t.codeBySid);
        observations += obs.length;
        upserted += (await saveObservations(obs, { stationModel: FloodTower, levelField: 'floodLevel' })).upserted;
    }
    return { towers: t.towers, created: t.created, updated: t.updated, observations, upserted };
}
