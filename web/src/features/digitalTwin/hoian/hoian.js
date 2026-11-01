import * as Cesium from 'cesium';
import { renderBurst } from '../map/viewer.js';

// Khu Hội An (3 phường + Cù Lao Chàm): nhà 3D (Primitive theo ô ~1 km, tường + mái màu theo từng nhà), cây minh họa,
// lớp ngập phủ địa hình. Dữ liệu sinh bởi digital_twin/scripts/07_hoian.py.

const WALLS = ['#e8c872', '#f0d48a', '#e2b866', '#f3e2b3', '#d9a95b', '#efe6d2', '#e7c98f'];
const DEPTH_STOPS = [[0, '#9be7ff'], [0.5, '#3fa9f5'], [1, '#1f6fd1'], [2, '#7b3fe4'], [3, '#e63946']];

// Mái: 0–4 ngói (ngói âm dương phố cổ, ngói mới), 5–6 bê tông, 7 tôn. Mỗi nhà chỉ có MỘT màu theo instance (đổi màu
// ngập/chọn/ban đêm phải nhanh, không nhân đôi số khối) → chỉ số mái gửi trong kênh alpha của màu (k + 1)/255; shader
// tô mặt hướng lên bằng màu mái, các mặt khác bằng màu tường. Alpha = 1 → cả nhà một màu (ngập, đang chọn, ban đêm).
const ROOFS = ['#9c4a2f', '#a95a3c', '#8b3f2a', '#b7684a', '#7d5a4a', '#8e8f8c', '#a7a39a', '#5f6f78'];
const glsl = hex => {
  const c = Cesium.Color.fromCssColorString(hex);
  return `vec3(${c.red.toFixed(4)}, ${c.green.toFixed(4)}, ${c.blue.toFixed(4)})`;
};
const HOUSE_FS = `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec4 v_color;

vec3 roofColor(float k)
{
${ROOFS.map((c, k) => `    ${k ? 'else ' : ''}if (k < ${k}.5) return ${glsl(c)};`).join('\n')}
    return ${glsl(ROOFS[ROOFS.length - 1])};
}

void main()
{
    vec3 positionToEyeEC = -v_positionEC;
    vec3 normalEC = normalize(v_normalEC);
    vec4 color = vec4(v_color.rgb, 1.0);
    if (v_color.a < 0.99) {
        // hướng lên (pháp tuyến mặt cầu) tại điểm, trong hệ mắt
        vec3 upEC = czm_viewRotation * normalize((czm_inverseView * vec4(v_positionEC, 1.0)).xyz);
        if (dot(normalEC, upEC) > 0.6) color.rgb = roofColor(floor(v_color.a * 255.0 + 0.5) - 1.0);
    }
    color = czm_gammaCorrect(color);

    czm_materialInput materialInput;
    materialInput.normalEC = normalEC;
    materialInput.positionToEyeEC = positionToEyeEC;
    czm_material material = czm_getDefaultMaterial(materialInput);
    material.diffuse = color.rgb;
    material.alpha = 1.0;
    out_FragColor = czm_phong(normalize(positionToEyeEC), material, czm_lightDirectionEC);
}
`;
const RELIGIOUS = new Set(['Chùa', 'Đền/miếu', 'Nhà thờ']);
const FLAT_ROOF = new Set(['Khách sạn', 'Chung cư', 'Bệnh viện', 'Trường học']);
const METAL_ROOF = new Set(['Công nghiệp', 'Kho']);
/** Chỉ số mái theo loại nhà, chiều cao, phường (phố cổ ngói), ngẫu nhiên cố định theo mã OSM. */
function roofIndex(it, F) {
  const r = hash(it[F.osm_id] + 17), type = it[F.type], h = it[F.height_m];
  if (RELIGIOUS.has(type)) return 4;
  if (METAL_ROOF.has(type)) return 7;
  if (FLAT_ROOF.has(type) || h >= 10) return r < 0.5 ? 5 : 6;
  const tile = it[F.ward] === 'Phường Hội An' ? 0.85 : 0.6;   // phố cổ phần lớn mái ngói
  if (r < tile) return Math.floor(r / tile * 4);
  return r < tile + (1 - tile) * 0.75 ? 5 + Math.floor(hash(it[F.osm_id] + 5) * 2) : 7;
}

export function depthColor(d) {
  let c = DEPTH_STOPS[0][1];
  for (const [t, col] of DEPTH_STOPS) if (d >= t) c = col;
  return Cesium.Color.fromCssColorString(c);
}

const hash = n => ((n * 2654435761) >>> 0) / 4294967296;

/** Lấy mẫu địa hình đang hiển thị trên lưới đều để đặt nhà sát mặt đất (mọi nguồn địa hình). */
export async function terrainSampler(viewer, b, nxs = 24, nys = 14) {
  const pts = [];
  for (let j = 0; j < nys; j++)
    for (let i = 0; i < nxs; i++)
      pts.push(Cesium.Cartographic.fromDegrees(b.west + (b.east - b.west) * i / (nxs - 1), b.south + (b.north - b.south) * j / (nys - 1)));
  let h;
  try {
    h = (await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, pts)).map(p => p.height ?? 0);
  } catch {
    h = pts.map(() => 0); // địa hình phẳng (không có terrain)
  }
  return (lon, lat) => {
    const fx = Math.min(Math.max((lon - b.west) / (b.east - b.west) * (nxs - 1), 0), nxs - 1.0001);
    const fy = Math.min(Math.max((lat - b.south) / (b.north - b.south) * (nys - 1), 0), nys - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const at = (a, c) => h[c * nxs + a];
    return (1 - u) * (1 - v) * at(i, j) + u * (1 - v) * at(i + 1, j) + (1 - u) * v * at(i, j + 1) + u * v * at(i + 1, j + 1);
  };
}

const gridBounds = grid => ({ west: grid.west, north: grid.north, east: grid.west + grid.dx * grid.nx, south: grid.north - grid.dy * grid.ny });

/** Chênh lệch (trung vị) giữa địa hình đang hiển thị và cao độ DEM của lưới Hội An – cộng vào cao độ DEM
 *  (mặt nước, mực nước) để đặt đúng độ cao hiển thị. */
export async function demOffset(viewer, grid, terrainAt = null) {
  terrainAt = terrainAt ?? await terrainSampler(viewer, gridBounds(grid));
  const diffs = [];
  for (let k = 0; k < 200; k++) {
    const r = Math.floor(hash(k + 1) * grid.ny), c = Math.floor(hash(k + 7919) * grid.nx);
    if (grid.source[r * grid.nx + c]) continue;
    diffs.push(terrainAt(grid.west + (c + 0.5) * grid.dx, grid.north - (r + 0.5) * grid.dy) - grid.dtm[r * grid.nx + c]);
  }
  diffs.sort((a, z) => a - z);
  return diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
}

export async function loadHoiAnBuildings(viewer, def) {
  const data = await (await fetch(def.url)).json();
  const grid = await (await fetch(def.grid)).json();
  const gb = gridBounds(grid);
  // lưới lấy mẫu ~450 m trên khung lưới ngập (đồng bằng phẳng, đủ để đặt nhà sát đất)
  const terrainAt = await terrainSampler(viewer, gb, Math.max(24, Math.ceil((gb.east - gb.west) / 0.004) + 1),
    Math.max(14, Math.ceil((gb.north - gb.south) / 0.004) + 1));
  const offset = await demOffset(viewer, grid, terrainAt);

  const F = Object.fromEntries(data.fields.map((f, i) => [f, i]));
  const items = data.items;
  const baseColor = items.map(it => {
    const col = it[F.type] === 'Khách sạn' || it[F.type] === 'Chung cư' ? '#f4f1ea' : WALLS[Math.floor(hash(it[F.osm_id]) * WALLS.length)];
    return Cesium.Color.fromCssColorString(col).withAlpha((roofIndex(it, F) + 1) / 255);
  });

  // Primitive tìm thuộc tính theo id bằng so sánh tham chiếu (có nhớ vị trí lần trước, nên duyệt
  // tuần tự rất nhanh) → giữ sẵn mảng id dùng chung cho tạo hình và đổi màu.
  const ids = items.map((_, idx) => ({ layerId: def.id, idx }));
  const cx = new Float64Array(items.length), cy = new Float64Array(items.length);   // tâm nhà – mô phỏng lấy độ sâu tại đây
  const rings = items.map((it, idx) => {
    const flat = it[F.ring];
    const deg = [];
    let x = flat[0], y = flat[1];
    deg.push(data.west + x / data.q, data.south + y / data.q);
    for (let k = 2; k < flat.length; k += 2) {
      x += flat[k]; y += flat[k + 1];
      deg.push(data.west + x / data.q, data.south + y / data.q);
    }
    for (let k = 0; k < deg.length; k += 2) { cx[idx] += deg[k]; cy[idx] += deg[k + 1]; }
    cx[idx] /= deg.length / 2; cy[idx] /= deg.length / 2;
    return deg;
  });

  // Cao độ chân nhà: trong khung lưới ngập nội suy lưới mẫu; ngoài khung (Cù Lao Chàm – đảo có đồi, cách bờ 15 km)
  // lấy mẫu địa hình riêng từng nhà – chỉ vài trăm nhà nên rẻ.
  const inGb = (lon, lat) => lon >= gb.west && lon <= gb.east && lat >= gb.south && lat <= gb.north;
  const baseOf = new Float64Array(items.length);
  const outIdx = [];
  rings.forEach((deg, idx) => {
    if (inGb(deg[0], deg[1])) baseOf[idx] = terrainAt(deg[0], deg[1]);
    else outIdx.push(idx);
  });
  if (outIdx.length) {
    let hs;
    try {
      const pts = outIdx.map(idx => Cesium.Cartographic.fromDegrees(cx[idx], cy[idx]));
      hs = (await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, pts)).map(p => p.height ?? 0);
    } catch {
      hs = outIdx.map(() => 0); // địa hình phẳng (không có terrain)
    }
    outIdx.forEach((idx, k) => { baseOf[idx] = hs[k]; });
  }

  // Chia nhà theo ô ~1 km, mỗi ô một Primitive: ô ngoài khung nhìn bị bỏ qua khi vẽ, và dựng lần lượt từng ô (nhường
  // luồng giữa các ô) để giao diện không treo. Bản đầu một Primitive cho cả 55 nghìn nhà → đứng máy khi dựng và khi vẽ.
  const TILE = 0.01;
  const tiles = new Map();
  items.forEach((_, idx) => {
    const k = `${Math.floor((cx[idx] - data.west) / TILE)}:${Math.floor((cy[idx] - data.south) / TILE)}`;
    if (!tiles.has(k)) tiles.set(k, []);
    tiles.get(k).push(idx);
  });
  const hideFar = new Cesium.DistanceDisplayConditionGeometryInstanceAttribute(0, 15000);   // trên 15 km: nhà quá nhỏ, ẩn
  const primOf = new Uint16Array(items.length);
  const prims = [];
  const appearance = new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true, fragmentShaderSource: HOUSE_FS });
  for (const members of tiles.values()) {
    const p = viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: members.map(idx => {
        const deg = rings[idx];
        const base = baseOf[idx] - 0.5; // chôn chân 0,5 m để không hở dưới đáy
        primOf[idx] = prims.length;
        return new Cesium.GeometryInstance({
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(deg)),
            height: base, extrudedHeight: base + 0.5 + items[idx][F.height_m],
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          id: ids[idx],
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(baseColor[idx]), distanceDisplayCondition: hideFar },
        });
      }),
      appearance, asynchronous: true, releaseGeometryInstances: true, allowPicking: true,
      shadows: Cesium.ShadowMode.DISABLED,
    }));
    p.show = Boolean(def.visible);
    prims.push(p);
    await new Promise(res => setTimeout(res, 0));
  }
  await new Promise(res => {
    const check = () => (prims.every(p => p.ready) ? res() : setTimeout(check, 200));
    viewer.scene.requestRender(); check();
  });

  let level = null;
  let depths = null;          // độ sâu từng nhà do mô phỏng theo thời gian đặt (ưu tiên hơn `level` của kịch bản)
  const lastClass = new Int8Array(items.length).fill(-1);
  const depthClass = d => (d > 0.05 ? DEPTH_STOPS.reduce((k, [t], i) => (d >= t ? i : k), 0) : -1);
  let selected = null;
  let night = false;
  const NIGHT = Cesium.Color.fromCssColorString('#3a3550');
  const colorOf = idx => {
    if (depths) {
      if (depths[idx] > 0.05) return depthColor(depths[idx]);
    } else if (level != null && items[idx][F.flood_from_m] < level && level > items[idx][F.ground_m]) {
      return depthColor(level - items[idx][F.ground_m]);
    }
    return night ? Cesium.Color.lerp(baseColor[idx], NIGHT, 0.62, new Cesium.Color()).withAlpha(1) : baseColor[idx];
  };
  const paint = idx => {
    const a = prims[primOf[idx]].getGeometryInstanceAttributes(ids[idx]);
    const c = idx === selected ? Cesium.Color.fromCssColorString('#00e676') : colorOf(idx);
    a.color = Cesium.ColorGeometryInstanceAttribute.toValue(c);
  };

  return {
    def, primitives: prims, items, F, offset, grid, centroids: { lon: cx, lat: cy },
    setVisible(on) { for (const p of prims) p.show = on; viewer.scene.requestRender(); },
    setOpacity() {},
    propsOf(id) {
      const it = items[id.idx];
      const p = Object.fromEntries(data.fields.filter(f => f !== 'ring').map(f => [f, it[F[f]]]));
      p.code = `NHA-${it[F.osm_id]}`;
      p.name = it[F.name] || `${it[F.type]} · OSM ${it[F.osm_id]}`;
      if (depths) p.depth_now_m = +Math.max(0, depths[id.idx]).toFixed(2);
      else if (level != null) p.depth_now_m = level > it[F.flood_from_m] ? Math.max(0, +(level - it[F.ground_m]).toFixed(2)) : 0;
      return p;
    },
    /** Độ sâu ngập từng nhà (m, theo thứ tự items) do mô phỏng theo thời gian tính; null = trả về kịch bản/màu gốc.
     *  Chỉ tô lại nhà đổi cấp màu (mô phỏng gọi mỗi bước giờ – tô lại cả 55 nghìn nhà mỗi bước sẽ giật). */
    setDepths(arr) {
      const full = !arr || !depths;
      depths = arr;
      for (let i = 0; i < items.length; i++) {
        const c = arr ? depthClass(arr[i]) : -1;
        if (full || c !== lastClass[i]) { lastClass[i] = c; paint(i); }
      }
      viewer.scene.requestRender();
    },
    highlight(id) {
      const prev = selected;
      selected = id ? id.idx : null;
      if (prev != null) paint(prev);
      if (selected != null) paint(selected);
      viewer.scene.requestRender();
    },
    /** Tô màu nhà theo mực nước; trả về số nhà ngập. */
    setLevel(wl) {
      level = wl;
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        paint(i);
        if (wl != null && items[i][F.flood_from_m] < wl && wl > items[i][F.ground_m]) n++;
      }
      viewer.scene.requestRender();
      return n;
    },
    setNight(on) { night = on; this.setLevel(level); },
    countFlooded(wl) {
      let n = 0;
      for (const it of items) if (it[F.flood_from_m] < wl && wl > it[F.ground_m]) n++;
      return n;
    },
  };
}

// Mức ngập đường theo khả năng đi lại: < 0,15 m coi như khô; < 0,3 m ô tô đi chậm được; 0,3–0,5 m xe máy chết máy;
// 0,5–1 m ô tô không qua được; > 1 m nguy hiểm tính mạng
export const ROAD_DEPTH_STOPS = [[0.15, '#facc15'], [0.3, '#fb923c'], [0.5, '#ef4444'], [1, '#7f1d1d']];
const ROAD_COLORS = ROAD_DEPTH_STOPS.map(([d, c]) => [d, Cesium.Color.fromCssColorString(c)]);
function roadDepthColor(d) {
  let c = null;
  for (const [t, col] of ROAD_COLORS) if (d >= t) c = col;
  return c;
}

/** Đường Hội An: một GroundPolylinePrimitive, màu theo từng đoạn → đổi màu tức thì (ngập, ban đêm). */
export async function loadHoiAnRoads(viewer, def) {
  const gj = await (await fetch(def.url)).json();
  const feats = gj.features;
  // mỗi đoạn hình học một id riêng (so sánh tham chiếu), gom theo đối tượng để tô cùng màu
  const partIds = feats.map(() => []);
  const WIDTH = [0, 6, 4.5, 3, 2];
  const instances = [];
  feats.forEach((f, idx) => {
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const line of lines) {
      if (line.length < 2) continue;
      instances.push(new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({
          positions: Cesium.Cartesian3.fromDegreesArray(line.flat()), width: WIDTH[f.properties.cls] ?? 2,
        }),
        id: partIds[idx][partIds[idx].push({ layerId: def.id, idx }) - 1],
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.WHITE) },
      }));
    }
  });
  const primitive = viewer.scene.groundPrimitives.add(new Cesium.GroundPolylinePrimitive({
    geometryInstances: instances, appearance: new Cesium.PolylineColorAppearance(),
    asynchronous: true, releaseGeometryInstances: true, allowPicking: true,
  }));
  primitive.show = Boolean(def.visible);
  await new Promise(res => { const c = () => (primitive.ready ? res() : setTimeout(c, 200)); viewer.scene.requestRender(); c(); });

  let level = null, night = false, selected = null, depths = null;
  const C = s => Cesium.Color.fromCssColorString(s);
  const DAY = [null, C('#f6f1e7'), C('#f6f1e7'), C('#d9d4c7'), C('#cfc9bb')];
  const NIGHTC = [null, C('#ffd98a'), C('#ffd98a'), C('#ffb347'), C('#f29b38')];
  const RED = C('#ff4d4d'), SEL = C('#00e676');
  const flooded = f => level != null && f.properties.flood_from_m < level;
  const repaint = () => {
    feats.forEach((f, idx) => {
      const cls = f.properties.cls ?? 4;
      const wet = depths ? roadDepthColor(depths[idx]) : flooded(f) ? RED : null;
      const col = idx === selected ? SEL : wet ?? (night ? NIGHTC : DAY)[cls] ?? DAY[4];
      const v = Cesium.ColorGeometryInstanceAttribute.toValue(col);
      for (const pid of partIds[idx]) primitive.getGeometryInstanceAttributes(pid).color = v;
    });
    renderBurst(viewer, 500);
  };
  repaint();

  return {
    def, primitive, features: feats,
    setVisible(on) { primitive.show = on; renderBurst(viewer, 500); },
    setOpacity() {},
    propsOf(id) {
      const p = { ...feats[id.idx].properties };
      p.name = p.name || `${p.highway} · ${p.code}`;
      if (depths) p.depth_now_m = +Math.max(0, depths[id.idx]).toFixed(2);
      return p;
    },
    /** Độ sâu ngập lớn nhất trên từng đoạn đường (m, theo thứ tự features) do mô phỏng tính; null = tắt. */
    setDepths(arr) { depths = arr; repaint(); },
    highlight(id) { selected = id ? id.idx : null; repaint(); },
    setNight(on) { night = on; repaint(); },
    setLevel(wl) {
      level = wl; repaint();
      let km = 0;
      if (wl != null) for (const f of feats) if (flooded(f)) km += f.properties.length_km ?? 0;
      return km;
    },
  };
}

// Cây: khối low-poly (tán 6 cạnh hai vòng, pháp tuyến mượt nên trông tròn; thân lăng trụ 3 cạnh) – 20 đỉnh, 30 tam giác.
// Bản đầu dùng BillboardCollection: 68 nghìn billboard làm khung hình tụt còn 1–15 hình/giây (nghẽn GPU), khối gộp
// theo ô như nhà thì nhẹ hơn nhiều.
const TREE_SHADES = ['#4f8f3a', '#5f9e45', '#3f7a32'];
const TRUNK = '#6b4a2b';
const RING = Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3)]);
const TRI3 = Array.from({ length: 3 }, (_, i) => [Math.cos(i * 2 * Math.PI / 3), Math.sin(i * 2 * Math.PI / 3)]);

/** Gom đỉnh/pháp tuyến/chỉ số của nhiều cây vào một Geometry (tọa độ ECEF, mỗi cây theo hệ đông–bắc–lên tại gốc). */
function treeMesh() {
  const pos = [], nor = [], idx = [];
  let base, e, n, u;
  const vert = (x, y, z, nx, ny, nz) => {
    const l = Math.hypot(nx, ny, nz);    // nén pháp tuyến (compressVertices) đòi vectơ đơn vị
    for (let k = 0; k < 3; k++) {
      pos.push(base[k] + x * e[k] + y * n[k] + z * u[k]);
      nor.push((nx * e[k] + ny * n[k] + nz * u[k]) / l);
    }
  };
  return {
    /** Đặt hệ tọa độ địa phương tại (lon, lat, h). */
    at(lon, lat, h) {
      const l = Cesium.Math.toRadians(lon), f = Cesium.Math.toRadians(lat);
      const p = Cesium.Cartesian3.fromDegrees(lon, lat, h);
      base = [p.x, p.y, p.z];
      e = [-Math.sin(l), Math.cos(l), 0];
      u = [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)];
      n = [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)];
    },
    /** Tán lá rộng chiều cao H, bán kính r (xoay rot): đáy, vòng giữa, vòng trên hẹp hơn, ngọn. */
    crown(H, r, rot) {
      const v0 = pos.length / 3, c = Math.cos(rot), s = Math.sin(rot);
      vert(0, 0, 0.3 * H, 0, 0, -1);
      for (const [z, k, nz] of [[0.52, 1, -0.15], [0.8, 0.78, 0.7]]) {
        for (const [x, y] of RING) {
          const ex = x * c - y * s, ey = x * s + y * c;
          vert(k * r * ex, k * r * ey, z * H, ex, ey, nz);
        }
      }
      vert(0, 0, H, 0, 0, 1);
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6, a = v0 + 1 + i, b = v0 + 1 + j, a2 = a + 6, b2 = b + 6;
        idx.push(b, a, v0, a, b, b2, a, b2, a2, a2, b2, v0 + 13);
      }
    },
    /** Thân: lăng trụ 3 cạnh bán kính r từ z0 đến z1 (không nắp – bị tán và đất che). */
    trunk(z0, z1, r) {
      const v0 = pos.length / 3;
      for (const z of [z0, z1]) for (const [x, y] of TRI3) vert(r * x, r * y, z, x, y, 0);
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        idx.push(v0 + i, v0 + j, v0 + 3 + j, v0 + i, v0 + 3 + j, v0 + 3 + i);
      }
    },
    get empty() { return idx.length === 0; },
    geometry() {
      const positions = new Float64Array(pos);
      return new Cesium.Geometry({
        attributes: {
          position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions }),
          normal: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: new Float32Array(nor) }),
        },
        indices: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
        primitiveType: Cesium.PrimitiveType.TRIANGLES,
        boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
      });
    },
  };
}

/** Cây minh họa Hội An (ô phủ cây ESA WorldCover, 07_hoian.py): khối 3D gộp theo ô ~1 km, mỗi ô một Primitive (ô ngoài
 *  khung nhìn bị bỏ qua khi vẽ). Nhóm `terrain: "point"` (đảo có đồi) lấy cao độ riêng từng cây. */
export async function loadHoiAnTrees(viewer, def) {
  const data = await (await fetch(def.url)).json();
  const TILE = 0.01;
  const tiles = new Map();
  for (const grp of data.groups) {
    const n = grp.xy.length / 2;
    const lon = new Float64Array(n), lat = new Float64Array(n);
    for (let i = 0; i < n; i++) { lon[i] = data.west + grp.xy[2 * i] / data.q; lat[i] = data.south + grp.xy[2 * i + 1] / data.q; }
    let heightAt;
    if (grp.terrain === 'point') {
      let hs;
      try {
        hs = (await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, Array.from(lon, (x, i) => Cesium.Cartographic.fromDegrees(x, lat[i]))))
          .map(p => p.height ?? 0);
      } catch {
        hs = new Array(n).fill(0); // địa hình phẳng (không có terrain)
      }
      heightAt = i => hs[i];
    } else {
      const b = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
      for (let i = 0; i < n; i++) {
        b.west = Math.min(b.west, lon[i]); b.east = Math.max(b.east, lon[i]);
        b.south = Math.min(b.south, lat[i]); b.north = Math.max(b.north, lat[i]);
      }
      const at = await terrainSampler(viewer, b, Math.max(24, Math.ceil((b.east - b.west) / 0.004) + 1),
        Math.max(14, Math.ceil((b.north - b.south) / 0.004) + 1));
      heightAt = i => at(lon[i], lat[i]);
    }
    // nhóm thưa (Cù Lao Chàm, scale > 1): tán rộng hơn để phủ đủ ô cây, nhưng không cao vọt
    const tall = Math.min(grp.scale, 1.2);
    for (let i = 0; i < n; i++) {
      const key = `${Math.floor((lon[i] - data.west) / TILE)}:${Math.floor((lat[i] - data.south) / TILE)}`;
      if (!tiles.has(key)) tiles.set(key, { crowns: TREE_SHADES.map(() => treeMesh()), trunks: treeMesh() });
      const t = tiles.get(key);
      const k = grp.xy[2 * i] * 7919 + grp.xy[2 * i + 1], v = 0.75 + 0.6 * hash(k);
      const H = 8.5 * v * tall, R = 2.6 * v * grp.scale, h0 = heightAt(i);
      const crown = t.crowns[Math.floor(hash(k + 3) * TREE_SHADES.length)];
      crown.at(lon[i], lat[i], h0);
      crown.crown(H, R, hash(k + 11) * Math.PI);
      t.trunks.at(lon[i], lat[i], h0);
      t.trunks.trunk(-0.5, 0.4 * H, Math.max(0.25, 0.1 * R));
    }
  }

  const colors = [...TREE_SHADES, TRUNK].map(c => Cesium.Color.fromCssColorString(c));
  const NIGHT = Cesium.Color.fromCssColorString('#2e3a40');
  const appearance = new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true });
  const hideFar = new Cesium.DistanceDisplayConditionGeometryInstanceAttribute(0, 12000);
  const prims = [], ids = [];
  // Geometry dựng sẵn chỉ dựng đồng bộ được (asynchronous: false) → thêm từng ô, chờ ô trước xong để không treo trang
  for (const t of tiles.values()) {
    if (viewer.isDestroyed()) return null;
    const instIds = [];
    const instances = [...t.crowns, t.trunks].flatMap((m, kind) => {
      if (m.empty) return [];
      const id = { layerId: def.id, kind };
      instIds.push(id);
      return [new Cesium.GeometryInstance({
        geometry: m.geometry(), id,
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(colors[kind]), distanceDisplayCondition: hideFar },
      })];
    });
    const p = viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instances, appearance, asynchronous: false, allowPicking: false, releaseGeometryInstances: true,
      shadows: Cesium.ShadowMode.DISABLED,
    }));
    prims.push(p); ids.push(instIds);
    viewer.scene.requestRender();
    await new Promise(res => {
      const check = () => (p.ready || p.isDestroyed() ? res() : setTimeout(check, 16));
      check();
    });
  }
  const setVisible = on => { for (const p of prims) p.show = on; viewer.scene.requestRender(); };
  setVisible(Boolean(def.visible));
  return {
    def, primitives: prims, count: data.groups.reduce((s, g) => s + g.xy.length / 2, 0),
    setVisible,
    setOpacity() {},
    setNight(on) {
      prims.forEach((p, i) => {
        for (const id of ids[i]) {
          const c = on ? Cesium.Color.lerp(colors[id.kind], NIGHT, 0.65, new Cesium.Color()) : colors[id.kind];
          p.getGeometryInstanceAttributes(id).color = Cesium.ColorGeometryInstanceAttribute.toValue(c);
        }
      });
      viewer.scene.requestRender();
    },
  };
}

/** Lớp ngập: ảnh độ sâu phủ lên địa hình, vẽ lại mỗi khi đổi mực nước. */
export function createFloodLayer(viewer, grid) {
  const rect = Cesium.Rectangle.fromDegrees(grid.west, grid.north - grid.dy * grid.ny, grid.west + grid.dx * grid.nx, grid.north);
  const entity = viewer.entities.add({
    rectangle: { coordinates: rect, classificationType: Cesium.ClassificationType.TERRAIN, material: Cesium.Color.TRANSPARENT },
    show: false,
  });
  const cellKm2 = (grid.dx * 111.32 * Math.cos(Cesium.Math.toRadians(grid.north))) * (grid.dy * 110.54);

  const stats = wl => {
    let cells = 0, maxD = 0;
    for (let i = 0; i < grid.dtm.length; i++) {
      if (grid.source[i] || !(grid.fill[i] < wl) || grid.dtm[i] >= wl) continue;
      cells++; maxD = Math.max(maxD, wl - grid.dtm[i]);
    }
    return { areaKm2: cells * cellKm2, maxDepth: maxD };
  };

  return {
    entity, stats,
    setLevel(wl) {
      if (wl == null) { entity.show = false; viewer.scene.requestRender(); return null; }
      const cv = document.createElement('canvas');
      cv.width = grid.nx; cv.height = grid.ny;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(grid.nx, grid.ny);
      for (let i = 0; i < grid.dtm.length; i++) {
        if (grid.source[i] || !(grid.fill[i] < wl) || grid.dtm[i] >= wl) continue;
        const c = depthColor(wl - grid.dtm[i]);
        img.data.set([c.red * 255, c.green * 255, c.blue * 255, 165], i * 4);
      }
      ctx.putImageData(img, 0, 0);
      entity.rectangle.material = new Cesium.ImageMaterialProperty({ image: cv, transparent: true });
      entity.show = true;
      renderBurst(viewer, 1500);
      return stats(wl);
    },
  };
}
