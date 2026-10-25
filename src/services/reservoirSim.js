/**
 * Mô phỏng hồ chứa theo cân bằng nước – lõi tính toán thuần (không truy cập CSDL), dùng chung cho
 * lakeCalc.service.waterBalance() và các bước kiểm chứng/diễn toán (lộ trình mục 4.1).
 *
 *   V(t+Δt) = V(t) + (Q_vào(t) − Q_xả(t)) · Δt          (V: triệu m³, Q: m³/s, Δt: giờ)
 *   H = f⁻¹(V) theo bảng Z-V (nội suy tuyến tính)
 *
 * Q_xả có thể là:
 *   - một số            → xả cố định (hành vi cũ của waterBalance)
 *   - mảng số           → chuỗi xả theo từng bước, Qout(t)
 *   - hàm policy(state) → quy tắc vận hành, nhận { step, hour_offset, htl, volume, q_in } của đầu bước,
 *                          trả về số m³/s
 */

export function sortedPoints(points) {
    return [...points].sort((a, b) => a.z - b.z);
}

export function interpVolume(pts, z) {
    if (z <= pts[0].z) return pts[0].volume;
    if (z >= pts[pts.length - 1].z) return pts[pts.length - 1].volume;
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1].z < z) i++;
    const p0 = pts[i], p1 = pts[i + 1];
    return p0.volume + ((z - p0.z) / (p1.z - p0.z)) * (p1.volume - p0.volume);
}

export function levelFromVolume(pts, volume) {
    if (volume <= pts[0].volume) return pts[0].z;
    if (volume >= pts[pts.length - 1].volume) return pts[pts.length - 1].z;
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1].volume < volume) i++;
    const p0 = pts[i], p1 = pts[i + 1];
    const t = (volume - p0.volume) / (p1.volume - p0.volume);
    return p0.z + t * (p1.z - p0.z);
}

function outflowAt(qOut, state, step) {
    if (typeof qOut === 'function') return Number(qOut(state));
    if (Array.isArray(qOut)) {
        if (step >= qOut.length) throw new RangeError(`Chuỗi q_out có ${qOut.length} bước, thiếu bước ${step + 1}`);
        return Number(qOut[step]);
    }
    return Number(qOut);
}

/**
 * @param {object}   o
 * @param {Array}    o.points   bảng Z-V [{ z, volume, area? }]
 * @param {number}   o.htl0     mực nước ban đầu (m)
 * @param {Array}    o.qIn      [số] hoặc [{ value, dt_hours }]
 * @param {number|number[]|Function} o.qOut
 * @param {number}   [o.dtHours=1]  bước thời gian khi phần tử qIn là số
 * @param {object}   [o.spec]   { MNC, MNDBT, MNGC } để gắn trạng thái cảnh báo
 */
export function simulateReservoir({ points, htl0, qIn, qOut, dtHours = 1, spec = null }) {
    if (!Array.isArray(points) || points.length < 2) throw new Error('Bảng Z-V cần ít nhất 2 điểm');
    if (!Number.isFinite(htl0)) throw new Error('htl0 không hợp lệ');
    const pts = sortedPoints(points);
    const vMin = pts[0].volume;

    let volume = interpVolume(pts, htl0);
    let htl = htl0;
    let hour = 0;
    const steps = [];

    for (let step = 0; step < qIn.length; step++) {
        const entry = qIn[step];
        const q_in = typeof entry === 'object' ? Number(entry.value) : Number(entry);
        const dt = typeof entry === 'object' ? Number(entry.dt_hours ?? dtHours) : dtHours;
        const q_out = outflowAt(qOut, { step, hour_offset: hour, htl, volume, q_in }, step);
        if (!Number.isFinite(q_in) || !Number.isFinite(q_out)) {
            throw new Error(`Bước ${step + 1}: q_in/q_out không hợp lệ (${q_in}, ${q_out})`);
        }

        const dV = (q_in - q_out) * dt * 3600 / 1e6;
        const clamped = volume + dV < vMin;          // hồ cạn tới đáy bảng Z-V: không xả được hết q_out
        volume = Math.max(vMin, volume + dV);
        htl = levelFromVolume(pts, volume);
        hour += dt;

        let alert = 'normal';
        if (spec) {
            if (htl >= spec.MNGC) alert = 'danger';
            else if (htl >= spec.MNDBT) alert = 'warning';
            else if (htl <= spec.MNC) alert = 'low';
        }
        steps.push({ step: step + 1, hour_offset: hour, htl, volume, q_in, q_out, alert, ...(clamped && { clamped: true }) });
    }
    return steps;
}
