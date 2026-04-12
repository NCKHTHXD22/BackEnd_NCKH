/**
 * LakeCalc Service
 * Tính toán vận hành hồ chứa:
 *   - Nội suy dung tích từ mực nước (Z-V curve)
 *   - Công suất phát điện
 *   - Cân bằng nước (dự báo mực nước)
 *   - Khuyến nghị vận hành
 */

import ZVCurve from '../core/entities/ZVCurve.js';
import LakeSpec from '../core/entities/LakeSpec.js';

class LakeCalcService {

    // ── 1. Lấy thông số kỹ thuật ──────────────────────────────────────────────
    async getSpec(lakeId) {
        const spec = await LakeSpec.findOne({ lake_id: Number(lakeId) }).lean();
        if (!spec) throw new Error(`Không tìm thấy thông số hồ lake_id=${lakeId}`);
        return spec;
    }

    async getAllSpecs() {
        return LakeSpec.find({}).sort({ lake_id: 1 }).lean();
    }

    // ── 2. Lấy bảng Z-V ───────────────────────────────────────────────────────
    async getZVCurve(lakeId) {
        const curve = await ZVCurve.findOne({ lake_id: Number(lakeId) }).lean();
        if (!curve) throw new Error(`Không tìm thấy bảng Z-V hồ lake_id=${lakeId}`);
        return curve;
    }

    // ── 3. Nội suy tuyến tính Z → V và F ──────────────────────────────────────
    async volumeFromLevel(lakeId, htl) {
        const curve = await this.getZVCurve(lakeId);
        const pts = curve.points.sort((a, b) => a.z - b.z);

        if (htl <= pts[0].z) return { z: htl, volume: pts[0].volume, area: pts[0].area || 0, fill_pct: 0 };
        if (htl >= pts[pts.length - 1].z) {
            const last = pts[pts.length - 1];
            return { z: htl, volume: last.volume, area: last.area || 0, fill_pct: 100 };
        }

        // Tìm khoảng chứa htl
        let i = 0;
        while (i < pts.length - 1 && pts[i + 1].z < htl) i++;

        const p0 = pts[i], p1 = pts[i + 1];
        const t = (htl - p0.z) / (p1.z - p0.z);
        const volume = p0.volume + t * (p1.volume - p0.volume);
        const area   = (p0.area || 0) + t * ((p1.area || 0) - (p0.area || 0));

        // % đầy tính từ MNC → crest
        const spec = await this.getSpec(lakeId);
        const vMNC   = this._interpVolume(pts, spec.MNC);
        const vCrest = this._interpVolume(pts, spec.crest);
        const fill_pct = Math.max(0, Math.min(100, ((volume - vMNC) / (vCrest - vMNC)) * 100));

        return {
            z: htl,
            volume: Math.round(volume * 10) / 10,   // triệu m³, 1 chữ số
            area:   Math.round(area   * 10) / 10,   // km²
            fill_pct: Math.round(fill_pct * 10) / 10,
        };
    }

    _interpVolume(pts, z) {
        if (z <= pts[0].z) return pts[0].volume;
        if (z >= pts[pts.length - 1].z) return pts[pts.length - 1].volume;
        let i = 0;
        while (i < pts.length - 1 && pts[i + 1].z < z) i++;
        const p0 = pts[i], p1 = pts[i + 1];
        return p0.volume + ((z - p0.z) / (p1.z - p0.z)) * (p1.volume - p0.volume);
    }

    // ── 4. Tính công suất phát điện ───────────────────────────────────────────
    async calcPower(lakeId, htl, qTurbine) {
        const spec = await this.getSpec(lakeId);
        const H_net = Math.max(0, htl - spec.tailwater_elev);  // Cột nước thực
        const Q_eff = Math.min(qTurbine, spec.max_turbine_flow || qTurbine);
        const power_mw = (spec.turbine_efficiency * 1000 * 9.81 * Q_eff * H_net) / 1e6;

        return {
            power_mw:       Math.round(power_mw * 10) / 10,
            capacity_mw:    spec.capacity_mw,
            load_pct:       Math.round((power_mw / (spec.capacity_mw || 1)) * 1000) / 10,
            head_net:       Math.round(H_net * 10) / 10,
            q_turbine:      Q_eff,
            efficiency:     spec.turbine_efficiency,
        };
    }

    // ── 5. Cân bằng nước — dự báo Z theo chuỗi Q vào ─────────────────────────
    // q_in_series: [{ value: m³/s, dt_hours: số giờ }]  hoặc mảng số (mỗi bước = dt_hours)
    async waterBalance(lakeId, htl_now, q_in_series, q_out, dt_hours = 1) {
        const curve = await this.getZVCurve(lakeId);
        const spec  = await this.getSpec(lakeId);
        const pts   = curve.points.sort((a, b) => a.z - b.z);

        let vol_now = this._interpVolume(pts, htl_now); // triệu m³

        const results = [];
        let htl_cur = htl_now;

        for (let step = 0; step < q_in_series.length; step++) {
            const entry = q_in_series[step];
            const q_in  = typeof entry === 'object' ? entry.value    : entry;
            const dt    = typeof entry === 'object' ? entry.dt_hours : dt_hours;

            // ΔV = (Q_vào - Q_xả) × Δt, đổi m³/s → triệu m³
            const dV = (q_in - q_out) * dt * 3600 / 1e6;
            vol_now  = Math.max(pts[0].volume, vol_now + dV);

            // Z mới: nội suy ngược V → Z
            htl_cur = this._levelFromVolume(pts, vol_now);

            // Trạng thái cảnh báo
            let alert = 'normal';
            if (htl_cur >= spec.MNGC)  alert = 'danger';
            else if (htl_cur >= spec.MNDBT) alert = 'warning';
            else if (htl_cur <= spec.MNC)   alert = 'low';

            results.push({
                step: step + 1,
                hour_offset: (step + 1) * dt,
                htl:    Math.round(htl_cur   * 100) / 100,
                volume: Math.round(vol_now   * 10)  / 10,
                q_in,
                q_out,
                alert,
            });
        }

        return {
            htl_now,
            q_out,
            forecast: results,
            max_htl:  Math.max(...results.map(r => r.htl)),
            alert_any: results.some(r => r.alert !== 'normal'),
        };
    }

    _levelFromVolume(pts, volume) {
        if (volume <= pts[0].volume) return pts[0].z;
        if (volume >= pts[pts.length - 1].volume) return pts[pts.length - 1].z;
        let i = 0;
        while (i < pts.length - 1 && pts[i + 1].volume < volume) i++;
        const p0 = pts[i], p1 = pts[i + 1];
        const t = (volume - p0.volume) / (p1.volume - p0.volume);
        return p0.z + t * (p1.z - p0.z);
    }

    // ── 6. Khuyến nghị vận hành ───────────────────────────────────────────────
    async operationRecommendation(lakeId, htl, q_in, q_out, forecast_peak) {
        const spec = await this.getSpec(lakeId);
        const curve = await this.getZVCurve(lakeId);
        const pts   = curve.points.sort((a, b) => a.z - b.z);

        const vMNC   = this._interpVolume(pts, spec.MNC);
        const vCrest = this._interpVolume(pts, spec.crest);
        const vCur   = this._interpVolume(pts, htl);
        const fill   = Math.max(0, Math.min(1, (vCur - vMNC) / (vCrest - vMNC)));
        const q_peak = forecast_peak || q_in;

        let level   = 'ok';
        let q_rec   = q_out;
        let reason  = '';
        let detail  = '';
        let actions = [];

        if (htl >= spec.MNGC) {
            level   = 'danger';
            q_rec   = Math.max(q_in * 1.4, q_out * 1.3);
            reason  = 'Mực nước vượt MNGC — cần xả khẩn cấp';
            detail  = `HTL=${htl.toFixed(2)}m ≥ MNGC=${spec.MNGC}m. Mở toàn bộ cửa xả, Q_xả ≥ ${q_rec.toFixed(0)} m³/s.`;
            actions = [
                'Mở toàn bộ cửa tràn ngay lập tức',
                'Báo ngay Ban chỉ huy PCTT tỉnh',
                'Phát lệnh cảnh báo hạ du trước ít nhất 30 phút',
                'Theo dõi mực nước mỗi 15 phút',
            ];
        } else if (htl >= spec.MNDBT) {
            level   = 'warning';
            q_rec   = Math.max(q_in * 1.15, q_out);
            reason  = 'Mực nước đạt MNDBT — tăng xả để giữ dung tích phòng lũ';
            detail  = `HTL=${htl.toFixed(2)}m ≥ MNDBT=${spec.MNDBT}m. Tăng Q_xả lên ~${q_rec.toFixed(0)} m³/s. Dự báo đỉnh: ${q_peak.toFixed(0)} m³/s.`;
            actions = [
                'Mở thêm cửa tràn từng bậc (không đột ngột)',
                'Báo trước hạ du ít nhất 2 giờ',
                'Theo dõi dự báo LSTM mỗi 1 giờ',
            ];
        } else if (fill >= 0.85) {
            level   = 'warning';
            q_rec   = q_in > q_out ? q_in * 1.05 : q_out;
            reason  = `Hồ đầy ${(fill*100).toFixed(1)}% — duy trì Q_xả ≥ Q_vào`;
            detail  = `Hồ tích ${(fill*100).toFixed(1)}%. Dự báo đỉnh ${q_peak.toFixed(0)} m³/s trong 12h tới. Duy trì xả ${q_rec.toFixed(0)} m³/s để tránh tràn bất ngờ.`;
            actions = [
                'Duy trì Q_xả ≥ Q_vào',
                'Chuẩn bị sẵn sàng mở tràn nếu HTL tiếp tục tăng',
            ];
        } else if (htl <= spec.MNC) {
            level   = 'low';
            q_rec   = spec.min_env_flow;
            reason  = 'Mực nước dưới MNC — chỉ xả dòng chảy sinh thái';
            detail  = `HTL=${htl.toFixed(2)}m ≤ MNC=${spec.MNC}m. Dừng phát điện. Duy trì Q_xả tối thiểu ${spec.min_env_flow} m³/s theo yêu cầu môi trường.`;
            actions = [
                'Dừng tổ máy phát điện',
                `Duy trì Q_xả tối thiểu ${spec.min_env_flow} m³/s`,
                'Báo cáo cơ quan quản lý nếu khô hạn kéo dài',
            ];
        } else if (fill < 0.3 && q_in < 10) {
            level   = 'ok';
            q_rec   = Math.max(q_out * 0.8, spec.min_env_flow);
            reason  = 'Hồ đang ở mức thấp — giảm xả để tích nước';
            detail  = `Hồ chỉ đầy ${(fill*100).toFixed(1)}%, Q_vào thấp (${q_in.toFixed(1)} m³/s). Giảm xả về ${q_rec.toFixed(0)} m³/s để tích nước mùa kiệt.`;
            actions = ['Giảm xả về mức tối thiểu', 'Theo dõi dự báo mưa thượng nguồn'];
        } else {
            level   = 'ok';
            q_rec   = q_out;
            reason  = 'Vận hành bình thường';
            detail  = `Hồ vận hành ổn định (${(fill*100).toFixed(1)}% đầy, H=${htl.toFixed(2)}m). Duy trì Q_xả=${q_out.toFixed(0)} m³/s là phù hợp.`;
            actions = ['Tiếp tục phát điện theo kế hoạch', 'Theo dõi dự báo LSTM định kỳ'];
        }

        return {
            level,       // ok | warning | danger | low
            q_rec: Math.round(q_rec * 10) / 10,
            reason,
            detail,
            actions,
            htl,
            q_in,
            q_out,
            fill_pct: Math.round(fill * 1000) / 10,
        };
    }
}

export default new LakeCalcService();
