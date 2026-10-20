import * as Cesium from 'cesium';
import mapApi from '../../../api/mapApi';
import { renderBurst } from './viewer.js';

// Đập thủy điện 3D dựng theo kích thước thật:
//  - trục đập, phía thượng lưu, mặt hồ: digital_twin/scripts/08_dams.py (OSM)
//  - cao trình đỉnh, ngưỡng tràn, bề rộng tràn, MNC/MNDBT/MNGC, cao trình hạ lưu: API lake-specs
//  - mực nước, lưu lượng xả tràn / qua tua-bin hiện tại: API inflowLake (cập nhật mỗi giờ)
// Mặt cắt thân đập là dạng đập trọng lực chuẩn (thượng lưu thẳng đứng, hạ lưu dốc 0,75) – gần đúng, chưa
// theo bản vẽ thiết kế từng đập.

const COL = {
  concrete: '#cdc8bd', crest: '#8f8b83', chute: '#e2ded3', pier: '#b9b4aa', gate: '#3d4a5c',
  bed: '#7a6e5a',
};
const LEVELS = [['MNGC', '#ef4444'], ['MNDBT', '#f97316'], ['MNC', '#64748b']];
const SLOPE = 0.75;          // mái hạ lưu (ngang : đứng)
const BAY = 14;              // bề rộng một khoang tràn ước tính (m) khi API chỉ có tổng bề rộng

const css = c => Cesium.Color.fromCssColorString(c);

/** Gom tứ giác theo màu thành Geometry (đỉnh riêng mỗi mặt → đổ bóng phẳng). */
class Mesh {
  // withSt: thêm tọa độ texture + tiếp tuyến (cần cho vật liệu nước Material.Water trên bề mặt tự dựng)
  constructor(withSt = false) { this.groups = {}; this.withSt = withSt; }
  quad(a, b, c, d, color) {
    const g = (this.groups[color] ??= { pos: [], idx: [], st: [] });
    const i = g.pos.length / 3;
    for (const p of [a, b, c, d]) g.pos.push(p[0], p[1], p[2]);
    const lu = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 20, lv = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) / 20;
    g.st.push(0, 0, lu, 0, lu, lv, 0, lv);
    g.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  tri(a, b, c, color) {
    const g = (this.groups[color] ??= { pos: [], idx: [], st: [] });
    const i = g.pos.length / 3;
    for (const p of [a, b, c]) g.pos.push(p[0], p[1], p[2]);
    g.st.push(0, 0, 1, 0, 0, 1);
    g.idx.push(i, i + 1, i + 2);
  }
  box(P, s0, s1, t0, t1, z0, z1, color) {   // P(s, t, z) → [e, n, z]
    const v = (s, t, z) => P(s, t, z);
    this.quad(v(s0, t0, z1), v(s1, t0, z1), v(s1, t1, z1), v(s0, t1, z1), color);       // nóc
    this.quad(v(s0, t0, z0), v(s1, t0, z0), v(s1, t0, z1), v(s0, t0, z1), color);
    this.quad(v(s1, t1, z0), v(s0, t1, z0), v(s0, t1, z1), v(s1, t1, z1), color);
    this.quad(v(s0, t1, z0), v(s0, t0, z0), v(s0, t0, z1), v(s0, t1, z1), color);
    this.quad(v(s1, t0, z0), v(s1, t1, z0), v(s1, t1, z1), v(s1, t0, z1), color);
  }
  instances(id) {
    return Object.entries(this.groups).map(([color, g]) => {
      const attributes = {
        position: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(g.pos),
        }),
      };
      if (this.withSt) {
        attributes.st = new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: new Float32Array(g.st) });
      }
      const geometry = new Cesium.Geometry({
        attributes,
        indices: new Uint32Array(g.idx),
        primitiveType: Cesium.PrimitiveType.TRIANGLES,
        boundingSphere: Cesium.BoundingSphere.fromVertices(g.pos),
      });
      Cesium.GeometryPipeline.computeNormal(geometry);
      if (this.withSt) {
        Cesium.GeometryPipeline.computeTangentAndBitangent(geometry);
        return new Cesium.GeometryInstance({ geometry, id });
      }
      return new Cesium.GeometryInstance({ geometry, id, attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(css(color)) } });
    });
  }
}

/** Hệ tọa độ cục bộ của một đập: s dọc trục (m), t về phía thượng lưu (m), z cao độ (m). */
function damFrame(f, ex = 1) {
  const [[lo0, la0], [lo1, la1]] = f.geometry.coordinates;
  const clon = (lo0 + lo1) / 2, clat = (la0 + la1) / 2;
  const kx = 111320 * Math.cos(Cesium.Math.toRadians(clat)), ky = 110540;
  const A = [(lo0 - clon) * kx, (la0 - clat) * ky], B = [(lo1 - clon) * kx, (la1 - clat) * ky];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  const br = Cesium.Math.toRadians(f.properties.upstream_bearing);
  let w = [Math.sin(br), Math.cos(br)];
  const k = w[0] * u[0] + w[1] * u[1];
  w = [w[0] - k * u[0], w[1] - k * u[1]];
  const wn = Math.hypot(...w); w = [w[0] / wn, w[1] / wn];
  // ex = hệ số phóng đại địa hình đang dùng: hình tự dựng không được Cesium phóng đại theo nên tự nhân z
  const P = (s, t, z) => [A[0] + u[0] * s + w[0] * t, A[1] + u[1] * s + w[1] * t, z * ex];
  const toLonLat = (s, t) => { const [e, n] = P(s, t, 0); return [clon + e / kx, clat + n / ky]; };
  const matrix = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(clon, clat, 0));
  const world = (s, t, z) => Cesium.Matrix4.multiplyByPoint(matrix, new Cesium.Cartesian3(...P(s, t, z)), new Cesium.Cartesian3());
  return { L, P, toLonLat, matrix, world };
}

async function sampleHeights(tp, lonlats) {
  const pts = lonlats.map(([lo, la]) => Cesium.Cartographic.fromDegrees(lo, la));
  try { return (await Cesium.sampleTerrainMostDetailed(tp, pts)).map(p => p.height ?? 0); } catch { return pts.map(() => 0); }
}

const sprayImage = (() => {
  let img = null;
  return () => {
    if (img) return img;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32); img = c; return c;
  };
})();

/** Dựng một đập; trả về các primitive/entity để bật–tắt. */
async function buildDam(viewer, f, spec, live, bed, ui, ex = 1) {
  const F = damFrame(f, ex);
  const crest = spec.crest;
  const spillCrest = spec.spillway_crest_elev ?? (spec.MNDBT ? spec.MNDBT - 8 : crest - 10);
  const spillW = spec.spillway_width ?? 30;
  const tail = spec.tailwater_elev;
  const foot = f.properties.footprint_width_m || 80;
  const ext = 0.15 * F.L;                       // kéo dài trục vào hai vai đập

  // Mặt cắt thung lũng: lấy ở hạ lưu (thân đập đã nằm sẵn trong địa hình tại đúng tuyến đập)
  const N = Math.max(16, Math.round((F.L + 2 * ext) / 8));
  const ss = Array.from({ length: N + 1 }, (_, i) => -ext + (F.L + 2 * ext) * i / N);
  const tp = viewer.terrainProvider;
  const [h1, h2] = await Promise.all([
    sampleHeights(tp, ss.map(s => F.toLonLat(s, -(foot + 40)))),
    sampleHeights(tp, ss.map(s => F.toLonLat(s, -(foot + 130)))),
  ]);
  const floor = tail != null ? tail - 12 : -Infinity;
  const valley = ss.map((_, i) => Math.max(Math.min(h1[i], h2[i]) - 2, floor));
  const zAt = s => {                             // nội suy đáy tại vị trí s
    const x = (s + ext) / (F.L + 2 * ext) * N, i = Math.min(N - 1, Math.max(0, Math.floor(x))), r = x - i;
    return valley[i] * (1 - r) + valley[i + 1] * r;
  };
  // Tràn đặt ở chỗ lòng sông thấp nhất trên tuyến
  let iMin = 0; valley.forEach((v, i) => { if (ss[i] >= 0 && ss[i] <= F.L && v < valley[iMin]) iMin = i; });
  const nBay = Math.max(1, Math.round(spillW / BAY));
  const pier = 3, bayW = spillW / nBay, spillTot = spillW + (nBay + 1) * pier;
  const sc = Math.min(Math.max(ss[iMin], spillTot / 2), F.L - spillTot / 2);
  const sp0 = sc - spillTot / 2, sp1 = sc + spillTot / 2;
  const c = Math.max(7, Math.min(12, (crest - Math.min(...valley)) * 0.09));   // bề rộng đỉnh

  // Các mặt cắt dọc trục (thêm mặt cắt kép ở hai mép tràn để có vách đứng)
  const stations = [...ss.filter(s => s < sp0 || s > sp1).map(s => ({ s, top: crest })),
    { s: sp0, top: crest }, { s: sp0, top: spillCrest }, { s: sp1, top: spillCrest }, { s: sp1, top: crest }]
    .sort((a, b) => a.s - b.s || 0);
  for (let i = 0; i < stations.length; i++) if (stations[i].s > sp0 && stations[i].s < sp1) stations[i].top = spillCrest;
  const mesh = new Mesh();
  const prof = ({ s, top }) => {
    const zb = Math.min(zAt(s), top);
    return { s, top, zb, Ub: F.P(s, 0, zb), Ut: F.P(s, 0, top), Dt: F.P(s, -c, top), Db: F.P(s, -(c + SLOPE * (top - zb)), zb) };
  };
  const prs = stations.map(prof);
  for (let i = 0; i < prs.length - 1; i++) {
    const a = prs[i], b = prs[i + 1];
    if (a.top - a.zb < 0.5 && b.top - b.zb < 0.5) continue;   // vai đập nằm trong sườn núi
    const inSpill = a.s >= sp0 && b.s <= sp1 && a.top === spillCrest && b.top === spillCrest;
    mesh.quad(a.Ub, b.Ub, b.Ut, a.Ut, COL.concrete);
    mesh.quad(a.Ut, b.Ut, b.Dt, a.Dt, inSpill ? COL.chute : COL.crest);
    mesh.quad(a.Dt, b.Dt, b.Db, a.Db, inSpill ? COL.chute : COL.concrete);
  }
  // Trụ pin, mặt cầu trên đỉnh tràn, cửa van
  const zbS = zAt(sc);
  const spill = Math.max(0, live?.q_spillway ?? 0);
  const gateTop = Math.min(crest - 2, (spec.MNDBT ?? crest - 3) + 0.5);
  const open = spill > 1 ? Math.min(6, 0.6 + spill / 150) : 0;
  for (let k = 0; k <= nBay; k++) {
    const s0 = sp0 + k * (bayW + pier);
    mesh.box(F.P, s0, s0 + pier, 2, -(c + 6), Math.min(spillCrest, zbS + 1) , crest, COL.pier);
  }
  mesh.box(F.P, sp0, sp1, 0, -c, crest - 1.6, crest, COL.crest);
  for (let k = 0; k < nBay; k++) {
    const s0 = sp0 + pier + k * (bayW + pier);
    mesh.box(F.P, s0 + 0.2, s0 + bayW - 0.2, 0.5, -0.4, spillCrest + open, gateTop + open, COL.gate);
  }
  const id = { layerId: 'dams', code: f.properties.code, lake_id: f.properties.lake_id };
  const prims = [];
  prims.push(viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances: mesh.instances(id), modelMatrix: F.matrix, asynchronous: false,
    appearance: new Cesium.PerInstanceColorAppearance({ closed: false, translucent: false }),
  })));

  // Dòng xả qua tràn: mặt nước trắng chảy trên mái tràn + bụi nước ở chân tràn
  let spray = null;
  if (spill > 1) {
    const wm = new Mesh(true);
    const zT = spillCrest + 0.6, zB = zbS + 0.6;
    const q = (s, t, z) => F.P(s, t, z);
    wm.quad(q(sp0 + pier, 0.4, zT), q(sp1 - pier, 0.4, zT), q(sp1 - pier, -c, zT), q(sp0 + pier, -c, zT), 'w');
    wm.quad(q(sp0 + pier, -c, zT), q(sp1 - pier, -c, zT), q(sp1 - pier, -(c + SLOPE * (spillCrest - zbS)) - 0.6, zB), q(sp0 + pier, -(c + SLOPE * (spillCrest - zbS)) - 0.6, zB), 'w');
    const inst = wm.instances(id);
    prims.push(viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: inst, modelMatrix: F.matrix, asynchronous: false,
      appearance: new Cesium.MaterialAppearance({
        material: Cesium.Material.fromType('Water', {
          baseWaterColor: new Cesium.Color(0.92, 0.96, 1.0, 0.9), blendColor: new Cesium.Color(0.8, 0.9, 1.0, 0.9),
          normalMap: Cesium.buildModuleUrl('Assets/Textures/waterNormals.jpg'),
          frequency: 400, animationSpeed: 0.25, amplitude: 12, specularIntensity: 0.9,
        }),
        materialSupport: Cesium.MaterialAppearance.MaterialSupport.ALL, translucent: true, faceForward: true,
      }),
    })));
    const toe = F.world(sc, -(c + SLOPE * (spillCrest - zbS)) - 4, zbS + 2);
    spray = viewer.scene.primitives.add(new Cesium.ParticleSystem({
      image: sprayImage(), modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(toe),
      emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(35)),
      emissionRate: Math.min(150, 30 + spill / 4), lifetime: 30,
      minimumParticleLife: 0.8, maximumParticleLife: 1.8, minimumSpeed: 8, maximumSpeed: 18,
      startScale: 1.0, endScale: 3.5, imageSize: new Cesium.Cartesian2(14, 14),
      startColor: Cesium.Color.WHITE.withAlpha(0.85), endColor: Cesium.Color.WHITE.withAlpha(0.0),
    }));
    prims.push(spray);
  }

  // Lòng hồ + mặt nước ở mực nước thật
  const htl = live?.htl > 0 ? live.htl : spec.MNDBT;
  const assumed = !(live?.htl > 0);
  let clipRing = null;
  if (bed) {
    const inner = bed.d.map((d, i) => (d > Math.min(150, bed.max_d * 0.6) ? i : -1)).filter(i => i >= 0);
    const pick = inner.filter((_, k) => k % Math.max(1, Math.floor(inner.length / 40)) === 0).slice(0, 40);
    const surf = await sampleHeights(tp, pick.map(i => [bed.lon[i], bed.lat[i]]));
    surf.sort((a, b) => a - b);
    const S = surf.length ? surf[Math.floor(surf.length / 2)] : (spec.MNDBT ?? htl);      // mặt hồ phẳng của địa hình nền
    const B = Math.min(...valley) + 2;                                                     // đáy sông tại tuyến đập
    const D = Math.max(60, Math.min(320, bed.max_d * 0.85));                              // bề rộng mái bờ
    const pos = [];
    for (let i = 0; i < bed.d.length; i++) {
      const z = S - 0.4 - (S - 0.4 - B) * Math.pow(Math.min(1, bed.d[i] / D), 0.85);   // mép hơi thấp hơn địa hình → địa hình che kín đường nối
      const p = Cesium.Cartesian3.fromDegrees(bed.lon[i], bed.lat[i], z * ex);
      pos.push(p.x, p.y, p.z);
    }
    const geometry = new Cesium.Geometry({
      attributes: { position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(pos) }) },
      indices: new Uint32Array(bed.tri), primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: Cesium.BoundingSphere.fromVertices(pos),
    });
    Cesium.GeometryPipeline.computeNormal(geometry);
    prims.push(viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({ geometry, id, attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(css(COL.bed)) } }),
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: false }), asynchronous: false,
    })));
    clipRing = Cesium.Cartesian3.fromDegreesArray(bed.clip);
    const water = Cesium.Cartesian3.fromDegreesArray(bed.shore);   // mép mặt nước = bờ hồ OSM
    prims.push(viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolygonGeometry({ polygonHierarchy: new Cesium.PolygonHierarchy(water), height: htl * ex, vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT }),
        id,
      }),
      appearance: new Cesium.EllipsoidSurfaceAppearance({
        aboveGround: true,
        material: Cesium.Material.fromType('Water', {
          baseWaterColor: new Cesium.Color(0.12, 0.38, 0.45, 0.88), blendColor: new Cesium.Color(0.1, 0.5, 0.45, 0.88),
          normalMap: Cesium.buildModuleUrl('Assets/Textures/waterNormals.jpg'),
          frequency: 1800, animationSpeed: 0.015, amplitude: 4, specularIntensity: 0.6,
        }),
      }),
      asynchronous: false,
    })));
  }

  // Vạch MNC / MNDBT / MNGC trên mặt thượng lưu + nhãn số liệu
  const spanFor = z => prs.filter(p => p.zb < z && p.top >= z - 0.01);
  for (const [k, color] of LEVELS) {
    const z = spec[k]; if (!z) continue;
    const span = spanFor(z); if (span.length < 2) continue;
    const a = span[0].s, b = span[span.length - 1].s;
    const atEnd = k === 'MNGC';                 // MNGC sát MNDBT → đặt nhãn ở đầu kia của vạch cho khỏi chồng
    ui.entities.add({
      polyline: { positions: [F.world(a, 0.8, z), F.world(b, 0.8, z)], width: 3, material: css(color), arcType: Cesium.ArcType.NONE },
      position: F.world(atEnd ? b : a, 1, z),
      label: {
        text: `${k} ${z.toLocaleString('vi-VN')} m`, font: '600 26px "Segoe UI", sans-serif', scale: 0.5, fillColor: css(color),
        outlineColor: Cesium.Color.WHITE, outlineWidth: 5, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: atEnd ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.RIGHT,
        pixelOffset: new Cesium.Cartesian2(atEnd ? 6 : -6, 0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6000), disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
  const fmt = v => (v == null ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 }));
  ui.entities.add({
    position: F.world(sc, -c / 2, crest + 28),
    label: {
      text: `${f.properties.name.replace(/^Hồ /, 'Đập ')}\nMực nước ${fmt(htl)} m${assumed ? ' (giả định = MNDBT)' : ''}\nQ đến ${fmt(live?.qvao)} · xả tràn ${fmt(live?.q_spillway)} · tua-bin ${fmt(live?.q_turbine)} m³/s`,
      // chữ vẽ ở cỡ ×2 rồi thu 0,5 → nét căng trên màn hình tỷ lệ 125–200%
      font: '600 28px "Segoe UI", sans-serif', scale: 0.5, fillColor: Cesium.Color.WHITE, showBackground: true,
      backgroundColor: new Cesium.Color(0.06, 0.16, 0.36, 0.88), backgroundPadding: new Cesium.Cartesian2(18, 12),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM, distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9000),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  return { prims, clipRing };
}

export async function loadDams(viewer, def) {
  const [dams, beds, specs, lives] = await Promise.all([
    fetch(def.url).then(r => r.json()),
    fetch(def.beds).then(r => r.json()),
    mapApi.getLakeSpecs().catch(() => []),
    mapApi.getReservoirs().catch(() => []),
  ]);
  const specOf = id => (Array.isArray(specs) ? specs : []).find(s => Number(s.lake_id) === id);
  const liveOf = id => (Array.isArray(lives) ? lives : []).find(r => Number(r.Id_Lake) === id);
  const ui = new Cesium.CustomDataSource('dams_ui');
  await viewer.dataSources.add(ui);
  const damLakeIds = new Set(dams.features.map(f => f.properties.lake_osm_id).filter(Boolean));
  let all = [], clipping = null, built = [], visible = false;

  const build = async ex => {
    all.forEach(p => viewer.scene.primitives.remove(p));
    ui.entities.removeAll();
    all = []; built = [];
    const clips = [];
    for (const f of dams.features) {
      const spec = specOf(f.properties.lake_id);
      if (!spec?.crest) continue;                           // chưa có thông số → chưa dựng
      try {
        const r = await buildDam(viewer, f, spec, liveOf(f.properties.lake_id), beds[f.properties.lake_id], ui, ex);
        all.push(...r.prims); if (r.clipRing) clips.push(r.clipRing); built.push(f.properties.name);
      } catch (e) { console.warn('Dựng đập lỗi', f.properties.name, e); }
    }
    // Cắt bỏ mặt hồ "phẳng" của địa hình nền trong các hồ đã dựng lòng hồ
    clipping = clips.length ? new Cesium.ClippingPolygonCollection({ polygons: clips.map(positions => new Cesium.ClippingPolygon({ positions })) }) : null;
    applyVisible();
  };
  // Lớp "Mặt nước hồ chứa" (OSM, dán phẳng lên địa hình) trùng với mặt nước 3D → ẩn những hồ đã dựng
  const syncLakes = () => {
    const ds = viewer.dataSources.getByName('lakes')[0];
    if (!ds) return false;
    for (const e of ds.entities.values) {
      if (damLakeIds.has(e.properties?.osm_id?.getValue())) e.show = !visible;
    }
    return true;
  };
  const applyVisible = () => {
    all.forEach(p => { p.show = visible; });
    ui.show = visible;
    viewer.scene.globe.clippingPolygons = visible ? clipping : undefined;
    syncLakes();
    renderBurst(viewer, 800);
  };
  const waitLakes = setInterval(() => { if (syncLakes()) clearInterval(waitLakes); }, 1000);
  setTimeout(() => clearInterval(waitLakes), 60000);

  viewer.clock.shouldAnimate = true;                         // sóng nước, bụi nước chuyển động
  // Hoạt ảnh nước ~20 khung/giây khi đứng gần đập; lúc đang di chuyển Cesium tự vẽ nên không cần ép thêm.
  let moving = false;
  viewer.camera.moveStart.addEventListener(() => { moving = true; });
  viewer.camera.moveEnd.addEventListener(() => { moving = false; });
  const anim = setInterval(() => {
    if (viewer.isDestroyed()) { clearInterval(anim); clearInterval(waitLakes); return; }
    if (visible && !moving && viewer.camera.positionCartographic.height < 25000) viewer.scene.requestRender();
  }, 50);
  visible = Boolean(def.visible);
  await build(viewer.scene.verticalExaggeration || 1);
  console.info(`Đập 3D: ${built.length} đập – ${built.join(', ')}`);
  let pendingEx = null;
  return {
    def,
    get built() { return built; },
    setVisible(on) { visible = on; applyVisible(); },
    setOpacity() {},
    /** Thanh "Địa hình ×": dựng lại đập/lòng hồ/mặt nước theo hệ số mới (gộp các lần kéo liên tiếp). */
    setExaggeration(ex) {
      if (pendingEx !== null) { pendingEx = ex; return; }
      pendingEx = ex;
      setTimeout(async () => { const v = pendingEx; await build(v); pendingEx = null; }, 400);
    },
    // Bấm vào đập → chọn hồ tương ứng (mở thẻ Thông tin / Hiện trạng / Dự báo của hồ)
    redirect: id => ({ layerId: 'reservoirs', code: `HO-${id.lake_id}` }),
  };
}
