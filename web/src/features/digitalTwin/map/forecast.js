import * as Cesium from 'cesium';
import i18n from '../../../i18n/i18n.js';
import mapApi from '../../../api/mapApi';
import { liveLayer } from './stations.js';

// Lớp "Dự báo Q đến hồ": nhãn trên từng hồ với đỉnh Q đến dự báo của lần chạy mới nhất mỗi mô hình
// (LSTM ~12 giờ, XGBoost ~24 giờ; job chạy hằng giờ trên VPS). Không gộp các mô hình: khi chúng lệch nhau quá
// DISAGREE lần thì nhãn có dấu ⚠ để người xem biết dự báo đang bất định. Bấm nhãn → bảng hồ, thẻ "Dự báo".
const MODELS = [['LSTM', mapApi.getForecastLstm], ['XGB', mapApi.getForecastXgb]];
const DISAGREE = 3;
const MAIN_LAKES = [1, 2, 3, 4];          // 4 hồ trong quy trình liên hồ QĐ 1865

/** Lần chạy mới nhất (cùng generatedAt), chỉ giữ các giờ từ hiện tại trở đi. */
export function latestRun(rows, now = Date.now()) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const gen = rows.reduce((m, r) => (r.generatedAt > m ? r.generatedAt : m), '');
  const pts = rows.filter(r => r.generatedAt === gen && new Date(r.forecastTime).getTime() >= now - 90 * 60e3)
    .map(r => ({ t: new Date(r.forecastTime), p50: r.qvao_forecast, p10: r.p10, p90: r.p90 }))
    .filter(p => Number.isFinite(p.p50))
    .sort((a, b) => a.t - b.t);
  if (!pts.length) return null;
  const peak = pts.reduce((m, p) => (p.p50 > m.p50 ? p : m), pts[0]);
  return { generatedAt: new Date(gen), points: pts, peak, horizonH: Math.round((pts.at(-1).t - pts[0].t) / 3600e3) + 1 };
}

const q = v => (v == null ? '–' : v.toLocaleString('vi-VN', { maximumFractionDigits: v < 10 ? 1 : 0 }));
const arrow = (peak, now) => (!now ? '' : peak > now * 1.2 ? '↑' : peak < now * 0.8 ? '↓' : '→');

export async function loadForecast(viewer, def) {
  const fc = await (await fetch('/data/dt/reservoirs.geojson')).json();
  const handle = await liveLayer(viewer, def, async ds => {
    const lakes = await mapApi.getReservoirs().catch(() => []);
    const live = Object.fromEntries((Array.isArray(lakes) ? lakes : []).map(l => [Number(l.Id_Lake), l]));
    const rows = await Promise.all(fc.features.map(async f => {
      const id = f.properties.lake_id;
      const runs = await Promise.all(MODELS.map(([, get]) => get(id).then(latestRun).catch(() => null)));
      return { f, id, runs };
    }));
    ds.entities.suspendEvents();
    ds.entities.removeAll();
    for (const { f, id, runs } of rows) {
      if (runs.every(r => !r)) continue;
      const q0 = live[id]?.qvao ?? null;
      const peaks = runs.filter(Boolean).map(r => r.peak.p50);
      const spread = peaks.length > 1 && Math.min(...peaks) > 0 ? Math.max(...peaks) / Math.min(...peaks) : 1;
      const parts = MODELS.map(([name], i) => (runs[i] ? `${name} ${arrow(runs[i].peak.p50, q0)}${q(runs[i].peak.p50)}` : null)).filter(Boolean);
      const [lon, lat] = f.geometry.coordinates;
      const main = MAIN_LAKES.includes(id);
      const e = ds.entities.add({
        id: `${def.id}:${id}`,
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        label: {
          text: `${spread > DISAGREE ? '⚠ ' : ''}${i18n.t('digitalTwin.fc.label', { now: q(q0) })}\n${parts.join(' · ')} m³/s`,
          font: '600 22px "Segoe UI", sans-serif', scale: 0.5, fillColor: Cesium.Color.WHITE,
          showBackground: true, backgroundColor: Cesium.Color.fromCssColorString(spread > DISAGREE ? '#7c2d12' : '#0f172a').withAlpha(0.78),
          backgroundPadding: new Cesium.Cartesian2(10, 6), verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -34), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, main ? 400000 : 90000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { code: `FC-${id}`, reservoir_code: f.properties.code, name: f.properties.name },
      });
      e.layerId = def.id;
    }
    ds.entities.resumeEvents();
  });
  // Nhãn thuộc về hồ: bấm vào thì chọn hồ chứa và mở thẳng thẻ Dự báo
  handle.redirect = e => ({ layerId: 'reservoirs', code: e.properties.reservoir_code.getValue(), tab: 'fc' });
  return handle;
}
