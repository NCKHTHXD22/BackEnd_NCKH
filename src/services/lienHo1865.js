/**
 * Đánh giá chế độ vận hành hồ theo QĐ 1865/QĐ-TTg ngày 23/12/2019 (Quy trình vận hành liên hồ Vu Gia – Thu Bồn).
 * Lõi thuần (không truy cập CSDL), dùng trong lakeCalc.operationRecommendation() và kiểm thử.
 *
 * Giới hạn: Điều 8, 9 quyết định theo CẢ mực nước trạm (Hội Khách, Ái Nghĩa / Nông Sơn, Câu Lâu) VÀ lưu lượng về
 * hồ. Hệ thống chưa có mực nước 4 trạm này nên nếu không truyền `stations`, chỉ xét theo lưu lượng về hồ và ghi rõ.
 */
import {
    DECISION, FLOOD_SEASON, LAKES, FLOOD_LEVELS, FLOW_RULES, COORDINATING, MIN_FLOW_FLOOD_SEASON,
    DRY_PERIODS, DRY_FLOW, DRY_LEVEL_RANGES, CONTROL_STATIONS,
} from '../api/config/qd1865.js';

/** "MM-DD" theo giờ Việt Nam */
export function monthDayVN(date) {
    return new Date(date.getTime() + 7 * 3600e3).toISOString().slice(5, 10);
}
const inRange = (md, from, to) => (from <= to ? md >= from && md <= to : md >= from || md <= to);
const md2 = md => (md === '02-29' ? '02-28' : md);

export function isFloodSeason(date) {
    return inRange(monthDayVN(date), FLOOD_SEASON.start, FLOOD_SEASON.end);
}
/** Thời kỳ mùa cạn (Điều 17) */
export function dryPeriod(date) {
    const md = monthDayVN(date);
    return DRY_PERIODS.find(p => p.ranges.some(([a, b]) => inRange(md, a, b)))?.id ?? null;
}
/** Khoảng mực nước Phụ lục III ứng với ngày (mùa cạn) */
export function dryLevelRange(lakeKey, date) {
    const rows = DRY_LEVEL_RANGES[lakeKey];
    if (!rows) return null;
    const md = md2(monthDayVN(date));
    return rows.find(r => inRange(md, r.from, md2(r.to)))?.range ?? null;
}

/**
 * @param {object} o
 * @param {number|string} o.lakeId   lake_id (hoặc mã AV3, DM4B, SC2B1)
 * @param {Date}   o.date
 * @param {number} o.htl            mực nước hồ (m)
 * @param {number} o.qIn            lưu lượng về hồ (m³/s)
 * @param {boolean} [o.floodForecast]  có bản tin dự báo mưa, lũ (Điều 7.2a)
 * @param {object} [o.stations]     { aboveAlarm2: bool, aboveDecision: bool, belowAlarm1: bool } – nếu có mực nước trạm
 */
export function evaluate1865({ lakeId, date = new Date(), htl, qIn, floodForecast = null, stations = null }) {
    const key = String(lakeId);
    const lake = LAKES[key];
    if (!lake) return { applicable: false, reason: `Hồ ${lakeId} không thuộc QĐ 1865` };
    const out = { applicable: true, decision: `${DECISION.number} ngày 23/12/2019`, lake: lake.name, notes: [] };
    const flood = isFloodSeason(date);
    out.season = flood ? 'flood' : 'dry';

    if (flood) {
        const md = monthDayVN(date);
        const late = md >= '11-16';
        out.window = late ? '16/11–15/12' : '01/9–15/11';
        const lv = FLOOD_LEVELS[key];
        const rule = FLOW_RULES[key];
        if (lv) {
            out.pre_flood_max = late ? lv.pre_flood_max.late : lv.pre_flood_max.early;    // Bảng 1
            out.min_flood_level = late ? lv.min_flood_level.late : lv.min_flood_level.early; // Bảng 2
        }
        const safety = lake.safety_level ?? lake.MNDBT;                                    // Za Hung: 455,94 m
        if (rule) {
            out.flow_thresholds = { trigger: rule.trigger, maintain: rule.maintain, cut: rule.cut };
            out.control_stations = CONTROL_STATIONS[rule.stations];
            if (stations) out.station_status = stations;
            if (!stations) out.notes.push(`Chưa có mực nước trạm ${CONTROL_STATIONS[rule.stations].join(', ')} – chỉ xét theo lưu lượng về hồ`);
            const floodComing = qIn >= rule.trigger || floodForecast === true;
            if (htl >= safety && qIn >= rule.trigger) {
                out.mode = 'safety';            // Điều 11
                out.reason = 'Mực nước đạt MNDBT mà lũ về hồ còn lớn → vận hành bảo đảm an toàn công trình theo quy trình đơn hồ (Điều 11), báo Trưởng BCH PCTT&TKCN';
            } else if (qIn > rule.cut || stations?.aboveDecision) {
                out.mode = 'cut';               // Điều 8.1c / 9.1c
                out.reason = `Lưu lượng về hồ > ${rule.cut} m³/s → vận hành cắt, giảm lũ cho hạ du (xả < Q đến, không vượt MNDBT)`;
            } else if ((qIn >= rule.maintain[0] && qIn <= rule.maintain[1]) || stations?.aboveAlarm2) {
                out.mode = 'maintain';          // Điều 8.1b / 9.1b
                out.reason = `Lưu lượng về hồ ${rule.maintain[0]}–${rule.maintain[1]} m³/s → duy trì mực nước hồ (xả ≈ Q đến ±10%)`;
                out.q_out_range = [Math.round(qIn * 0.9), Math.round(qIn * 1.1)];
            } else if (floodComing && out.min_flood_level != null && htl > out.min_flood_level) {
                out.mode = 'lower';             // Điều 8.1a / 9.1a
                out.reason = `Có lũ/dự báo lũ, mực nước trạm dưới BĐ II → hạ thấp dần mực nước hồ, không thấp hơn ${out.min_flood_level} m (Bảng 2)`;
            } else if (out.pre_flood_max != null) {
                const cap = Array.isArray(out.pre_flood_max) ? out.pre_flood_max[1] : out.pre_flood_max;
                out.mode = htl > cap ? 'lower_to_pre_flood' : 'normal';
                out.reason = htl > cap
                    ? `Mực nước ${htl} m > mực nước cao nhất trước lũ ${cap} m (Bảng 1) → xả hạ dần về ${cap} m`
                    : `Vận hành bình thường; không vượt mực nước cao nhất trước lũ ${cap} m (Bảng 1)`;
                if (late && floodForecast === false && Array.isArray(out.pre_flood_max)) {
                    out.mode = 'store';         // Điều 12
                    out.reason = `Sau 15/11, không có dự báo lũ → được tích nước cuối mùa trong khoảng ${out.pre_flood_max.join('–')} m (Bảng 1), phải báo Trưởng BCH PCTT&TKCN`;
                }
            }
        } else if (COORDINATING.follow_inflow.includes(Number(key)) || COORDINATING.follow_inflow.includes(key)) {
            out.mode = htl >= safety ? 'maintain' : 'follow_inflow';  // Điều 10.1
            out.reason = htl >= safety
                ? `Đạt ${lake.safety_level ? `${safety} m` : 'MNDBT'} → duy trì mực nước, sẵn sàng chuyển chế độ an toàn công trình (Điều 10, 11)`
                : 'Khi hồ bậc trên vận hành giảm lũ: tổng lưu lượng xả ≈ lưu lượng về hồ (±10%) (Điều 10.1)';
            out.q_out_range = [Math.round(qIn * 0.9), Math.round(qIn * 1.1)];
        } else {
            out.mode = htl >= lake.MNDBT ? 'maintain' : 'cooperate';     // Điều 10.2
            out.reason = 'Phối hợp vận hành góp phần giảm lũ cho hạ du; đạt MNDBT thì duy trì mực nước (Điều 10.2)';
        }
        const mf = MIN_FLOW_FLOOD_SEASON[key];
        if (mf != null) out.min_flow = mf;                         // Điều 13 (khi vận hành bình thường)
    } else {
        const period = dryPeriod(date);
        out.dry_period = period;
        const range = dryLevelRange(key, date);
        out.level_range = range;                                   // Phụ lục III
        const df = DRY_FLOW[key];
        if (range && df?.above) {
            const pos = htl > range[1] ? 'above' : htl < range[0] ? 'below' : 'within';
            out.level_position = pos;
            const v = df[pos][period];
            out.q_out_required = Array.isArray(v) ? { from: v[0], to: v[1] } : { min: v };
            out.reason = `Mùa cạn, thời kỳ ${period}: mực nước ${pos === 'above' ? 'cao hơn' : pos === 'below' ? 'thấp hơn' : 'trong'} khoảng ${range.join('–')} m (Phụ lục III) → Q xả TB ngày ${Array.isArray(v) ? `${v[0]}–${v[1]}` : `≥ ${v}`} m³/s`;
            if (df.hours) out.notes.push(df.hours);
        } else if (df) {
            out.rule = df;
            out.reason = df.rule ?? `Mùa cạn, thời kỳ ${period}: xem quy định riêng của hồ (Điều 22–25)`;
        } else {
            out.reason = 'Mùa cạn: xả bằng lưu lượng về hồ (±10%) (Điều 25)';
        }
    }
    return out;
}
