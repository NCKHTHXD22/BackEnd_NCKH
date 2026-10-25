// Bước 21 – Chạy lại quy trình liên hồ QĐ 1865 trên các trận lũ thử bằng số liệu thật (lộ trình 4.3).
//
// Mỗi giờ, với 5 hồ có quy tắc lưu lượng (A Vương, Đắk Mi 4, Sông Bung 4, Sông Bung 2, Sông Tranh 2): lấy mực nước hồ,
// Q đến đo (11_event_series.py) và mực nước trạm khống chế đo (20_routing_check.py → station_events/) → gọi đúng hàm
// backend evaluate1865 (src/services/lienHo1865.js) → so chế độ khuyến nghị với cách hồ đã vận hành (Q xả đo).
// Hai lần chạy: CÓ mực nước trạm và CHỈ theo Q đến (như hệ thống khi chưa có trạm) → giá trị của số liệu trạm.
// Không có bản tin dự báo trong số liệu → floodForecast = null (chỉ xét Q đến và trạm).
//
// "Làm đúng" từng giờ (Q xả đo so với Q đến đo):
//   cut              Q xả < Q đến (đang giữ nước cắt lũ)
//   maintain         |Q xả − Q đến| ≤ 10 % Q đến
//   lower, lower_to_pre_flood   Q xả ≥ Q đến (hạ mực nước)
//   safety           không đánh giá (theo quy trình đơn hồ)
//   normal           mực nước không vượt mực nước cao nhất trước lũ (Bảng 1)
//
// Đầu ra: digital_twin/data/compute/qd1865_replay.json
// Chạy:  node digital_twin/scripts/21_qd1865_replay.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const compute = path.join(repo, 'digital_twin/data/compute');
const { evaluate1865 } = await import(pathToFileURL(path.join(repo, 'src/services/lienHo1865.js')));
const { FLOW_RULES } = await import(pathToFileURL(path.join(repo, 'src/api/config/qd1865.js')));

const GROUP = { vugia: ['HOIKHACH', 'AINGHIA'], thubon: ['NONGSON', 'CAULAU'] };
const summary = JSON.parse(fs.readFileSync(path.join(compute, 'station_levels_summary.json'), 'utf8'));
const ALARM = Object.fromEntries(summary.stations.filter(s => s.alarm).map(s => [s.station_code, s.alarm]));
const events = JSON.parse(fs.readFileSync(path.join(compute, 'events.json'), 'utf8'));
const vnDate = s => new Date(`${s}+07:00`);
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);

function stationStatus(group, levels, t) {
    const now = GROUP[group].map(c => ({ c, h: levels[c]?.[t], a: ALARM[c] })).filter(x => x.h != null && x.a);
    if (!now.length) return null;
    return {
        aboveAlarm2: now.some(x => x.h > x.a[1]),
        aboveDecision: now.some(x => x.h > (x.a[1] + x.a[2]) / 2),          // QĐ 1865 Điều 6.4
        belowAlarm1: now.every(x => x.h < x.a[0]),
    };
}

function complied(mode, qIn, qOut, htl, rec) {
    if (qIn == null || qOut == null) return null;
    switch (mode) {
        case 'cut': return qOut < qIn;
        case 'maintain': return Math.abs(qOut - qIn) <= 0.1 * qIn;
        case 'lower': case 'lower_to_pre_flood': return qOut >= qIn;
        case 'normal': {
            const cap = Array.isArray(rec.pre_flood_max) ? rec.pre_flood_max[1] : rec.pre_flood_max;
            return cap == null || htl <= cap + 0.05;
        }
        default: return null;
    }
}

const report = { note: 'Chạy lại QĐ 1865 (evaluate1865) trên số liệu thật; "đúng" = Q xả đo phù hợp chế độ khuyến nghị', events: {} };
for (const key of ['calibration', 'validation']) {
    const name = `${key}_${events[key].peak_st2.slice(0, 10).replaceAll('-', '')}`;
    const ev = JSON.parse(fs.readFileSync(path.join(compute, 'events', `${name}.json`), 'utf8'));
    const st = JSON.parse(fs.readFileSync(path.join(compute, 'station_events', `${name}.json`), 'utf8'));
    const out = {};
    for (const lakeId of Object.keys(FLOW_RULES)) {
        const d = ev.lakes[lakeId];
        if (!d) continue;
        const rule = FLOW_RULES[lakeId];
        const runs = { with_stations: {}, inflow_only: {} };
        const timeline = [];
        let stationTriggered = 0;
        for (let t = 0; t < ev.time.length; t++) {
            const htl = d.water_level[t], qIn = d.inflow[t], qOut = d.outflow[t];
            if (htl == null || qIn == null) continue;
            const date = vnDate(ev.time[t]);
            const stations = stationStatus(rule.stations, st.levels, t);
            const a = evaluate1865({ lakeId, date, htl, qIn, stations });
            const b = evaluate1865({ lakeId, date, htl, qIn });
            if (a.mode !== b.mode) stationTriggered++;
            for (const [k, r] of [['with_stations', a], ['inflow_only', b]]) {
                const m = (runs[k][r.mode] ??= { hours: 0, judged: 0, complied: 0 });
                m.hours++;
                const c = complied(r.mode, qIn, qOut, htl, r);
                if (c != null) { m.judged++; m.complied += c ? 1 : 0; }
            }
            timeline.push({ t: ev.time[t], htl, q_in: qIn, q_out: qOut, mode: a.mode, mode_inflow_only: b.mode, stations });
        }
        for (const r of Object.values(runs)) for (const m of Object.values(r)) m.complied_pct = pct(m.complied, m.judged);
        const qInMax = Math.max(...d.inflow.filter(v => v != null)), qOutMax = Math.max(...d.outflow.filter(v => v != null));
        out[lakeId] = {
            lake: evaluate1865({ lakeId, date: vnDate(ev.time[0]), htl: 0, qIn: 0 }).lake, control_stations: GROUP[rule.stations],
            q_in_peak: Math.round(qInMax), q_out_peak: Math.round(qOutMax), peak_reduction_pct: pct(qInMax - qOutMax, qInMax),
            htl_start: d.water_level.find(v => v != null), htl_max: Math.max(...d.water_level.filter(v => v != null)),
            hours_mode_changed_by_stations: stationTriggered, modes: runs, timeline,
        };
    }
    report.events[name] = out;
}
fs.writeFileSync(path.join(compute, 'qd1865_replay.json'), JSON.stringify(report, null, 1));

for (const [name, lakes] of Object.entries(report.events)) {
    console.log(`\n${name}`);
    console.table(Object.values(lakes).map(l => ({
        hồ: l.lake, 'Q đến đỉnh': l.q_in_peak, 'Q xả đỉnh': l.q_out_peak, 'giảm đỉnh %': l.peak_reduction_pct,
        'giờ đổi do trạm': l.hours_mode_changed_by_stations,
        'chế độ (giờ, % đúng)': Object.entries(l.modes.with_stations).map(([m, v]) => `${m} ${v.hours}h ${v.complied_pct ?? '–'}%`).join(' · '),
    })));
}
