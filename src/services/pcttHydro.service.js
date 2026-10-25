/**
 * Lấy số liệu trạm thủy văn từ https://pctt.danang.gov.vn/so-lieu/thuy-van (Ban Chỉ huy PCTT thành phố Đà Nẵng).
 *
 * Trang là ASP.NET WebForms (Telerik RadGrid): mở trang → điền ngày → bấm "Lọc dữ liệu" (postback).
 * Bảng gồm 3 dòng ngưỡng Báo động I/II/III và (nếu có) các dòng mực nước theo thời điểm.
 * Kiểm tra 25/10/2026 bằng Chrome thật: trang chỉ trả 3 dòng ngưỡng, KHÔNG có dòng số liệu cho mọi khoảng ngày
 * (kể cả xuất Excel). Bộ lấy vẫn đọc dòng số liệu nếu trang có lại, và ghi số dòng không đọc được để theo dõi.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import WaterLevelStation from '../core/entities/WaterLevelStation.js';
import WaterLevelObservation from '../core/entities/WaterLevelObservation.js';
import { CONTROL_STATIONS } from '../api/config/qd1865.js';

export const PCTT_HYDRO_URL = 'https://pctt.danang.gov.vn/so-lieu/thuy-van';
const P = 'dnn$ctr1189$Main$';

// Tên cột trên trang → mã trạm. Tọa độ: điểm bắt trên mạng sông (digital_twin/data/compute/network.json), gần đúng;
// Hiệp Đức, Hội Khách theo VNDMS (3 chữ số thập phân, sai số ~100 m).
export const STATIONS = {
    'Hiệp Đức':  { code: 'HIEPDUC',  river: 'Thu Bồn', lat: 15.576, lng: 108.040 },
    'Nông Sơn':  { code: 'NONGSON',  river: 'Thu Bồn', lat: 15.69786, lng: 108.02949 },
    'Giao Thủy': { code: 'GIAOTHUY', river: 'Thu Bồn', lat: 15.83819, lng: 108.10944 },
    'Câu lâu':   { code: 'CAULAU',   display: 'Câu Lâu', river: 'Thu Bồn', lat: 15.86253, lng: 108.27163 },
    'Hội An':    { code: 'HOIAN',    river: 'Thu Bồn', lat: 15.87072, lng: 108.32548 },
    'Thành Mỹ':  { code: 'THANHMY',  river: 'Vu Gia (Cái)', lat: 15.76792, lng: 107.82986 },
    'Hội Khách': { code: 'HOIKHACH', river: 'Vu Gia', lat: 15.817, lng: 107.825 },
    'Hà Tân':    { code: 'HATAN' },
    'Ái Nghĩa':  { code: 'AINGHIA',  river: 'Vu Gia (Ái Nghĩa)', lat: 15.88350, lng: 108.11367 },
    'Cẩm Lệ':    { code: 'CAMLE',    river: 'Cẩm Lệ', lat: 16.00119, lng: 108.19630 },
    'Kỳ Phú':    { code: 'KYPHU' },
};
const norm = s => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const BY_NAME = Object.fromEntries(Object.entries(STATIONS).map(([k, v]) => [norm(k), { name: k, ...v }]));

export const toNumber = s => {
    const t = String(s ?? '').trim().replace(/\s/g, '');
    if (!t || t === '-') return null;
    const v = Number(t.replace(/\./g, t.includes(',') ? '' : '.').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
};

/** Thời điểm kiểu Việt Nam ("25/10/2026 13:00", "13h 25/10/2026", "13:00 25/10/2026", "25/10/2026") → Date (UTC) */
export function parseVNTime(s) {
    const t = String(s ?? '').normalize('NFC').trim();
    const d = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!d) return null;
    const h = t.replace(d[0], ' ').match(/(\d{1,2})\s*(?:[:hg]|giờ)\s*(\d{1,2})?/i);
    const [hh, mm] = h ? [Number(h[1]), Number(h[2] ?? 0)] : [0, 0];
    if (hh > 23 || mm > 59) return null;
    return new Date(Date.UTC(Number(d[3]), Number(d[2]) - 1, Number(d[1]), hh - 7, mm));
}

/** Đọc bảng kết quả: ngưỡng báo động + dòng mực nước (nếu có). */
export function parseHydroTable(html) {
    const $ = cheerio.load(html);
    const table = $('#dnn_ctr1189_Main_rg_danhsach_ctl00');
    const head = table.find('thead th').map((_, th) => $(th).text().trim()).get();
    const cols = head.slice(1).map(h => BY_NAME[norm(h)] ?? null);
    const thresholds = {};
    const observations = [];
    let unparsed = 0;
    table.find('> tbody > tr').each((_, tr) => {
        const cells = $(tr).children('td').map((__, td) => $(td).text().trim()).get();
        if (cells.length < 2) return;
        const first = norm(cells[0]);
        const alarm = first.match(/^báo động (i{1,3})$/);
        if (alarm) {
            const key = `level${alarm[1].length}`;
            cols.forEach((st, i) => {
                if (!st) return;
                const v = toNumber(cells[i + 1]);
                if (v != null) (thresholds[st.code] ??= {})[key] = v;
            });
            return;
        }
        const t = parseVNTime(cells[0]);
        if (!t) { unparsed++; return; }
        cols.forEach((st, i) => {
            const v = toNumber(cells[i + 1]);
            if (st && v != null) observations.push({ station_code: st.code, t_obs: t, level: v });
        });
    });
    return { columns: head, stations: cols.filter(Boolean), thresholds, observations, unparsed };
}

const vnDate = d => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);

/** Tải trang và (nếu có ngày) gửi postback "Lọc dữ liệu" */
export async function fetchHydroHtml(from, to) {
    const client = wrapper(axios.create({
        jar: new CookieJar(), timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
    }));
    const page = await client.get(PCTT_HYDRO_URL);
    if (!from) return page.data;
    const $ = cheerio.load(page.data);
    const form = {};
    $('input').each((_, el) => { const n = $(el).attr('name'); if (n) form[n] = $(el).attr('value') ?? ''; });
    const setDate = (key, iso) => {
        const dmy = iso.split('-').reverse().join('/');
        const tel = `${iso}-00-00-00`;
        form[`${P}${key}`] = iso;
        form[`${P}${key}$dateInput`] = dmy;
        form[`dnn_ctr1189_Main_${key}_dateInput_ClientState`] = JSON.stringify({
            enabled: true, emptyMessage: '', validationText: tel, valueAsString: tel,
            minDateStr: '2000-01-01-00-00-00', maxDateStr: '2050-01-01-00-00-00', lastSetTextBoxValue: dmy,
        });
    };
    setDate('rcal_TuNgay', vnDate(from));
    setDate('rcal_DenNgay', vnDate(to));
    form[`${P}rbtn_timkiem`] = '';
    const res = await client.post(PCTT_HYDRO_URL, new URLSearchParams(form).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: PCTT_HYDRO_URL } });
    return res.data;
}

/** Ghi danh mục trạm + ngưỡng báo động; trạm mới tạo bằng save() để được cấp `id` như các trạm cũ. */
export async function saveStations(parsed) {
    let created = 0, updated = 0;
    for (const st of parsed.stations) {
        const th = parsed.thresholds[st.code] ?? {};
        const decision = th.level2 != null && th.level3 != null ? Math.round((th.level2 + th.level3) / 2 * 100) / 100 : null;
        const fields = {
            name: st.display ?? st.name, code: st.code, kind: 'river_kttv', river: st.river, source: PCTT_HYDRO_URL,
            thresholds: { level1: th.level1 ?? null, level2: th.level2 ?? null, level3: th.level3 ?? null },
            decision_level: decision, thresholds_updated_at: new Date(),
            ...(st.lat != null && { location: { lat: st.lat, lng: st.lng }, location_note: 'Gần đúng: điểm bắt trên mạng sông – cần xác nhận tọa độ trạm' }),
        };
        const doc = await WaterLevelStation.findOne({ code: st.code });
        if (doc) { await WaterLevelStation.updateOne({ _id: doc._id }, { $set: fields }); updated++; }
        else { await new WaterLevelStation({ ...fields, level: null }).save(); created++; }
    }
    return { created, updated };
}

/** Ghi quan trắc (bỏ qua bản ghi trùng) và cập nhật giá trị mới nhất của trạm (mặc định WaterLevelStation.level) */
export async function saveObservations(observations, { stationModel = WaterLevelStation, levelField = 'level' } = {}) {
    if (!observations.length) return { upserted: 0 };
    const ops = observations.map(o => ({
        updateOne: { filter: { station_code: o.station_code, t_obs: o.t_obs }, update: { $setOnInsert: { ...o, t_recv: new Date() } }, upsert: true },
    }));
    const r = await WaterLevelObservation.bulkWrite(ops, { ordered: false });
    const latest = {};
    for (const o of observations) if (!latest[o.station_code] || o.t_obs > latest[o.station_code].t_obs) latest[o.station_code] = o;
    for (const o of Object.values(latest)) {
        await stationModel.updateOne({ code: o.station_code, $or: [{ level_time: null }, { level_time: { $lt: o.t_obs } }] },
            { $set: { [levelField]: o.level, level_time: o.t_obs } });
    }
    return { upserted: r.upsertedCount ?? 0 };
}

/** Đồng bộ: ngưỡng + số liệu trong [from, to] (mặc định 2 ngày gần nhất) */
export async function syncPcttHydro({ from = new Date(Date.now() - 2 * 86400e3), to = new Date() } = {}) {
    const parsed = parseHydroTable(await fetchHydroHtml(from, to));
    if (!parsed.stations.length) throw new Error('Không đọc được bảng trạm thủy văn trên trang PCTT (giao diện có thể đã đổi)');
    await WaterLevelObservation.init();   // bảo đảm có index duy nhất (station_code, t_obs) trước khi ghi
    const st = await saveStations(parsed);
    const ob = await saveObservations(parsed.observations);
    return { ...st, observations: parsed.observations.length, upserted: ob.upserted, unparsed_rows: parsed.unparsed };
}

/**
 * Trạng thái các trạm quyết định vận hành theo QĐ 1865 (Điều 6, 8, 9) cho một nhóm ('vugia' | 'thubon').
 * Chỉ dùng số liệu trong vòng `maxAgeH` giờ; không có số liệu → null (quy tắc chỉ xét lưu lượng về hồ).
 */
export async function controlStationStatus(group, { maxAgeH = 3, now = new Date() } = {}) {
    const names = CONTROL_STATIONS[group];
    if (!names) return null;
    const codes = names.map(n => BY_NAME[norm(n)]?.code).filter(Boolean);   // tra theo mã: trang ghi "Câu lâu", QĐ ghi "Câu Lâu"
    const docs = await WaterLevelStation.find({ code: { $in: codes } }).lean();
    const fresh = docs.filter(d => d.level != null && d.level_time && now - new Date(d.level_time) <= maxAgeH * 3600e3 && d.thresholds?.level2 != null);
    if (!fresh.length) return null;
    return {
        aboveAlarm2: fresh.some(d => d.level > d.thresholds.level2),
        aboveDecision: fresh.some(d => d.decision_level != null && d.level > d.decision_level),
        belowAlarm1: fresh.every(d => d.thresholds.level1 != null && d.level < d.thresholds.level1),
        stations: fresh.map(d => ({ name: d.name, level: d.level, time: d.level_time, thresholds: d.thresholds, decision_level: d.decision_level })),
    };
}
