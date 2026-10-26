import * as Cesium from 'cesium';
import i18n from '../../../i18n/i18n.js';
import mapApi from '../../../api/mapApi';
import { liveLayer } from './stations.js';

// Lớp "Dự báo Q đến hồ (LSTM)": nhãn trên từng hồ với đỉnh Q đến dự báo của lần chạy LSTM mới nhất (job hằng giờ trên
// VPS, ~12 giờ, dải p10–p90). Bấm nhãn → bảng hồ, thẻ "Dự báo". XGBoost/RF chưa dùng cho dự báo vận hành.
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
  return { generatedAt: new Date(gen), points: pts, peak, p90Max: Math.max(...pts.map(p => p.p90 ?? p.p50)),
           horizonH: Math.round((pts.at(-1).t - pts[0].t) / 3600e3) + 1 };
}

const q = v => (v == null ? '–' : v.toLocaleString('vi-VN', { maximumFractionDigits: v < 10 ? 1 : 0 }));
const arrow = (peak, now) => (!now ? '' : peak > now * 1.2 ? '↑ ' : peak < now * 0.8 ? '↓ ' : '→ ');
const RISING = '#9a3412', STEADY = '#0f172a';

export async function loadForecast(viewer, def) {
  const fc = await (await fetch('/data/dt/reservoirs.geojson')).json();
  const handle = await liveLayer(viewer, def, async ds => {
    const lakes = await mapApi.getReservoirs().catch(() => []);
    const live = Object.fromEntries((Array.isArray(lakes) ? lakes : []).map(l => [Number(l.Id_Lake), l]));
    const rows = await Promise.all(fc.features.map(async f => {
      const run = await mapApi.getForecastLstm(f.properties.lake_id).then(latestRun).catch(() => null);
      return { f, run };
    }));
    ds.entities.suspendEvents();
    ds.entities.removeAll();
    for (const { f, run } of rows) {
      if (!run) continue;
      const id = f.properties.lake_id;
      const q0 = live[id]?.qvao ?? null;
      const rising = q0 != null && run.peak.p50 > q0 * 1.2;
      const at = run.peak.t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const [lon, lat] = f.geometry.coordinates;
      const main = MAIN_LAKES.includes(id);
      const e = ds.entities.add({
        id: `${def.id}:${id}`,
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        label: {
          text: `${i18n.t('digitalTwin.fc.label', { now: q(q0), h: run.horizonH })}\n`
            + `${arrow(run.peak.p50, q0)}${q(run.peak.p50)} m³/s ${i18n.t('digitalTwin.fc.at', { time: at })} · P90 ${q(run.p90Max)}`,
          font: '600 22px "Segoe UI", sans-serif', scale: 0.5, fillColor: Cesium.Color.WHITE,
          showBackground: true, backgroundColor: Cesium.Color.fromCssColorString(rising ? RISING : STEADY).withAlpha(0.8),
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
