// Kiểm thử lõi cân bằng nước hồ chứa (lộ trình 4.1). Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateReservoir, interpVolume, levelFromVolume } from '../src/services/reservoirSim.js';
import lakeCalcService from '../src/services/lakeCalc.service.js';

// Bảng Z-V Sông Tranh 2 (src/script/seedLakeSpecs.js)
const ST2 = [
    { z: 155.0, volume: 195 }, { z: 158.0, volume: 215 }, { z: 160.0, volume: 228 }, { z: 163.0, volume: 250 },
    { z: 165.0, volume: 270 }, { z: 167.0, volume: 295 }, { z: 168.0, volume: 310 }, { z: 170.0, volume: 340 },
    { z: 172.0, volume: 375 }, { z: 174.0, volume: 420 }, { z: 175.0, volume: 470 }, { z: 176.5, volume: 540 },
    { z: 177.0, volume: 685 },
];
const SPEC = { MNC: 158, MNDBT: 175, MNGC: 176.5 };

// Thuật toán waterBalance trước khi sửa (q_out cố định) – làm mốc so sánh
function legacy(pts, htl_now, q_in_series, q_out, dt_hours = 1) {
    pts = [...pts].sort((a, b) => a.z - b.z);
    let vol = interpVolume(pts, htl_now);
    return q_in_series.map((entry, step) => {
        const q_in = typeof entry === 'object' ? entry.value : entry;
        const dt = typeof entry === 'object' ? entry.dt_hours : dt_hours;
        vol = Math.max(pts[0].volume, vol + (q_in - q_out) * dt * 3600 / 1e6);
        return { hour_offset: (step + 1) * dt, htl: levelFromVolume(pts, vol), volume: vol };
    });
}

test('q_out cố định cho kết quả giống hệt thuật toán cũ', () => {
    const qIn = Array.from({ length: 72 }, (_, i) => 300 + 2500 * Math.exp(-(((i - 30) / 10) ** 2)));
    for (const [h0, qOut] of [[165, 400], [174.2, 1200], [158.5, 900]]) {
        const a = simulateReservoir({ points: ST2, htl0: h0, qIn, qOut, spec: SPEC });
        const b = legacy(ST2, h0, qIn, qOut);
        a.forEach((r, i) => {
            assert.equal(r.htl, b[i].htl);
            assert.equal(r.volume, b[i].volume);
            assert.equal(r.hour_offset, b[i].hour_offset);
        });
    }
});

test('chuỗi Qout(t): bảo toàn khối lượng nước', () => {
    const qIn = [500, 900, 1500, 2200, 1800, 1200, 800, 600];
    const qOut = [400, 400, 600, 1500, 2000, 1600, 900, 600];
    const r = simulateReservoir({ points: ST2, htl0: 168, qIn, qOut });
    const dV = qIn.reduce((s, q, i) => s + (q - qOut[i]) * 3600 / 1e6, 0);
    assert.ok(Math.abs(r.at(-1).volume - interpVolume(ST2, 168) - dV) < 1e-9);
    assert.deepEqual(r.map(x => x.q_out), qOut);
});

test('hàm vận hành: xả bằng Q vào thì mực nước giữ nguyên', () => {
    const r = simulateReservoir({ points: ST2, htl0: 171.3, qIn: [800, 1500, 2600], qOut: s => s.q_in });
    r.forEach(x => assert.ok(Math.abs(x.htl - 171.3) < 1e-9));
});

test('hàm vận hành nhận trạng thái đầu bước', () => {
    const seen = [];
    simulateReservoir({ points: ST2, htl0: 170, qIn: [1000, 1000], qOut: s => { seen.push(s); return 0; } });
    assert.equal(seen[0].htl, 170);
    assert.equal(seen[0].hour_offset, 0);
    assert.ok(seen[1].htl > 170);
    assert.equal(seen[1].hour_offset, 1);
});

test('chuỗi q_out ngắn hơn q_in thì báo lỗi', () => {
    assert.throws(() => simulateReservoir({ points: ST2, htl0: 165, qIn: [1, 2, 3], qOut: [1, 2] }), RangeError);
});

test('hồ cạn tới đáy bảng Z-V: dừng ở đáy, đánh dấu clamped', () => {
    const r = simulateReservoir({ points: ST2, htl0: 155.2, qIn: [0], qOut: [5000] });
    assert.equal(r[0].htl, 155);
    assert.equal(r[0].clamped, true);
});

test('bước thời gian khác nhau: hour_offset cộng dồn', () => {
    const r = simulateReservoir({ points: ST2, htl0: 165, qIn: [{ value: 500, dt_hours: 1 }, { value: 500, dt_hours: 3 }], qOut: 500 });
    assert.deepEqual(r.map(x => x.hour_offset), [1, 4]);
});

test('cảnh báo theo MNC / MNDBT / MNGC', () => {
    // 12 giờ × 3000 m³/s ≈ 130 triệu m³: từ ~465 vượt mốc MNDBT (470) rồi MNGC (540)
    const r = simulateReservoir({ points: ST2, htl0: 174.9, qIn: Array(12).fill(3000), qOut: 0, spec: SPEC });
    assert.ok(r.some(x => x.alert === 'warning'));
    assert.ok(r.some(x => x.alert === 'danger'));
});

test('lakeCalcService.waterBalance: giữ nguyên dạng kết quả, nhận cả chuỗi q_out', async () => {
    const svc = Object.create(lakeCalcService);
    svc.getZVCurve = async () => ({ points: ST2 });
    svc.getSpec = async () => SPEC;
    const one = await svc.waterBalance(4, 170, [1000, 1200], 800, 1);
    assert.deepEqual(Object.keys(one), ['htl_now', 'q_out', 'forecast', 'max_htl', 'alert_any']);
    assert.equal(one.q_out, 800);
    assert.deepEqual(Object.keys(one.forecast[0]).slice(0, 7), ['step', 'hour_offset', 'htl', 'volume', 'q_in', 'q_out', 'alert']);
    const ser = await svc.waterBalance(4, 170, [1000, 1200], [800, 1500], 1);
    assert.equal(ser.q_out, 'series');
    assert.deepEqual(ser.forecast.map(r => r.q_out), [800, 1500]);
});
