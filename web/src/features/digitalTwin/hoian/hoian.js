import * as Cesium from 'cesium';
import { renderBurst } from '../map/viewer.js';

// Khu thí điểm Hội An: nhà 3D (một Primitive, màu theo từng nhà), lớp ngập phủ địa hình.
// Dữ liệu sinh bởi scripts/06_hoian.py.

const WALLS = ['#e8c872', '#f0d48a', '#e2b866', '#f3e2b3', '#d9a95b', '#efe6d2', '#e7c98f'];
const DEPTH_STOPS = [[0, '#9be7ff'], [0.5, '#3fa9f5'], [1, '#1f6fd1'], [2, '#7b3fe4'], [3, '#e63946']];

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
  const terrainAt = await terrainSampler(viewer, gridBounds(grid));
  const offset = await demOffset(viewer, grid, terrainAt);

  const F = Object.fromEntries(data.fields.map((f, i) => [f, i]));
  const items = data.items;
  const baseColor = items.map(it => {
    const col = it[F.type] === 'Khách sạn' || it[F.type] === 'Chung cư' ? '#f4f1ea' : WALLS[Math.floor(hash(it[F.osm_id]) * WALLS.length)];
    return Cesium.Color.fromCssColorString(col);
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
  const appearance = new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true });
  for (const members of tiles.values()) {
    const p = viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: members.map(idx => {
        const deg = rings[idx];
        const base = terrainAt(deg[0], deg[1]) - 0.5; // chôn chân 0,5 m để không hở dưới đáy
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
    return night ? Cesium.Color.lerp(baseColor[idx], NIGHT, 0.62, new Cesium.Color()) : baseColor[idx];
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
