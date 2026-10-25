import * as Cesium from 'cesium';
import { demOffset } from '../hoian/hoian.js';

// Mô phỏng diễn biến lũ theo giờ (lộ trình 9.1): mọi lớp chạy theo CÙNG một giờ của trận lũ.
//   thượng nguồn  hồ chứa: Q đến, Q xả, mực nước, mưa, chế độ QĐ 1865 (chấm màu + nhãn); mưa rơi theo mưa đo
//   sông          vệt sáng chạy dọc dòng chảy, tốc độ/màu theo lưu lượng từng đoạn
//   hạ du         trạm KTTV: mực nước + màu theo cấp báo động
//   Hội An        mặt nước 3D đặt ĐÚNG cao độ (địa hình tự che phần cao hơn mặt nước → nhà bị nước ngập chân),
//                 nhà/đường tô theo độ sâu tại chỗ
// Dữ liệu: /data/dt/sim/<trận>/ do digital_twin/scripts/23_sim_package.py tạo (số liệu đo xem lại, không phải dự báo).

export const MODE_COLOR = {
  cut: '#dc2626', maintain: '#f59e0b', lower: '#2563eb', lower_to_pre_flood: '#2563eb', safety: '#7c3aed',
  normal: '#16a34a', store: '#0891b2', follow_inflow: '#64748b', cooperate: '#64748b',
};
export const ALARM_COLOR = ['#16a34a', '#eab308', '#f97316', '#dc2626'];          // dưới BĐ I, BĐ I, II, III
const BUILDING_STOPS = [0.05, 0.5, 1, 2, 3];                                       // khớp DEPTH_STOPS của hoian.js
const ROAD_STOPS = [0.15, 0.3, 0.5, 1];                                            // khớp ROAD_DEPTH_STOPS

/** Cấp báo động (0 = dưới BĐ I … 3 = BĐ III) của mực nước h; null nếu thiếu. */
export function alarmLevel(h, alarm) {
  if (h == null || !alarm) return null;
  let k = 0;
  alarm.forEach((a, i) => { if (h >= a) k = i + 1; });
  return k;
}

const flowColor = q => (q < 200 ? '#7dd3fc' : q < 1000 ? '#38bdf8' : q < 3000 ? '#0ea5e9' : q < 6000 ? '#f59e0b' : '#ef4444');
const at = (arr, h) => (arr ? arr[Math.max(0, Math.min(arr.length - 1, Math.round(h)))] : null);
const fmt = (v, d = 0) => (v == null ? '–' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: d }));
const cls = (d, stops) => { let k = 0; for (const s of stops) if (d >= s) k++; return k; };

// Vệt sáng chạy dọc đường (materialInput.s = 0…1 theo chiều vẽ, tức chiều dòng chảy của mạng sông)
const FLOW_SOURCE = `czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  float s = fract(materialInput.s * repeat - time * speed);
  float band = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.3, 0.55, s));
  m.diffuse = color.rgb;
  m.emission = color.rgb * band * 0.9;
  m.alpha = color.a * (0.35 + 0.65 * band);
  return m;
}`;

function lengthKm(coords) {
  let s = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1], [x1, y1] = coords[i];
    s += Math.hypot((x1 - x0) * 111.32 * Math.cos((y0 * Math.PI) / 180), (y1 - y0) * 110.57);
  }
  return s;
}

// Vệt mưa trong không gian màn hình: các cột vệt rơi xiên, mật độ và độ đậm theo cường độ mưa (0…1)
const RAIN_SHADER = `
uniform sampler2D colorTexture;
uniform float intensity;
in vec2 v_textureCoordinates;
float hash(float x) { return fract(sin(x * 133.3) * 13.13); }
void main(void) {
  vec4 scene = texture(colorTexture, v_textureCoordinates);
  float t = czm_frameNumber / 90.0;
  vec2 res = czm_viewport.zw;
  vec2 uv = (gl_FragCoord.xy * 2.0 - res) / min(res.x, res.y);
  float a = -0.25;
  uv = mat2(cos(a), -sin(a), sin(a), cos(a)) * uv;
  uv *= length(uv + vec2(0.0, 4.9)) * 0.3 + 1.0;
  float v = 1.0 - sin(hash(floor(uv.x * 100.0)) * 2.0);
  float streak = clamp(abs(sin(20.0 * t * v + uv.y * (5.0 / (2.0 + v)))) - (0.985 - 0.035 * intensity), 0.0, 1.0) * 20.0;
  vec3 rain = vec3(0.72, 0.8, 0.9) * v * streak;
  vec3 dim = scene.rgb * (1.0 - 0.22 * intensity);              // trời tối đi khi mưa to
  out_FragColor = vec4(dim + rain * 0.45 * intensity, scene.a);
}`;

export async function loadSimulation(viewer, { dir, base = '/data/dt/sim/' }) {
  const root = `${base}${dir}/`;
  const sim = await (await fetch(`${root}sim.json`)).json();
  const scene = viewer.scene;
  const n = sim.time.length;
  const ds = new Cesium.CustomDataSource('sim');
  await viewer.dataSources.add(ds);

  // ---------------------------------------------------------------- hồ chứa, trạm
  const lakeEnt = sim.lakes.filter(l => l.lon != null).map(l => ({
    l,
    e: ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(l.lon, l.lat),
      point: { pixelSize: 10, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.WHITE, outlineWidth: 2,
               heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: l.name, font: '600 12px system-ui, sans-serif', fillColor: Cesium.Color.WHITE, showBackground: true,
               backgroundColor: Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.78), backgroundPadding: new Cesium.Cartesian2(7, 4),
               verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -14),
               heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
               scaleByDistance: new Cesium.NearFarScalar(3e4, 1, 3e5, 0.7) },
    }),
  }));
  const stEnt = sim.stations.map(s => ({
    s,
    e: ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
      point: { pixelSize: 11, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.fromCssColorString('#0f172a'), outlineWidth: 2,
               heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: s.name, font: '600 12px system-ui, sans-serif', fillColor: Cesium.Color.WHITE, showBackground: true,
               backgroundPadding: new Cesium.Cartesian2(7, 4), verticalOrigin: Cesium.VerticalOrigin.TOP,
               pixelOffset: new Cesium.Cartesian2(0, 12), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
               disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: new Cesium.NearFarScalar(3e4, 1, 3e5, 0.7) },
    }),
  }));

  // ---------------------------------------------------------------- sông: vệt sáng chảy theo lưu lượng
  const rivers = sim.rivers.map(r => {
    const qMax = Math.max(...r.q);
    const material = new Cesium.Material({
      fabric: { uniforms: { color: Cesium.Color.fromCssColorString('#38bdf8'), time: 0, repeat: Math.max(1, lengthKm(r.coords) / 1.2), speed: 0.4 },
                source: FLOW_SOURCE },
      translucent: true,
    });
    const prim = scene.groundPrimitives.add(new Cesium.GroundPolylinePrimitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({
          positions: Cesium.Cartesian3.fromDegreesArray(r.coords.flat()),
          width: Math.min(11, Math.max(2.5, 2 + 2.4 * Math.log10(Math.max(qMax, 60) / 60))),
        }),
      }),
      appearance: new Cesium.PolylineMaterialAppearance({ material }),
      asynchronous: true, allowPicking: false,
    }));
    return { r, material, prim };
  });
  const t0 = performance.now();
  const tick = () => { const s = (performance.now() - t0) / 1000; for (const x of rivers) x.material.uniforms.time = s; };
  scene.preRender.addEventListener(tick);

  // ---------------------------------------------------------------- mưa + bầu trời u ám
  // Mưa: một lượt hậu kỳ trên GPU vẽ vệt mưa phủ màn hình. Bản đầu dùng ParticleSystem – mưa to sinh tới ~60 nghìn hạt,
  // mỗi hạt tính lại bằng JS mỗi khung hình → treo máy (phản ánh 26/10/2026).
  let rainK = 0;
  const rainStage = scene.postProcessStages.add(new Cesium.PostProcessStage({
    name: 'sim_rain',
    fragmentShader: RAIN_SHADER,
    uniforms: { intensity: () => rainK },
  }));
  rainStage.enabled = false;
  const sky0 = { b: scene.skyAtmosphere?.brightnessShift ?? 0, s: scene.skyAtmosphere?.saturationShift ?? 0,
                 g: scene.globe.atmosphereBrightnessShift ?? 0, fog: scene.fog.density };
  const setWeather = mm => {
    const k = Math.min(1, (mm ?? 0) / 12);                         // 12 mm/giờ trở lên: mưa rất to
    rainK = k;
    rainStage.enabled = k > 0.02;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.brightnessShift = sky0.b - 0.45 * k;
      scene.skyAtmosphere.saturationShift = sky0.s - 0.5 * k;
    }
    scene.globe.atmosphereBrightnessShift = sky0.g - 0.35 * k;
    scene.fog.density = sky0.fog * (1 + 5 * k);
    return k;
  };

  // ---------------------------------------------------------------- Hội An: mặt nước 3D + nhà/đường
  const hg = sim.hoian?.grid;
  let fine = null, cell = null, offset = 0, appearance = null, water = null;
  const bins = {};
  const prepareHoian = async () => {
    if (cell || !hg) return;
    fine = await (await fetch('/data/dt/hoian/flood_grid.json')).json();
    const ratio = Math.round(hg.dx / fine.dx);
    const N = hg.nx * hg.ny;
    const landMin = new Float32Array(N).fill(NaN), hasWater = new Uint8Array(N);
    for (let r = 0; r < hg.ny; r++) for (let c = 0; c < hg.nx; c++) {
      let m = Infinity, w = 0;
      for (let rr = r * ratio; rr < Math.min((r + 1) * ratio, fine.ny); rr++)
        for (let cc = c * ratio; cc < Math.min((c + 1) * ratio, fine.nx); cc++) {
          const k = rr * fine.nx + cc;
          if (fine.source[k]) w = 1; else m = Math.min(m, fine.dtm[k]);
        }
      landMin[r * hg.nx + c] = Number.isFinite(m) ? m : NaN;
      hasWater[r * hg.nx + c] = w;
    }
    cell = { landMin, hasWater };
    offset = await demOffset(viewer, fine);
    appearance = new Cesium.EllipsoidSurfaceAppearance({
      material: Cesium.Material.fromType(Cesium.Material.WaterType, {
        baseWaterColor: new Cesium.Color(0.42, 0.36, 0.22, 0.78),           // nước lũ đục phù sa
        blendColor: new Cesium.Color(0.3, 0.4, 0.35, 0.78),
        normalMap: Cesium.buildModuleUrl('Assets/Textures/waterNormals.jpg'),
        frequency: 900, animationSpeed: 0.015, amplitude: 4, specularIntensity: 0.55,
      }),
      aboveGround: false, translucent: true,
    });
  };
  const rg = sim.region?.grid;                        // mặt nước toàn vùng ~300 m – cho khu người dùng tự dựng
  const frames = async (method, kind = 'hoian') => {
    const src = kind === 'region' ? sim.region : sim.hoian;
    const m = src?.methods?.[method];
    if (!m) return null;
    const key = `${kind}_${method}`;
    if (!bins[key]) {
      const buf = await (await fetch(`${root}${m.file}`)).arrayBuffer();
      bins[key] = { hours: m.frame_hours, data: new Uint16Array(buf), size: src.grid.nx * src.grid.ny };
    }
    return bins[key];
  };
  /** Mặt nước (m, cao độ DEM) trên lưới 3″ tại giờ h – nội suy tuyến tính giữa hai khung; null nếu chưa có khung. */
  const wseAt = (b, h) => {
    if (!b || h < b.hours[0]) return null;
    let k = b.hours.findIndex(x => x > h) - 1;
    if (k < 0) k = b.hours.length - 1;
    const k1 = Math.min(k + 1, b.hours.length - 1);
    const w = k1 === k ? 0 : (h - b.hours[k]) / (b.hours[k1] - b.hours[k]);
    const out = new Float32Array(b.size);
    for (let i = 0; i < b.size; i++) {
      const a = b.data[k * b.size + i], c = b.data[k1 * b.size + i];
      out[i] = a && c ? ((1 - w) * a + w * c) / 100 - 10 : a ? a / 100 - 10 : c ? c / 100 - 10 : NaN;
    }
    return out;
  };
  const sampler = (wse, g = hg) => (lon, lat) => {
    const fx = (lon - g.west) / g.dx - 0.5, fy = (g.north - lat) / g.dy - 0.5;
    const c = Math.floor(fx), r = Math.floor(fy);
    let s = 0, wsum = 0;
    for (const [dr, dc, w] of [[0, 0, (1 - (fx - c)) * (1 - (fy - r))], [0, 1, (fx - c) * (1 - (fy - r))],
      [1, 0, (1 - (fx - c)) * (fy - r)], [1, 1, (fx - c) * (fy - r)]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= g.ny || cc >= g.nx) continue;
      const v = wse[rr * g.nx + cc];
      if (Number.isFinite(v)) { s += v * w; wsum += w; }
    }
    return wsum > 0 ? s / wsum : NaN;
  };
  const inGrid = (g, lon, lat) => g && lon >= g.west && lon <= g.west + g.dx * g.nx && lat <= g.north && lat >= g.north - g.dy * g.ny;

  /** Mặt nước 3D cho khu tự dựng: lưới nút ~40 m trên khung khu, cao độ mặt nước tại nút + lệch địa hình; ô vẽ khi có
   *  ít nhất một nút ngập (địa hình tự che phần cao hơn mặt nước). */
  const buildAreaWater = (area, sample) => {
    const b = area.bbox;
    const nx = Math.max(4, Math.round(((b.east - b.west) * 111320 * Math.cos(b.south * Math.PI / 180)) / 40));
    const ny = Math.max(4, Math.round(((b.north - b.south) * 110574) / 40));
    const zs = new Float64Array((nx + 1) * (ny + 1)), wet = new Uint8Array((nx + 1) * (ny + 1));
    for (let r = 0; r <= ny; r++) for (let c = 0; c <= nx; c++) {
      const lon = b.west + (c / nx) * (b.east - b.west), lat = b.north - (r / ny) * (b.north - b.south);
      const z = sample(lon, lat) + offset;
      zs[r * (nx + 1) + c] = z;
      wet[r * (nx + 1) + c] = Number.isFinite(z) && z - area.terrainAt(lon, lat) > 0.05 ? 1 : 0;
    }
    const used = new Int32Array(zs.length).fill(-1), pos = [], st = [], idx = [];
    const node = (r, c) => {
      const k = r * (nx + 1) + c;
      if (used[k] < 0) {
        used[k] = pos.length / 3;
        const p = Cesium.Cartesian3.fromDegrees(b.west + (c / nx) * (b.east - b.west), b.north - (r / ny) * (b.north - b.south), zs[k]);
        pos.push(p.x, p.y, p.z); st.push(c / nx * 4, 1 - r / ny * 4);
      }
      return used[k];
    };
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const ks = [r * (nx + 1) + c, r * (nx + 1) + c + 1, (r + 1) * (nx + 1) + c, (r + 1) * (nx + 1) + c + 1];
      if (!ks.some(k => wet[k]) || ks.some(k => !Number.isFinite(zs[k]))) continue;
      const a = node(r, c), bb = node(r, c + 1), d = node(r + 1, c), e = node(r + 1, c + 1);
      idx.push(a, d, bb, bb, d, e);
    }
    if (!idx.length) return null;
    const positions = new Float64Array(pos);
    return new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({ geometry: new Cesium.Geometry({
        attributes: {
          position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions }),
          st: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: new Float32Array(st) }),
        },
        indices: new Uint32Array(idx), primitiveType: Cesium.PrimitiveType.TRIANGLES, boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
      }) }),
      appearance, asynchronous: false, allowPicking: false, compressVertices: false,
    });
  };
  const buildWater = wse => {
    const { nx, ny } = hg;
    const wet = new Uint8Array(nx * ny);
    for (let i = 0; i < wet.length; i++) {
      wet[i] = Number.isFinite(wse[i]) && Number.isFinite(cell.landMin[i]) && wse[i] - cell.landMin[i] > 0.05 ? 1 : 0;
    }
    // ô sông/kênh giáp ô đất đang ngập: mặt nước liền một dải qua lòng sông (không phủ biển khơi)
    const wetAll = wet.slice();
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const i = r * nx + c;
      if (wet[i] || !cell.hasWater[i] || !Number.isFinite(wse[i])) continue;
      outer: for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < ny && cc < nx && wet[rr * nx + cc]) { wetAll[i] = 1; break outer; }
      }
    }
    const nodeH = new Float64Array((nx + 1) * (ny + 1)), nodeN = new Uint8Array((nx + 1) * (ny + 1));
    let cells = 0;
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const i = r * nx + c;
      if (!wetAll[i]) continue;
      cells++;
      for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const k = (r + dr) * (nx + 1) + c + dc; nodeH[k] += wse[i]; nodeN[k]++; }
    }
    if (!cells) return null;
    const used = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
    const pos = [], st = [], idx = [];
    const node = (r, c) => {
      const k = r * (nx + 1) + c;
      if (used[k] < 0) {
        used[k] = pos.length / 3;
        const p = Cesium.Cartesian3.fromDegrees(hg.west + c * hg.dx, hg.north - r * hg.dy, nodeH[k] / nodeN[k] + offset);
        pos.push(p.x, p.y, p.z);
        st.push(c / nx, 1 - r / ny);
      }
      return used[k];
    };
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      if (!wetAll[r * nx + c]) continue;
      const a = node(r, c), b = node(r, c + 1), d = node(r + 1, c), e = node(r + 1, c + 1);
      idx.push(a, d, b, b, d, e);
    }
    const positions = new Float64Array(pos);
    return new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.Geometry({
          attributes: {
            position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions }),
            st: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: new Float32Array(st) }),
          },
          indices: new Uint32Array(idx), primitiveType: Cesium.PrimitiveType.TRIANGLES,
          boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
        }),
      }),
      appearance, asynchronous: false, allowPicking: false, compressVertices: false,
    });
  };

  let roadPts = null;          // đỉnh từng đoạn đường + cao độ mặt đất (lưới 30 m) – tính một lần
  const roadPoints = roads => {
    if (roadPts || !fine) return roadPts;
    const dtmAt = (lon, lat) => {
      const c = Math.floor((lon - fine.west) / fine.dx), r = Math.floor((fine.north - lat) / fine.dy);
      return r >= 0 && c >= 0 && r < fine.ny && c < fine.nx ? fine.dtm[r * fine.nx + c] : NaN;
    };
    roadPts = roads.features.map(f => {
      const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
      return lines.flat().map(([lon, lat]) => [lon, lat, dtmAt(lon, lat)]);
    });
    return roadPts;
  };

  let visible = true, method = 'stage', hourNow = 0, active = true;
  const rrm = scene.requestRenderMode, tfr = viewer.targetFrameRate;
  scene.requestRenderMode = false;                 // dòng chảy, mưa, sóng nước cần vẽ liên tục…
  viewer.targetFrameRate = 30;                     // …nhưng 30 khung/giây là đủ mượt, giảm nửa tải GPU so với vẽ tối đa

  /** Đặt giờ; trả NGAY số liệu thượng nguồn/trạm/mưa cho bảng thông tin. Phần Hội An (lần đầu phải tải lưới, lấy mẫu
   *  địa hình) chạy sau rồi gọi opts.onImpact(impact, giờ) – không bắt bảng thông tin chờ. */
  function setHour(h, opts = {}) {
    hourNow = h;
    method = opts.method ?? method;
    const i = Math.max(0, Math.min(n - 1, Math.round(h)));
    const rain = sim.basin_rain_mm[i];
    setWeather(visible ? rain : 0);

    const lakes = sim.lakes.map(l => {
      const qin = at(l.q_in, h), qout = at(l.q_out, h), lv = at(l.h, h), mode = l.mode ? at(l.mode, h) : null;
      // xu hướng so với 3 giờ TRƯỚC – không nhìn trước số liệu tương lai (sẽ thành "dự báo hoàn hảo" giả)
      return { id: l.id, name: l.name, q_in: qin, q_out: qout, h: lv, rain: at(l.rain, h), mode, MNDBT: l.MNDBT, MNGC: l.MNGC,
               q_in_prev3: i >= 3 ? at(l.q_in, h - 3) : null };
    });
    for (const { l, e } of lakeEnt) {
      const s = lakes.find(x => x.id === l.id);
      const col = Cesium.Color.fromCssColorString(MODE_COLOR[s.mode] ?? (s.q_out > (s.q_in ?? 0) * 1.1 ? '#2563eb' : '#0ea5e9'));
      e.point.color = col;
      e.point.pixelSize = 8 + Math.min(16, 3 * Math.log10(Math.max(1, s.q_out ?? 1)));
      e.label.text = `${l.name}\nQ đến ${fmt(s.q_in)} · Q xả ${fmt(s.q_out)} m³/s\nH ${fmt(s.h, 2)} m${s.rain ? ` · mưa ${fmt(s.rain, 1)} mm` : ''}`;
    }
    const stations = sim.stations.map(s => {
      const lv = at(s.h, h);
      return { code: s.code, name: s.name, h: lv, alarm: s.alarm, level: alarmLevel(lv, s.alarm) };
    });
    for (const { s, e } of stEnt) {
      const x = stations.find(y => y.code === s.code);
      const col = Cesium.Color.fromCssColorString(x.level == null ? '#64748b' : ALARM_COLOR[x.level]);
      e.point.color = col;
      e.label.backgroundColor = col.withAlpha(0.88);
      e.label.text = `${s.name} ${x.h == null ? '–' : `${fmt(x.h, 2)} m`}${x.level ? ` · BĐ ${['', 'I', 'II', 'III'][x.level]}` : ''}`;
    }
    for (const x of rivers) {
      const q = at(x.r.q, h) ?? 0;
      x.material.uniforms.color = Cesium.Color.fromCssColorString(flowColor(q)).withAlpha(0.95);
      x.material.uniforms.speed = 0.15 + 0.12 * Math.log10(Math.max(q, 1));
    }

    if (hg) scheduleHoian(h, opts);
    return { hour: i, time: sim.time[i], rain_mm: rain, lakes, stations, impact: lastImpact };
  }

  // Phát nhanh (4×) đổi giờ nhanh hơn lượt tính Hội An (55 nghìn nhà + mặt nước) → không xếp hàng mọi giờ, chỉ giữ giờ mới nhất
  let hoianBusy = false, hoianNext = null;
  function scheduleHoian(h, opts) {
    if (hoianBusy) { hoianNext = [h, opts]; return; }
    hoianBusy = true;
    updateHoian(h, opts)
      .then(imp => { if (imp) opts.onImpact?.(imp, h); })
      .catch(e => console.warn('Mô phỏng Hội An lỗi', e))
      .finally(() => {
        hoianBusy = false;
        if (hoianNext && active) { const [nh, no] = hoianNext; hoianNext = null; scheduleHoian(nh, no); }
      });
  }

  let lastImpact = null;
  async function updateHoian(h, opts) {
    const impact = { water: false, houses: null, roads: null };
    {
      await prepareHoian();
      const b = await frames(method);
      if (!active || hourNow !== h) return null;                     // đã chuyển giờ khác trong lúc tải
      const wse = wseAt(b, h);
      const old = water;
      water = wse && visible ? scene.primitives.add(buildWater(wse) ?? new Cesium.PrimitiveCollection()) : null;
      if (old) scene.primitives.remove(old);
      impact.water = Boolean(water);
      const sample = wse && sampler(wse);
      const bld = opts.buildings;
      if (bld) {
        const depths = new Float32Array(bld.items.length);
        const counts = [0, 0, 0, 0, 0, 0];
        for (let k = 0; k < depths.length; k++) {
          const z = sample ? sample(bld.centroids.lon[k], bld.centroids.lat[k]) : NaN;
          depths[k] = Number.isFinite(z) ? z - bld.items[k][bld.F.ground_m] : 0;
          counts[cls(depths[k], BUILDING_STOPS)]++;
        }
        bld.setDepths(depths);
        impact.houses = { total: depths.length - counts[0], byClass: counts.slice(1) };
      }
      const roads = opts.roads;
      if (roads) {
        const pts = roadPoints(roads);
        const depths = new Float32Array(pts.length), km = [0, 0, 0, 0];
        pts.forEach((p, k) => {
          let d = 0;
          if (sample) for (const [lon, lat, z0] of p) { const z = sample(lon, lat); if (Number.isFinite(z) && Number.isFinite(z0)) d = Math.max(d, z - z0); }
          depths[k] = d;
          const c = cls(d, ROAD_STOPS);
          if (c) km[c - 1] += roads.features[k].properties.length_km ?? 0;
        });
        roads.setDepths(depths);
        impact.roads = { km_total: km.reduce((a, v) => a + v, 0), km_by_class: km };
      }

      // khu người dùng tự dựng: lưới Hội An nếu nằm trong, ngoài ra mặt nước toàn vùng ~300 m
      const area = opts.area;
      if (area) {
        const rb = rg ? await frames(method, 'region') : null;
        if (!active || hourNow !== h) return null;
        const rw = wseAt(rb, h);
        const sRe = rw && sampler(rw, rg);
        const sampleAny = (lon, lat) => {
          if (sample && inGrid(hg, lon, lat)) { const v = sample(lon, lat); if (Number.isFinite(v)) return v; }
          return sRe ? sRe(lon, lat) : NaN;
        };
        const B = area.buildings;
        const bd = new Float32Array(B.count), counts = [0, 0, 0, 0, 0, 0];
        for (let k = 0; k < B.count; k++) {
          const z = sampleAny(B.lon[k], B.lat[k]) + offset;               // cùng hệ cao độ địa hình hiển thị với nền nhà
          bd[k] = Number.isFinite(z) ? z - B.ground[k] : 0;
          counts[cls(bd[k], BUILDING_STOPS)]++;
        }
        const km = [0, 0, 0, 0];
        const rd = area.roadPoints.map((p, k) => {
          let d = 0;
          for (const [lon, lat, z0] of p) { const z = sampleAny(lon, lat) + offset; if (Number.isFinite(z)) d = Math.max(d, z - z0); }
          const c = cls(d, ROAD_STOPS);
          if (c) km[c - 1] += area.roadLengthKm[k];
          return d;
        });
        area.setDepths(bd, rd);
        const b = area.bbox;
        const coveredByHoian = inGrid(hg, b.west, b.north) && inGrid(hg, b.east, b.south) && water;
        const oldA = areaWater;
        areaWater = !coveredByHoian && visible ? scene.primitives.add(buildAreaWater(area, sampleAny) ?? new Cesium.PrimitiveCollection()) : null;
        if (oldA) scene.primitives.remove(oldA);
        impact.area = { name: area.def.name, houses: { total: B.count - counts[0], byClass: counts.slice(1) },
                        roads: { km_total: km.reduce((a, v) => a + v, 0), km_by_class: km } };
      } else if (areaWater) { scene.primitives.remove(areaWater); areaWater = null; }
      lastArea = area ?? null;
    }
    lastImpact = impact;
    return impact;
  }
  let areaWater = null, lastArea = null;

  return {
    sim, times: sim.time, hours: n, floodWindow: sim.flood_window, notes: sim.notes,
    setHour,
    get method() { return method; },
    setVisible(on) {
      visible = on;
      ds.show = on;
      for (const x of rivers) x.prim.show = on;
      if (water) water.show = on;
      if (areaWater) areaWater.show = on;
      setWeather(on ? sim.basin_rain_mm[Math.round(hourNow)] : 0);
    },
    flyUpstream: () => viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(107.45, 15.2, 108.5, 16.15), duration: 2 }),
    destroy(opts = {}) {
      active = false;
      scene.preRender.removeEventListener(tick);
      setWeather(0);
      scene.postProcessStages.remove(rainStage);
      for (const x of rivers) scene.groundPrimitives.remove(x.prim);
      if (water) scene.primitives.remove(water);
      if (areaWater) scene.primitives.remove(areaWater);
      viewer.dataSources.remove(ds, true);
      opts.buildings?.setDepths(null);
      opts.roads?.setDepths(null);
      lastArea?.setDepths(null, null);
      scene.requestRenderMode = rrm;
      viewer.targetFrameRate = tfr;
      scene.requestRender();
    },
  };
}
