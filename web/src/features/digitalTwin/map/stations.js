import * as Cesium from 'cesium';
import mapApi from '../../../api/mapApi';
import { renderBurst } from './viewer.js';

// Lớp trạm quan trắc lấy trực tiếp từ API backend: trạm đo mưa (VRain) và trạm thủy văn (KTTV qua PCTT, trạm tự động
// muangap/VRain). Tự làm mới khi lớp đang bật; trạm không có số liệu mới quá STALE_MS tô xám.
const css = c => Cesium.Color.fromCssColorString(c);
const REFRESH_MS = 10 * 60e3;
const STALE_MS = 6 * 3600e3;
const GREY = '#94a3b8';
export const ALARM_COLORS = ['#22c55e', '#eab308', '#f97316', '#dc2626'];   // dưới BĐ I, BĐ I, II, III
const isStale = t => !t || Date.now() - new Date(t).getTime() > STALE_MS;

function addPoint(ds, layerId, { code, lon, lat, color, size, alpha, label, labelFar, props }) {
  const e = ds.entities.add({
    id: `${layerId}:${code}`,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: {
      pixelSize: size, color: css(color).withAlpha(alpha), outlineColor: Cesium.Color.WHITE.withAlpha(alpha), outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: label ? {
      text: label, font: '600 24px "Segoe UI", sans-serif', scale: 0.5,
      fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 5, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -15), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, labelFar), disableDepthTestDistance: Number.POSITIVE_INFINITY,
    } : undefined,
    properties: { code, ...props },
  });
  e.layerId = layerId;
  e.baseColor = color;
  return e;
}

/** Lớp điểm làm mới định kỳ: build(ds, alpha) dựng lại toàn bộ entity từ số liệu mới. */
export async function liveLayer(viewer, def, build) {
  const ds = new Cesium.CustomDataSource(def.id);
  ds.show = Boolean(def.visible);
  await viewer.dataSources.add(ds);
  let alpha = 1, loading = null;
  const refresh = () => (loading ??= build(ds, alpha)
    .then(() => renderBurst(viewer, 500))
    .finally(() => { loading = null; }));
  await refresh();
  const timer = setInterval(() => {
    if (viewer.isDestroyed()) { clearInterval(timer); return; }
    if (ds.show) refresh().catch(e => console.warn(def.id, e));
  }, REFRESH_MS);
  return {
    def, dataSource: ds,
    setVisible(on) { ds.show = on; if (on) refresh().catch(() => {}); renderBurst(viewer); },
    setOpacity(a) {
      alpha = a;
      for (const e of ds.entities.values) {
        if (!e.point) continue;
        e.point.color = css(e.baseColor).withAlpha(a);
        e.point.outlineColor = Cesium.Color.WHITE.withAlpha(a);
      }
      renderBurst(viewer);
    },
    find(code) { return ds.entities.values.find(e => e.properties?.code?.getValue() === code); },
  };
}

// ---- Trạm đo mưa (vrain.vn, cập nhật mỗi giờ bởi job fetchRainData) -------------------------------------------
export function rainColor(mm) {
  if (mm == null) return GREY;
  if (mm >= 100) return '#7e22ce';
  if (mm >= 50) return '#dc2626';
  if (mm >= 25) return '#f97316';
  if (mm >= 10) return '#eab308';
  if (mm > 0) return '#38bdf8';
  return '#e2e8f0';
}

export function loadRainStations(viewer, def) {
  return liveLayer(viewer, def, async (ds, alpha) => {
    const list = await mapApi.getRainStations();
    ds.entities.suspendEvents();
    ds.entities.removeAll();
    for (const s of Array.isArray(list) ? list : []) {
      const lat = Number(s.location?.lat), lon = Number(s.location?.lng);
      if (!lat || !lon) continue;
      const stale = isStale(s.lastUpdate);
      const mm = stale ? null : Number(s.sumDepth) || 0;
      addPoint(ds, def.id, {
        code: s.uuid, lon, lat, alpha, size: mm >= 10 ? 13 : 10, color: rainColor(mm),
        label: mm >= 1 ? `${mm.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} mm` : null, labelFar: 120000,
        props: {
          name: s.name, uuid: s.uuid, rain_mm: mm, rain_level: stale ? null : s.level,
          area: s.area?.name ? `${s.area.type ?? ''} ${s.area.name}`.trim() : null, address: s.address,
          last_update: s.lastUpdate ? new Date(s.lastUpdate) : null, stale,
        },
      });
    }
    ds.entities.resumeEvents();
  });
}

// ---- Trạm thủy văn -------------------------------------------------------------------------------------------
/** Cấp báo động 0–3 theo ngưỡng BĐ I/II/III; null khi thiếu số liệu hoặc ngưỡng. */
export function alarmLevel(level, th) {
  if (level == null || th?.level1 == null) return null;
  if (th.level3 != null && level >= th.level3) return 3;
  if (th.level2 != null && level >= th.level2) return 2;
  return level >= th.level1 ? 1 : 0;
}

export function loadWaterStations(viewer, def) {
  return liveLayer(viewer, def, async (ds, alpha) => {
    const list = await mapApi.getWaterLevelStations();
    ds.entities.suspendEvents();
    ds.entities.removeAll();
    for (const s of Array.isArray(list) ? list : []) {
      const lat = Number(s.location?.lat), lon = Number(s.location?.lng);
      if (!lat || !lon || !s.code) continue;
      const kttv = s.kind === 'river_kttv';
      const stale = isStale(s.level_time);
      const level = stale ? null : s.level;
      const alarm = alarmLevel(level, s.thresholds);
      const color = level == null ? GREY : alarm == null ? '#3b82f6' : ALARM_COLORS[alarm];
      const th = s.thresholds ?? {};
      addPoint(ds, def.id, {
        code: s.code, lon, lat, alpha, size: kttv ? 15 : 11, color,
        label: `${s.name}${level != null ? ` · ${level.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m` : ''}`,
        labelFar: kttv ? 250000 : 60000,
        props: {
          name: s.name, station_kind: s.kind, river: s.river, level_m: level, alarm,
          level1: th.level1, level2: th.level2, level3: th.level3, decision_level: s.decision_level,
          level_time: s.level_time ? new Date(s.level_time) : null, stale, no_hourly: kttv && level == null,
          location_note: s.location_note, thresholds: s.thresholds ?? null,
        },
      });
    }
    ds.entities.resumeEvents();
  });
}
