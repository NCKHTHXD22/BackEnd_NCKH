/**
 * FloodAlert Service
 * Kiểm tra điều kiện cảnh báo lũ và tạo/cập nhật ReservoirAlert + OperationLog
 */

import InflowLakeHistory from '../core/entities/InflowLakeHistory.js';
import ForecastLSTM from '../core/entities/ForecastLSTM.js';
import ReservoirAlert from '../core/entities/ReservoirAlert.js';
import OperationLog from '../core/entities/OperationLog.js';
import lakeCalcService from './lakeCalc.service.js';

class FloodAlertService {

    // ── Chạy kiểm tra cho 1 hồ ──────────────────────────────────────────────
    async checkLake(lakeId) {
        try {
            // 1. Lấy thông số kỹ thuật
            const spec = await lakeCalcService.getSpec(lakeId);

            // 2. Dữ liệu thực đo gần nhất
            const latest = await InflowLakeHistory.findOne({ Id_Lake: lakeId })
                .sort({ timestamp: -1 }).lean();

            if (!latest) {
                console.log(`  ⚠ [FloodAlert] lake_id=${lakeId}: không có dữ liệu thực đo`);
                return null;
            }

            const { htl, qvao: q_in, luuluongxa: q_out } = latest;

            // Sanity check: HTL phải nằm trong khoảng hợp lý [MNC-10, crest+2]
            if (htl < spec.MNC - 10 || htl > spec.crest + 2) {
                console.warn(`  ⚠ [FloodAlert] lake_id=${lakeId}: HTL=${htl}m nằm ngoài phạm vi hợp lệ [${spec.MNC-10}, ${spec.crest+2}]. Bỏ qua.`);
                return null;
            }

            // 3. Dung tích & % đầy từ Z-V nội suy
            let fill_pct = 0;
            try {
                const vol = await lakeCalcService.volumeFromLevel(lakeId, htl);
                fill_pct = vol.fill_pct;
            } catch { /* ignore nếu chưa có ZV */ }

            // 4. Công suất
            let power_mw = null;
            try {
                const pw = await lakeCalcService.calcPower(lakeId, htl, q_out);
                power_mw = pw.power_mw;
            } catch { /* ignore */ }

            // 5. Lấy dự báo LSTM 24h tới (P50)
            const now = new Date();
            const lstmForecast = await ForecastLSTM.find({
                Id_Lake: lakeId,
                forecastTime: { $gte: now },
            }).sort({ forecastTime: 1 }).limit(24).lean();

            // Chuỗi Q vào dự báo — nếu không có LSTM dùng Q hiện tại flat
            const q_in_series = lstmForecast.length > 0
                ? lstmForecast.map(f => ({ value: f.qvao_forecast || q_in, dt_hours: 1 }))
                : Array(24).fill({ value: q_in, dt_hours: 1 });

            // 6. Cân bằng nước — dự báo Z 24h tới
            let balance = null;
            try {
                balance = await lakeCalcService.waterBalance(
                    lakeId, htl, q_in_series, q_out, 1
                );
            } catch { /* ignore */ }

            const htl_forecast_max = balance?.max_htl ?? htl;
            const hour_to_max = balance
                ? (balance.forecast.findIndex(r => r.htl === balance.max_htl) + 1)
                : 0;

            // 7. Khuyến nghị vận hành (dùng đỉnh dự báo)
            const rec = await lakeCalcService.operationRecommendation(
                lakeId, htl, q_in, q_out, htl_forecast_max > htl ? q_in * 1.1 : q_in
            );

            // 8. Xác định alert_level từ Z dự báo max
            let alert_level = 'normal';
            if (htl_forecast_max >= spec.MNGC || htl >= spec.MNGC) {
                alert_level = 'danger';
            } else if (htl_forecast_max >= spec.MNDBT || htl >= spec.MNDBT) {
                alert_level = 'warning';
            } else if (htl_forecast_max >= spec.MNDBT - 1.0) {
                // Tiếp cận MNDBT trong 1m
                alert_level = 'watch';
            }

            // 9. Upsert ReservoirAlert — 1 document active duy nhất per lake
            const alertData = {
                lake_id: lakeId,
                lake_name: spec.name,
                alert_level,
                htl_current: htl,
                q_in, q_out, fill_pct,
                htl_forecast_max,
                hour_to_max,
                forecast_steps: q_in_series.length,
                q_recommended: rec.q_rec,
                reason: rec.reason,
                detail: rec.detail,
                actions: rec.actions,
                is_active: alert_level !== 'normal',
                checked_at: new Date(),
            };

            await ReservoirAlert.findOneAndUpdate(
                { lake_id: lakeId },
                { $set: alertData },
                { upsert: true, new: true }
            );

            // 10. Ghi OperationLog (chỉ khi có gì đáng log: watch trở lên hoặc mỗi 1h)
            const minuteNow = now.getMinutes();
            const shouldLog = alert_level !== 'normal' || minuteNow < 15;
            if (shouldLog) {
                await OperationLog.create({
                    lake_id: lakeId,
                    lake_name: spec.name,
                    htl, q_in, q_out, fill_pct, power_mw,
                    htl_forecast_max, hour_to_max,
                    alert_level: rec.level,
                    q_recommended: rec.q_rec,
                    reason: rec.reason,
                    actions: rec.actions,
                    source: 'auto',
                    logged_at: new Date(),
                });
            }

            console.log(`  ✅ [FloodAlert] ${spec.name} | HTL=${htl}m | Z_max=${htl_forecast_max}m | level=${alert_level}`);
            return alertData;

        } catch (err) {
            console.error(`  ❌ [FloodAlert] lake_id=${lakeId}: ${err.message}`);
            return null;
        }
    }

    // ── Chạy kiểm tra cho tất cả hồ có trong LakeSpec ───────────────────────
    async checkAllLakes() {
        const specs = await lakeCalcService.getAllSpecs();
        const results = [];
        for (const spec of specs) {
            const r = await this.checkLake(spec.lake_id);
            if (r) results.push(r);
        }
        return results;
    }

    // ── Lấy cảnh báo hiện tại ────────────────────────────────────────────────
    async getActiveAlerts() {
        return ReservoirAlert.find({}).sort({ alert_level: -1, lake_id: 1 }).lean();
    }

    // ── Lịch sử vận hành ─────────────────────────────────────────────────────
    async getOperationLogs(lakeId, limit = 50) {
        const filter = lakeId ? { lake_id: Number(lakeId) } : {};
        return OperationLog.find(filter)
            .sort({ logged_at: -1 })
            .limit(limit)
            .lean();
    }
}

export default new FloodAlertService();
