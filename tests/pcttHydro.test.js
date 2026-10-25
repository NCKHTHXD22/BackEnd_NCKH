// Kiểm thử bộ đọc bảng thủy văn pctt.danang.gov.vn. Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHydroTable, parseVNTime, toNumber } from '../src/services/pcttHydro.service.js';

const HEAD = ['Cấp báo động', 'Hiệp Đức', 'Nông Sơn', 'Giao Thủy', 'Câu lâu', 'Hội An', 'Thành Mỹ', 'Hội Khách', 'Hà Tân', 'Ái Nghĩa', 'Cẩm Lệ', 'Kỳ Phú'];
const row = cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
const html = rows => `<table id="dnn_ctr1189_Main_rg_danhsach_ctl00"><thead><tr>${HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
// Ba dòng ngưỡng đúng như trang ngày 25/10/2026
const ALARMS = [
    row(['Báo động I', '26', '11', '6,5', '2', '1', '15', '14,5', '', '6,5', '1', '1,7']),
    row(['Báo động II', '28', '13', '7,5', '3', '1,5', '19', '15,5', '', '8', '2', '2,2']),
    row(['Báo động III', '30', '15', '8,8', '4', '2', '22', '16,5', '', '9', '2,5', '2,7']),
];

test('đọc ngưỡng báo động 11 trạm', () => {
    const p = parseHydroTable(html(ALARMS));
    assert.equal(p.stations.length, 11);
    assert.deepEqual(p.thresholds.NONGSON, { level1: 11, level2: 13, level3: 15 });
    assert.deepEqual(p.thresholds.HOIKHACH, { level1: 14.5, level2: 15.5, level3: 16.5 });
    assert.deepEqual(p.thresholds.AINGHIA, { level1: 6.5, level2: 8, level3: 9 });
    assert.deepEqual(p.thresholds.CAULAU, { level1: 2, level2: 3, level3: 4 });
    assert.equal(p.thresholds.HATAN, undefined);          // trang để trống
    assert.equal(p.observations.length, 0);
});

test('đọc dòng mực nước nếu trang có', () => {
    const p = parseHydroTable(html([...ALARMS,
        row(['29/10/2025 13:00', '27,1', '14,2', '8', '3,6', '1,9', '18', '15,9', '', '8,7', '1,8', '2']),
        row(['14h 29/10/2025', '', '14,4', '', '', '', '', '', '', '', '', '']),
        row(['không phải ngày', '1', '1', '1', '1', '1', '1', '1', '', '1', '1', '1'])]));
    assert.equal(p.unparsed, 1);
    const ns = p.observations.filter(o => o.station_code === 'NONGSON');
    assert.deepEqual(ns.map(o => o.level), [14.2, 14.4]);
    assert.equal(ns[0].t_obs.toISOString(), '2025-10-29T06:00:00.000Z');   // 13:00 giờ VN
    assert.equal(ns[1].t_obs.toISOString(), '2025-10-29T07:00:00.000Z');
});

test('chuyển số và thời gian kiểu Việt Nam', () => {
    assert.equal(toNumber('6,5'), 6.5);
    assert.equal(toNumber(''), null);
    assert.equal(toNumber('1.234,5'), 1234.5);
    assert.equal(parseVNTime('25/10/2026').toISOString(), '2026-10-24T17:00:00.000Z');
    assert.equal(parseVNTime('07:30 25/10/2026').toISOString(), '2026-10-25T00:30:00.000Z');
    assert.equal(parseVNTime('abc'), null);
});

import { parseTimePoint, detailsToObservations, toDepth } from '../src/services/vrainFlood.service.js';

test('VRain: "HH:mm dd/MM" suy năm theo khoảng truy vấn, kể cả vắt qua năm mới', () => {
    const from = new Date('2025-10-26T00:00:00+07:00');
    assert.equal(parseTimePoint('03:00 30/10', from).toISOString(), '2025-10-29T20:00:00.000Z');
    const dec = new Date('2025-12-30T00:00:00+07:00');
    assert.equal(parseTimePoint('01:00 02/01', dec).toISOString(), '2026-01-01T18:00:00.000Z');
    assert.equal(parseTimePoint('abc', from), null);
});

test('VRain: chuyển chi tiết thành quan trắc độ sâu ngập theo mã tháp', () => {
    const from = new Date('2025-10-26T00:00:00+07:00');
    const details = { stats: [{ timePoint: '03:00 30/10', stations: [{ sid: 'a', depth: '2.52' }, { sid: 'b', depth: '0.0' }, { sid: 'c', depth: '-999.0' }, { sid: 'd', depth: '' }, { sid: 'x', depth: '1' }] }] };
    const obs = detailsToObservations(details, from, { a: 'FT1', b: 'FT2', c: 'FT3', d: 'FT4' });
    assert.deepEqual(obs.map(o => [o.station_code, o.level, o.quantity]), [['FT1', 2.52, 'flood_depth'], ['FT2', 0, 'flood_depth']]);
});

test('VRain: -999 / rỗng là không có số liệu, không phải 0 m', () => {
    assert.equal(toDepth('-999.0'), null);
    assert.equal(toDepth(''), null);
    assert.equal(toDepth(null), null);
    assert.equal(toDepth('0.0'), 0);
    assert.equal(toDepth(1.93), 1.93);
});
