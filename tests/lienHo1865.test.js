// Kiểm thử quy tắc vận hành theo QĐ 1865/QĐ-TTg. Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate1865, isFloodSeason, dryPeriod, dryLevelRange } from '../src/services/lienHo1865.js';
import { ZFW, LAKES } from '../src/api/config/qd1865.js';
import { LAKE_SPECS, ZV_CURVES } from '../src/script/lakeSpecsData.js';

const vn = s => new Date(`${s}T12:00:00+07:00`);

test('mùa lũ 01/9–15/12, mùa cạn 16/12–31/8 (Điều 2)', () => {
    assert.equal(isFloodSeason(vn('2025-09-01')), true);
    assert.equal(isFloodSeason(vn('2025-12-15')), true);
    assert.equal(isFloodSeason(vn('2025-12-16')), false);
    assert.equal(isFloodSeason(vn('2026-08-31')), false);
});

test('thời kỳ mùa cạn (Điều 17)', () => {
    assert.equal(dryPeriod(vn('2025-12-20')), 'I');
    assert.equal(dryPeriod(vn('2026-03-01')), 'II');
    assert.equal(dryPeriod(vn('2026-04-20')), 'I');
    assert.equal(dryPeriod(vn('2026-05-20')), 'III');
    assert.equal(dryPeriod(vn('2026-07-15')), 'IV');
});

test('Sông Tranh 2: ngưỡng 900 / 1.500 m³/s (Điều 9)', () => {
    const d = vn('2025-10-20');
    assert.equal(evaluate1865({ lakeId: 4, date: d, htl: 170, qIn: 1800 }).mode, 'cut');
    assert.equal(evaluate1865({ lakeId: 4, date: d, htl: 170, qIn: 1200 }).mode, 'maintain');
    const low = evaluate1865({ lakeId: 4, date: d, htl: 170, qIn: 500, floodForecast: true });
    assert.equal(low.mode, 'lower');
    assert.equal(low.min_flood_level, 165.0);
    assert.equal(evaluate1865({ lakeId: 4, date: d, htl: 175, qIn: 2000 }).mode, 'safety');
});

test('Bảng 1, Bảng 2 theo hai giai đoạn mùa lũ', () => {
    const a = evaluate1865({ lakeId: 1, date: vn('2025-10-01'), htl: 377, qIn: 100 });
    assert.equal(a.pre_flood_max, 376.0);
    assert.equal(a.mode, 'lower_to_pre_flood');
    const b = evaluate1865({ lakeId: 1, date: vn('2025-11-20'), htl: 378, qIn: 100, floodForecast: false });
    assert.deepEqual(b.pre_flood_max, [377.0, 380.0]);
    assert.equal(b.min_flood_level, 377.0);
    assert.equal(b.mode, 'store');
});

test('hồ phối hợp và Za Hung 455,94 m (Điều 10)', () => {
    assert.equal(evaluate1865({ lakeId: 12, date: vn('2025-10-29'), htl: 71, qIn: 5000 }).mode, 'follow_inflow');
    assert.equal(evaluate1865({ lakeId: 13, date: vn('2025-10-29'), htl: 456, qIn: 900 }).mode, 'maintain');
    assert.equal(evaluate1865({ lakeId: 13, date: vn('2025-10-29'), htl: 452, qIn: 900 }).mode, 'follow_inflow');
});

test('mùa cạn: khoảng mực nước Phụ lục III và lưu lượng xả (Điều 19, 21)', () => {
    assert.deepEqual(dryLevelRange('1', vn('2026-01-15')), [375.5, 378.3]);
    assert.deepEqual(dryLevelRange('4', vn('2026-08-25')), [143.2, 145.1]);
    const r = evaluate1865({ lakeId: 4, date: vn('2026-05-15'), htl: 160, qIn: 40 });
    assert.equal(r.dry_period, 'III');
    assert.equal(r.level_position, 'below');
    assert.deepEqual(r.q_out_required, { from: 70, to: 80 });
    const a = evaluate1865({ lakeId: 1, date: vn('2026-01-15'), htl: 379, qIn: 20 });
    assert.deepEqual(a.q_out_required, { min: 22 });
});

test('hồ ngoài QĐ trả về không áp dụng', () => {
    assert.equal(evaluate1865({ lakeId: 999, htl: 1, qIn: 1 }).applicable, false);
});

test('bảng Z-W chính thức khớp dung tích Phụ lục I', () => {
    for (const [id, t] of Object.entries(ZFW)) {
        const L = LAKES[id];
        const w = z => { let i = 0; while (i < t.z.length - 2 && t.z[i + 1] < z) i++; return t.w[i] + (z - t.z[i]) / (t.z[i + 1] - t.z[i]) * (t.w[i + 1] - t.w[i]); };
        assert.ok(Math.abs(w(L.MNDBT) - L.W_total) < 0.2, `${L.name} W(MNDBT)`);
        assert.ok(Math.abs(w(L.MNC) - L.W_dead) < 0.2, `${L.name} W(MNC)`);
    }
});

test('lakeSpecsData theo QĐ 1865: MNC < MNDBT ≤ MNGC ≤ đỉnh đập', () => {
    for (const s of LAKE_SPECS) {
        assert.ok(s.MNC <= s.MNDBT && s.MNDBT <= s.MNGC && s.MNGC <= s.crest + 0.01, `${s.name}`);
        assert.ok(s.tailwater_elev < s.MNC + 0.01, `${s.name} hạ lưu < MNC`);
        assert.match(s.regulation_doc, /1865\/QĐ-TTg ngày 23\/12\/2019/);
    }
    assert.equal(ZV_CURVES.length, 5);
});

test('mực nước trạm vượt mức quyết định → cắt, giảm lũ dù Q chưa tới ngưỡng (Điều 9.1c)', () => {
    const r = evaluate1865({ lakeId: 4, date: vn('2025-10-20'), htl: 170, qIn: 600,
        stations: { aboveAlarm2: true, aboveDecision: true, belowAlarm1: false, stations: [] } });
    assert.equal(r.mode, 'cut');
    assert.ok(r.station_status);
    const m = evaluate1865({ lakeId: 4, date: vn('2025-10-20'), htl: 170, qIn: 600,
        stations: { aboveAlarm2: true, aboveDecision: false, belowAlarm1: false, stations: [] } });
    assert.equal(m.mode, 'maintain');
});
