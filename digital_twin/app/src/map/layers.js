import * as Cesium from 'cesium';
import { renderBurst } from './viewer.js';

export const BRANCH_COLORS = {
  'A Vương': '#e76f51',
  'Sông Bung': '#2a9d8f',
  'Đắk Mi': '#e9c46a',
  'Sông Tranh': '#9b8bd4',
};
const css = c => Cesium.Color.fromCssColorString(c);
const prop = (e, k) => e.properties?.[k]?.getValue();

// Mỗi kiểu hiển thị: gán màu/độ dày cho entity và ghi lại màu gốc để chỉnh độ trong suốt sau.
const STYLES = {
  basin(e) {
    e.polygon.material = css('#ffd166').withAlpha(0.06);
    e.polygon.outline = false;
    // Viền: polyline bám địa hình dựng từ vành ngoài của polygon
    const h = e.polygon.hierarchy.getValue();
    e.polyline = new Cesium.PolylineGraphics({
      positions: [...h.positions, h.positions[0]], width: 3, clampToGround: true,
      material: css('#ffd166'),
    });
    return { fill: 0.06, line: 1 };
  },
  byBranch(e) {
    const c = css(BRANCH_COLORS[prop(e, 'branch')] ?? '#cccccc');
    e.polygon.material = c.withAlpha(0.35);
    e.polygon.outline = false;
    const h = e.polygon.hierarchy.getValue();
    e.polyline = new Cesium.PolylineGraphics({
      positions: [...h.positions, h.positions[0]], width: 1.5, clampToGround: true, material: c,
    });
    return { fill: 0.35, line: 1 };
  },
  streams(e) {
    const order = prop(e, 'strahler') ?? 2;
    e.polyline.width = 0.6 + order * 0.7;
    e.polyline.clampToGround = true;
    e.polyline.material = css('#4cc9f0').withAlpha(0.55 + Math.min(order, 7) * 0.06);
    return { line: 0.55 + Math.min(order, 7) * 0.06 };
  },
  osmRivers(e) {
    e.polyline.width = 3;
    e.polyline.clampToGround = true;
    e.polyline.material = css('#3a86ff');
    return { line: 1 };
  },
  lakes(e) {
    e.polygon.material = css('#219ebc').withAlpha(0.8);
    e.polygon.outline = false;
    return { fill: 0.8 };
  },
  reservoirs(e) {
    const c = css(BRANCH_COLORS[prop(e, 'branch')] ?? '#ffffff');
    e.billboard = undefined;
    e.point = new Cesium.PointGraphics({
      pixelSize: 15, color: c, outlineColor: Cesium.Color.WHITE, outlineWidth: 2.5,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    // 4 hồ trong quy trình liên hồ (QĐ 1865/QĐ-TTg) luôn hiện tên; hồ khác hiện khi phóng gần
    const main = [1, 2, 3, 4].includes(prop(e, 'lake_id'));
    e.label = new Cesium.LabelGraphics({
      text: prop(e, 'name').replace(/^Hồ /, ''), font: `${main ? 700 : 600} ${main ? 14 : 12}px "Segoe UI", sans-serif`,
      fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -20),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, main ? 400000 : 90000),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    return { point: 1 };
  },
};

/** Nạp một lớp theo mục trong layers.json; trả về đối tượng điều khiển lớp. */
export async function loadLayer(viewer, def) {
  const ds = await Cesium.GeoJsonDataSource.load(def.url, { clampToGround: true });
  ds.name = def.id;
  const base = new Map();
  for (const e of ds.entities.values) {
    e.layerId = def.id;
    base.set(e, STYLES[def.style]?.(e) ?? {});
  }
  ds.show = Boolean(def.visible);
  await viewer.dataSources.add(ds);

  const handle = {
    def, dataSource: ds,
    setVisible(on) { ds.show = on; renderBurst(viewer); },
    setOpacity(a) {
      for (const [e, b] of base) {
        if (e.polygon && b.fill != null) e.polygon.material = e.polygon.material.color.getValue().withAlpha(b.fill * a);
        if (e.polyline && b.line != null) e.polyline.material = e.polyline.material.color.getValue().withAlpha(b.line * a);
        if (e.point) {
          e.point.color = e.point.color.getValue().withAlpha(a);
          e.point.outlineColor = Cesium.Color.WHITE.withAlpha(a);
        }
      }
      renderBurst(viewer);
    },
    find(code) { return ds.entities.values.find(e => prop(e, 'code') === code); },
  };
  return handle;
}

export function entityProps(e) {
  if (!e?.properties) return {};
  const out = {};
  for (const k of e.properties.propertyNames) out[k] = e.properties[k].getValue();
  return out;
}
