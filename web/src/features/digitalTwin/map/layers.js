import * as Cesium from 'cesium';
import { renderBurst } from './viewer.js';

export const BRANCH_COLORS = {
  'A Vương': '#e76f51',
  'Sông Bung': '#2a9d8f',
  'Đắk Mi': '#e9c46a',
  'Sông Tranh': '#9b8bd4',
};
export const ADMIN_COLORS = { PHUONG: '#f472b6', XA: '#a3e635', DACKHU: '#60a5fa' };
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
  // Ranh giới xã/phường sau sáp nhập (bước 24): nền nhạt theo loại đơn vị, viền vàng bám địa hình
  admin(e) {
    const c = css(ADMIN_COLORS[prop(e, 'loai_code')] ?? '#cbd5e1');
    e.polygon.material = c.withAlpha(0.07);
    e.polygon.outline = false;
    const h = e.polygon.hierarchy.getValue();
    e.polyline = new Cesium.PolylineGraphics({
      positions: [...h.positions, h.positions[0]], width: 1.6, clampToGround: true, material: css('#fde047').withAlpha(0.9),
    });
    return { fill: 0.07, line: 0.9 };
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
      text: prop(e, 'name').replace(/^Hồ /, ''), font: `${main ? 700 : 600} ${main ? 30 : 26}px "Segoe UI", sans-serif`,
      scale: 0.5,                                   // vẽ chữ cỡ ×2 rồi thu lại → nét trên màn hình HiDPI
      fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 6,
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
  // Nhãn tên: một nhãn mỗi đối tượng (MultiPolygon tách thành nhiều entity) tại label_lon/label_lat tính sẵn trong pipeline
  if (def.labels) {
    const seen = new Set();
    for (const e of [...ds.entities.values]) {
      const code = prop(e, 'code'), lon = prop(e, 'label_lon'), lat = prop(e, 'label_lat');
      if (seen.has(code) || lon == null) continue;
      seen.add(code);
      const l = ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        label: {
          text: prop(e, def.labels), font: '600 24px "Segoe UI", sans-serif', scale: 0.5,
          fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 5, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, def.labelFar ?? 60000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: e.properties,          // bấm vào nhãn = bấm vào đối tượng
      });
      l.layerId = def.id;
    }
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
  // Thuộc tính khai báo với giá trị undefined vẫn có tên trong propertyNames nhưng không có Property
  for (const k of e.properties.propertyNames) out[k] = e.properties[k]?.getValue();
  return out;
}
