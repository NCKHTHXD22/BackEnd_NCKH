import * as Cesium from 'cesium';
import { deserialize } from 'flatgeobuf/lib/mjs/geojson.js';
import { terrainSampler } from '../hoian/hoian.js';

// "Dựng khu này": trình duyệt tự gọi thẳng 3 nguồn miễn phí (không qua máy chủ của hệ thống) rồi dựng mô hình 3D.
//   Nominatim        tên khu + mã nước (để biết đọc file Open Buildings nào)
//   OpenStreetMap    qua Overpass API: nhà vẽ tay (số tầng, chiều cao, màu, kiểu mái nếu có), đường, sông, hồ, công viên,
//                    đình chùa, di tích, tường rào, cây. Hỏi overpass-api.de; sau 7 s chưa trả lời thì hỏi thêm
//                    overpass.private.coffee và maps.mail.ru – máy nào trả trước thì dùng.
//   Open Buildings   (Google + Microsoft, bản gộp của VIDA trên data.source.coop) – đường viền nhà dò từ ảnh vệ tinh kèm
//                    độ tin cậy. File FlatGeobuf theo nước (VNM ≈ 17,5 GB) có chỉ mục không gian → chỉ đọc đúng phần byte
//                    của khu đã vẽ (khu 0,5 km² ≈ 2 MB).
// Ghép hai nguồn nhà: nhà OSM được ưu tiên; nhà Open Buildings bị bỏ nếu độ tin cậy < 0,7, trùng chỗ nhà OSM, nằm trên
// lòng đường hoặc trên mặt nước.

export const MAX_AREA_KM2 = 2;
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const FALLBACK_AFTER_MS = 7000;
const OB_URL = iso3 => `https://data.source.coop/vida/google-microsoft-open-buildings/flatgeobuf/by_country/country_iso=${iso3}/${iso3}.fgb`;
const ISO3 = { vn: 'VNM', la: 'LAO', kh: 'KHM', th: 'THA', cn: 'CHN', mm: 'MMR', my: 'MYS', id: 'IDN', ph: 'PHL', sg: 'SGP' };
const OB_MIN_CONFIDENCE = 0.7;
const FLOOR_M = 3.3;
// nửa bề rộng lòng đường (m) theo loại – nhà Open Buildings có tâm nằm trong dải này coi là "trên lòng đường"
const ROAD_HALF = { motorway: 12, trunk: 10, primary: 8, secondary: 6.5, tertiary: 5, unclassified: 3.5, residential: 3.5,
                    service: 2.5, living_street: 3, pedestrian: 3, track: 2, footway: 1, path: 1, cycleway: 1.2, steps: 1 };
const ROAD_STYLE = {   // bề rộng hiển thị (m), màu
  motorway: [22, '#3d434e'], trunk: [18, '#3d434e'], primary: [15, '#454b57'], secondary: [12, '#4b5260'], tertiary: [9, '#525a68'],
  unclassified: [6, '#5b6371'], residential: [6, '#5b6371'], living_street: [5, '#646c7a'], service: [4, '#6b7280'],
  pedestrian: [5, '#cdbf9c'], track: [3, '#b9a77e'], footway: [2, '#d8cba8'], path: [1.6, '#d8cba8'], cycleway: [2, '#c9b98f'], steps: [2, '#d8cba8'],
};
const WATERWAY_W = { river: 30, canal: 12, stream: 4, drain: 2.5, ditch: 2 };
const WALLS = ['#f5e6c8', '#efd9b4', '#f2c6b6', '#d7e8d0', '#ddd5ea', '#f7d9a8', '#e3e8ef', '#f4f1ea', '#f0cfa0', '#e8b9a6'];
const ROOFS = ['#b5523b', '#c96f4a', '#8d99ae', '#5c7c8a', '#d9d4c7', '#a44a3f', '#6b7a8f'];

// ---------------------------------------------------------------- hình học (phép chiếu phẳng quanh tâm khu)
const hash = (a, b = 0) => (((Math.round(a * 1e6) * 73856093) ^ (Math.round(b * 1e6) * 19349663)) >>> 0) / 4294967296;
function projector(bbox) {
  const lat0 = ((bbox.south + bbox.north) / 2) * Math.PI / 180;
  const kx = 111320 * Math.cos(lat0), ky = 110574;
  return { x: lon => (lon - bbox.west) * kx, y: lat => (lat - bbox.south) * ky, kx, ky };
}
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Diện tích (m²) và tâm (lon, lat) của vòng đa giác lon/lat. */
function centroidLonLat(ring, P, bbox) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x0 = P.x(ring[j][0]), y0 = P.y(ring[j][1]), x1 = P.x(ring[i][0]), y1 = P.y(ring[i][1]);
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) return { area: 0, lon: ring[0][0], lat: ring[0][1] };
  return { area: Math.abs(a / 2), lon: bbox.west + cx / (3 * a) / P.kx, lat: bbox.south + cy / (3 * a) / P.ky };
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Lưới chỉ mục 50 m: tra nhanh đối tượng gần một điểm. */
function gridIndex(P, cell = 50) {
  const m = new Map();
  const key = (x, y) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  return {
    addBox(x0, y0, x1, y1, v) {
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
        for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
          const k = `${i}:${j}`; if (!m.has(k)) m.set(k, []); m.get(k).push(v);
        }
    },
    near(x, y) { return m.get(key(x, y)) ?? []; },
  };
}

// ---------------------------------------------------------------- nguồn dữ liệu
/** Tên khu + mã nước. Nominatim trước; lỗi/chậm quá 6 s thì dùng Photon (komoot, cùng dữ liệu OSM, tên miền khác) –
 *  một số nhà mạng Việt Nam chặn tên miền openstreetmap.org bằng DNS (trả 127.0.0.1, kiểm tra 25/10/2026). */
async function placeName(lon, lat, signal) {
  const timed = ms => (AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(ms)].filter(Boolean)) : signal);
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&accept-language=vi`;
    const j = await (await fetch(u, { signal: timed(6000) })).json();
    const a = j.address ?? {};
    return { name: [a.road, a.quarter ?? a.suburb ?? a.village, a.city ?? a.town ?? a.county].filter(Boolean).join(', ') || j.display_name,
             country: a.country_code ?? null, via: 'Nominatim' };
  } catch (e) {
    if (signal?.aborted) throw e;
    const j = await (await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`, { signal: timed(8000) })).json();
    const p = j.features?.[0]?.properties ?? {};
    return { name: [p.street, p.locality ?? p.district, p.city].filter(Boolean).join(', ') || p.name || null,
             country: p.countrycode?.toLowerCase() ?? null, via: 'Photon' };
  }
}
/** Mã nước theo tọa độ khi không tra được tên (khung bao gần đúng lãnh thổ Việt Nam). */
const guessCountry = (lon, lat) => (lon > 102.1 && lon < 109.5 && lat > 8.4 && lat < 23.4 ? 'vn' : null);

async function overpass(bbox, signal, onMirror) {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const q = `[out:json][timeout:40][bbox:${b}];(
    way["building"];relation["building"]["type"="multipolygon"];
    way["highway"];
    way["natural"="water"];relation["natural"="water"];way["water"];way["landuse"~"^(reservoir|basin)$"];
    way["waterway"~"^(river|canal|stream|drain|ditch)$"];
    way["leisure"~"^(park|garden|pitch|playground)$"];
    way["landuse"~"^(grass|forest|meadow|orchard|cemetery|village_green|recreation_ground|farmland)$"];
    way["natural"~"^(wood|scrub|grassland|wetland|sand|beach)$"];
    node["natural"="tree"];way["barrier"~"^(wall|fence)$"];
    node["historic"];way["historic"];node["amenity"="place_of_worship"];way["amenity"="place_of_worship"];node["tourism"~"^(attraction|museum)$"];
  );out geom;`;
  const ctrls = [];
  const started = new Set();
  const ask = url => {
    if (started.has(url)) return Promise.reject(new Error('dup'));
    started.add(url);
    const c = new AbortController();
    ctrls.push(c);
    signal?.addEventListener('abort', () => c.abort());
    setTimeout(() => c.abort(), 20000);          // máy treo không trả lời (gặp 25/10/2026) – không để người dùng chờ lâu
    return fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), signal: c.signal })
      .then(r => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json(); })
      .then(j => ({ j, url }));
  };
  const round = () => {
    started.clear();
    const others = () => { onMirror?.(); return Promise.any(OVERPASS.slice(1).map(ask)); };
    const first = ask(OVERPASS[0]).catch(others);                                   // máy chính lỗi → hỏi ngay máy khác
    const late = new Promise(res => setTimeout(res, FALLBACK_AFTER_MS)).then(others); // chậm quá 7 s → hỏi thêm
    return Promise.any([first, late]);
  };
  try {
    const t0 = Date.now();
    try {
      return await round();
    } catch (e) {
      // cả ba máy lỗi NHANH (thường "at capacity" lúc cao điểm) → chờ 5 s hỏi lại một lượt; lỗi do treo lâu thì thôi,
      // dựng luôn từ Open Buildings (người dùng có nút "Dựng lại")
      if (signal?.aborted || Date.now() - t0 > 15000) throw e;
      onMirror?.('retry');
      await new Promise(res => setTimeout(res, 5000));
      return await round();
    }
  } finally {
    ctrls.forEach(c => c.abort());
  }
}

async function openBuildings(iso3, bbox, signal) {
  const out = [];
  for await (const f of deserialize(OB_URL(iso3), { minX: bbox.west, minY: bbox.south, maxX: bbox.east, maxY: bbox.north })) {
    if (signal?.aborted) break;
    if (f.geometry?.type !== 'Polygon') continue;
    out.push({ ring: f.geometry.coordinates[0], conf: f.properties.confidence, src: f.properties.bf_source });
  }
  return out;
}

// ---------------------------------------------------------------- chuẩn hóa OSM
const ring = g => g.map(p => [p.lon, p.lat]);
function parseOsm(elements) {
  const o = { buildings: [], roads: [], water: [], waterways: [], green: [], trees: [], pois: [] };
  for (const e of elements) {
    const t = e.tags ?? {};
    const rings = e.type === 'way' && e.geometry ? [ring(e.geometry)]
      : e.type === 'relation' ? (e.members ?? []).filter(m => m.role === 'outer' && m.geometry).map(m => ring(m.geometry)) : [];
    if (t.building && t.building !== 'no') rings.forEach(r => r.length > 3 && o.buildings.push({ ring: r, tags: t, id: `${e.type}/${e.id}` }));
    else if (t.highway && e.geometry) o.roads.push({ line: ring(e.geometry), cls: t.highway, name: t.name, id: `way/${e.id}` });
    else if (t.waterway && e.geometry) o.waterways.push({ line: ring(e.geometry), cls: t.waterway, name: t.name });
    else if (t.natural === 'water' || t.water || ['reservoir', 'basin'].includes(t.landuse)) rings.forEach(r => o.water.push({ ring: r, name: t.name }));
    else if (t.leisure || t.landuse || ['wood', 'scrub', 'grassland', 'wetland', 'sand', 'beach'].includes(t.natural)) {
      rings.forEach(r => o.green.push({ ring: r, kind: t.leisure ?? t.landuse ?? t.natural, name: t.name }));
    } else if (e.type === 'node' && t.natural === 'tree') o.trees.push({ lon: e.lon, lat: e.lat });
    if (t.name && (t.historic || t.amenity === 'place_of_worship' || t.tourism)) {
      const p = e.type === 'node' ? [e.lon, e.lat] : rings[0]?.[0];
      if (p) o.pois.push({ lon: p[0], lat: p[1], name: t.name, kind: t.historic ? 'historic' : t.amenity ?? t.tourism });
    }
  }
  return o;
}

function osmHeight(t, area, seed) {
  const h = parseFloat(t.height);
  if (h > 0) return { height: h, levels: Math.max(1, Math.round(h / FLOOR_M)), how: 'height' };
  const lv = parseFloat(t['building:levels']);
  if (lv > 0) return { height: lv * FLOOR_M + (t['roof:shape'] && t['roof:shape'] !== 'flat' ? 1.5 : 0), levels: lv, how: 'levels' };
  const b = t.building;
  const typed = { house: 3, detached: 3, residential: 3, terrace: 4, apartments: 9, commercial: 4, retail: 3, office: 6, hotel: 7,
                  school: 3, university: 4, hospital: 4, temple: 1, church: 1, pagoda: 1, shrine: 1, religious: 1, industrial: 1,
                  warehouse: 1, hut: 1, shed: 1, kiosk: 1, roof: 1, garage: 1, government: 4, public: 3 }[b];
  if (typed) return { height: typed * FLOOR_M + (typed === 1 && ['temple', 'church', 'pagoda', 'religious'].includes(b) ? 4 : 0), levels: typed, how: 'type' };
  return areaHeight(area, seed);
}
/** Số tầng ước tính theo diện tích nền (nhà phố Việt Nam: nền hẹp 40–120 m² thường 3–4 tầng; nền lớn thường xưởng/chợ thấp tầng). */
function areaHeight(area, seed) {
  const base = area < 25 ? 1 : area < 60 ? 2 : area < 150 ? 3 : area < 400 ? 2 : 1;
  const lv = Math.max(1, base + (seed < 0.25 ? -1 : seed > 0.75 ? 1 : 0));
  return { height: lv * FLOOR_M, levels: lv, how: 'area' };
}

// ---------------------------------------------------------------- tải + ghép
/**
 * Lấy dữ liệu khu (bbox lon/lat). onStep(key, info) báo tiến độ cho giao diện.
 * Trả về { name, country, bbox, areaKm2, buildings[], roads[], water[], waterways[], green[], trees[], pois[], stats }.
 */
export async function fetchArea(bbox, { onStep, signal } = {}) {
  const t0 = performance.now();
  const P = projector(bbox);
  const areaKm2 = ((bbox.east - bbox.west) * P.kx * (bbox.north - bbox.south) * P.ky) / 1e6;
  if (areaKm2 > MAX_AREA_KM2) throw new Error(`Khu ${areaKm2.toFixed(2)} km² – tối đa ${MAX_AREA_KM2} km²`);
  const cx = (bbox.west + bbox.east) / 2, cy = (bbox.south + bbox.north) / 2;

  onStep?.('nominatim');
  const place = await placeName(cx, cy, signal).catch(() => ({ name: null, country: null, via: null }));
  onStep?.('overpass');
  const iso3 = ISO3[place.country ?? guessCountry(cx, cy)] ?? null;
  const [osmRes, obRes] = await Promise.allSettled([
    overpass(bbox, signal, k => onStep?.(k === 'retry' ? 'overpassRetry' : 'overpassMirror')),
    iso3 ? (onStep?.('openBuildings'), openBuildings(iso3, bbox, signal)) : Promise.resolve([]),
  ]);
  if (osmRes.status === 'rejected' && obRes.status === 'rejected') throw new Error('Không lấy được dữ liệu OSM lẫn Open Buildings');
  const osm = osmRes.status === 'fulfilled' ? parseOsm(osmRes.value.j.elements) : parseOsm([]);
  const ob = obRes.status === 'fulfilled' ? obRes.value : [];
  onStep?.('merge');

  // nhà OSM + chỉ mục
  const bIdx = gridIndex(P);
  const buildings = osm.buildings.map(b => {
    const c = centroidLonLat(b.ring, P, bbox);
    const seed = hash(c.lon, c.lat);
    const h = osmHeight(b.tags, c.area, seed);
    const xs = b.ring.map(p => P.x(p[0])), ys = b.ring.map(p => P.y(p[1]));
    const item = { ring: b.ring, ringXY: b.ring.map(p => [P.x(p[0]), P.y(p[1])]), lon: c.lon, lat: c.lat, area: c.area, src: 'osm',
                   type: b.tags.building, name: b.tags.name ?? null, id: b.id, ...h,
                   wall: b.tags['building:colour'] ?? WALLS[Math.floor(seed * WALLS.length)],
                   roof: b.tags['roof:colour'] ?? (['temple', 'pagoda', 'church', 'religious', 'shrine'].includes(b.tags.building) ? '#a83224' : ROOFS[Math.floor(hash(c.lat, c.lon) * ROOFS.length)]) };
    bIdx.addBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), item);
    return item;
  });
  // đường, nước làm vật cản cho nhà Open Buildings
  const rIdx = gridIndex(P);
  for (const r of osm.roads) {
    const half = ROAD_HALF[r.cls] ?? 3;
    for (let i = 1; i < r.line.length; i++) {
      const a = [P.x(r.line[i - 1][0]), P.y(r.line[i - 1][1])], b = [P.x(r.line[i][0]), P.y(r.line[i][1])];
      rIdx.addBox(Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half, Math.max(a[0], b[0]) + half, Math.max(a[1], b[1]) + half, { a, b, half });
    }
  }
  for (const w of osm.waterways) {
    const half = (WATERWAY_W[w.cls] ?? 4) / 2;
    for (let i = 1; i < w.line.length; i++) {
      const a = [P.x(w.line[i - 1][0]), P.y(w.line[i - 1][1])], b = [P.x(w.line[i][0]), P.y(w.line[i][1])];
      rIdx.addBox(Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half, Math.max(a[0], b[0]) + half, Math.max(a[1], b[1]) + half, { a, b, half, water: true });
    }
  }
  const waterXY = osm.water.map(w => w.ring.map(p => [P.x(p[0]), P.y(p[1])]));

  const dropped = { lowConfidence: 0, overlapOsm: 0, onRoad: 0, onWater: 0 };
  for (const f of ob) {
    if (!(f.conf >= OB_MIN_CONFIDENCE)) { dropped.lowConfidence++; continue; }
    const c = centroidLonLat(f.ring, P, bbox);
    const x = P.x(c.lon), y = P.y(c.lat);
    const ringXY = f.ring.map(p => [P.x(p[0]), P.y(p[1])]);
    if (bIdx.near(x, y).some(b => pointInRing(x, y, b.ringXY) || pointInRing(P.x(b.lon), P.y(b.lat), ringXY))) { dropped.overlapOsm++; continue; }
    const segs = rIdx.near(x, y);
    if (segs.some(s => !s.water && segDist(x, y, s.a[0], s.a[1], s.b[0], s.b[1]) < s.half)) { dropped.onRoad++; continue; }
    if (segs.some(s => s.water && segDist(x, y, s.a[0], s.a[1], s.b[0], s.b[1]) < s.half) || waterXY.some(w => pointInRing(x, y, w))) { dropped.onWater++; continue; }
    const seed = hash(c.lon, c.lat);
    buildings.push({ ring: f.ring, lon: c.lon, lat: c.lat, area: c.area, src: 'openbuildings', type: null, name: null,
                     id: `ob/${c.lon.toFixed(6)},${c.lat.toFixed(6)}`, confidence: f.conf, ...areaHeight(c.area, seed),
                     wall: WALLS[Math.floor(seed * WALLS.length)], roof: ROOFS[Math.floor(hash(c.lat, c.lon) * ROOFS.length)] });
  }

  // cây: cây OSM + cây rải trong công viên/vườn/rừng (1 cây ~ 120 m², tối đa 3.000)
  const trees = [...osm.trees];
  for (const g of osm.green.filter(g => ['park', 'garden', 'wood', 'forest', 'orchard', 'cemetery', 'village_green'].includes(g.kind))) {
    const st = centroidLonLat(g.ring, P, bbox);
    const n = Math.min(400, Math.floor(st.area / 120));
    const xs = g.ring.map(p => p[0]), ys = g.ring.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let k = 0, tries = 0; k < n && tries < n * 4; tries++) {
      const lon = x0 + hash(tries, st.lon) * (x1 - x0), lat = y0 + hash(st.lat, tries) * (y1 - y0);
      if (pointInRing(lon, lat, g.ring)) { trees.push({ lon, lat }); k++; }
    }
    if (trees.length > 3000) break;
  }

  const roadKm = osm.roads.reduce((s, r) => s + r.line.slice(1).reduce((a, p, i) => a + Math.hypot((p[0] - r.line[i][0]) * P.kx, (p[1] - r.line[i][1]) * P.ky), 0), 0) / 1000;
  return {
    name: place.name, country: place.country, bbox, areaKm2, buildings, roads: osm.roads, water: osm.water, waterways: osm.waterways,
    green: osm.green, trees: trees.slice(0, 3000), pois: osm.pois,
    stats: {
      seconds: (performance.now() - t0) / 1000, houses: buildings.length, osmHouses: osm.buildings.length,
      obHouses: buildings.length - osm.buildings.length, obRaw: ob.length, dropped, trees: Math.min(trees.length, 3000), roadKm,
      place: place.via ?? 'lỗi',
      osmFailed: osmRes.status !== 'fulfilled',
      overpass: osmRes.status === 'fulfilled' ? new URL(osmRes.value.url).host : `lỗi: ${osmRes.reason?.errors?.map(e => e.message).join('; ') ?? osmRes.reason?.message ?? osmRes.reason}`,
      openBuildings: obRes.status === 'fulfilled' ? (iso3 ? 'ok' : 'không có dữ liệu cho nước này') : `lỗi: ${obRes.reason?.message ?? obRes.reason}`,
    },
  };
}

// ---------------------------------------------------------------- dựng 3D
const C = s => Cesium.Color.fromCssColorString(s);
const DEPTH_STOPS = [[0.05, '#9be7ff'], [0.5, '#3fa9f5'], [1, '#1f6fd1'], [2, '#7b3fe4'], [3, '#e63946']];
const depthColor = d => { let c = null; for (const [t, col] of DEPTH_STOPS) if (d >= t) c = col; return c && C(c); };
const ROAD_FLOOD = [[0.15, '#facc15'], [0.3, '#fb923c'], [0.5, '#ef4444'], [1, '#7f1d1d']];
const roadFloodColor = d => { let c = null; for (const [t, col] of ROAD_FLOOD) if (d >= t) c = col; return c && C(c); };

/** Dựng khu đã tải lên bản đồ. Trả về handle dùng chung với mô phỏng lũ (setDepths) và bảng thông tin (propsOf). */
export async function renderArea(viewer, area, layerId = 'area') {
  const scene = viewer.scene;
  const { bbox } = area;
  const terrainAt = await terrainSampler(viewer, bbox, 16, 16);
  const prims = [];

  // nhà: tường + lớp mái màu riêng
  const bIds = area.buildings.map((_, idx) => ({ layerId, idx }));
  const ground = new Float64Array(area.buildings.length);
  const inst = [];
  area.buildings.forEach((b, idx) => {
    const base = terrainAt(b.lon, b.lat);
    ground[idx] = base;
    const hier = new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(b.ring.flat()));
    inst.push(new Cesium.GeometryInstance({
      geometry: new Cesium.PolygonGeometry({ polygonHierarchy: hier, height: base - 0.5, extrudedHeight: base + b.height, vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT }),
      id: bIds[idx], attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(C(b.wall)) },
    }));
    inst.push(new Cesium.GeometryInstance({
      geometry: new Cesium.PolygonGeometry({ polygonHierarchy: hier, height: base + b.height, extrudedHeight: base + b.height + 0.4, vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT }),
      id: bIds[idx], attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(C(b.roof)) },
    }));
  });
  const bPrim = scene.primitives.add(new Cesium.Primitive({
    geometryInstances: inst, appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
    asynchronous: true, releaseGeometryInstances: true, allowPicking: true,
  }));
  prims.push([scene.primitives, bPrim]);

  // đường (dải theo mét, phủ địa hình)
  const roadIds = area.roads.map((_, idx) => ({ layerId, kind: 'road', idx }));
  const roadInst = area.roads.filter(r => r.line.length > 1).map(r => {
    const [w, col] = ROAD_STYLE[r.cls] ?? [4, '#6b7280'];
    return new Cesium.GeometryInstance({
      geometry: new Cesium.CorridorGeometry({ positions: Cesium.Cartesian3.fromDegreesArray(r.line.flat()), width: w, cornerType: Cesium.CornerType.ROUNDED }),
      id: roadIds[area.roads.indexOf(r)], attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(C(col)) },
    });
  });
  const rPrim = roadInst.length ? scene.groundPrimitives.add(new Cesium.GroundPrimitive({
    geometryInstances: roadInst, appearance: new Cesium.PerInstanceColorAppearance({ flat: true }), asynchronous: true, allowPicking: true,
  })) : null;
  if (rPrim) prims.push([scene.groundPrimitives, rPrim]);

  // mặt nước, sông/kênh, cây xanh
  const ground2 = [];
  for (const w of area.water) if (w.ring.length > 3) ground2.push([w.ring, '#4a90c8', 0.95]);
  for (const g of area.green) if (g.ring.length > 3) ground2.push([g.ring, ['sand', 'beach'].includes(g.kind) ? '#e9d8a6' : g.kind === 'farmland' ? '#b8c98a' : '#7cb66a', 0.85]);
  const gInst = ground2.map(([r, col, a]) => new Cesium.GeometryInstance({
    geometry: new Cesium.PolygonGeometry({ polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(r.flat())) }),
    attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(C(col).withAlpha(a)) },
  }));
  for (const w of area.waterways.filter(x => x.line.length > 1)) {
    gInst.push(new Cesium.GeometryInstance({
      geometry: new Cesium.CorridorGeometry({ positions: Cesium.Cartesian3.fromDegreesArray(w.line.flat()), width: WATERWAY_W[w.cls] ?? 4 }),
      attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(C('#4a90c8').withAlpha(0.95)) },
    }));
  }
  if (gInst.length) {
    const gp = scene.groundPrimitives.add(new Cesium.GroundPrimitive({ geometryInstances: gInst, appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true }), asynchronous: true, allowPicking: false }));
    prims.push([scene.groundPrimitives, gp]);
  }
  const tInst = [];
  for (const t of area.trees) {
    const base = terrainAt(t.lon, t.lat), s = 0.8 + hash(t.lon, t.lat) * 0.6;
    const m = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(t.lon, t.lat, base + 4.2 * s));
    tInst.push(new Cesium.GeometryInstance({
      geometry: new Cesium.EllipsoidGeometry({ radii: new Cesium.Cartesian3(2.6 * s, 2.6 * s, 2.3 * s), stackPartitions: 6, slicePartitions: 8, vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT }),
      modelMatrix: m, attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(C(hash(t.lat, t.lon) > 0.5 ? '#3f8f3a' : '#57a84a')) },
    }));
    const mt = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(t.lon, t.lat, base + 1.2 * s));
    tInst.push(new Cesium.GeometryInstance({
      geometry: new Cesium.CylinderGeometry({ length: 2.6 * s, topRadius: 0.22, bottomRadius: 0.3, slices: 6, vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT }),
      modelMatrix: mt, attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(C('#7a5230')) },
    }));
  }
  if (tInst.length) {
    const tp = scene.primitives.add(new Cesium.Primitive({ geometryInstances: tInst, appearance: new Cesium.PerInstanceColorAppearance({ closed: true }), asynchronous: true, allowPicking: false }));
    prims.push([scene.primitives, tp]);
  }
  const ds = new Cesium.CustomDataSource('area-pois');
  for (const p of area.pois) {
    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, terrainAt(p.lon, p.lat) + 14),
      label: { text: p.name, font: '600 12px system-ui, sans-serif', fillColor: C('#7c2d12'), showBackground: true,
               backgroundColor: C('#fff7ed').withAlpha(0.92), backgroundPadding: new Cesium.Cartesian2(6, 3),
               disableDepthTestDistance: 2000, scaleByDistance: new Cesium.NearFarScalar(300, 1, 4000, 0.4) },
    });
  }
  await viewer.dataSources.add(ds);
  await new Promise(res => { const c = () => (bPrim.ready ? res() : setTimeout(c, 150)); scene.requestRender(); c(); });

  // tô màu theo độ sâu ngập (mô phỏng)
  let depths = null, roadDepths = null, selected = null;
  const paintB = idx => {
    const b = area.buildings[idx];
    const a = bPrim.getGeometryInstanceAttributes(bIds[idx]);
    const d = depths?.[idx];
    const col = idx === selected ? C('#00e676') : (d > 0.05 && depthColor(d)) || C(b.wall);
    if (a) a.color = Cesium.ColorGeometryInstanceAttribute.toValue(col);
  };
  const paintR = idx => {
    if (!rPrim?.ready) return;
    const a = rPrim.getGeometryInstanceAttributes(roadIds[idx]);
    if (!a) return;
    const d = roadDepths?.[idx];
    a.color = Cesium.ColorGeometryInstanceAttribute.toValue((d != null && roadFloodColor(d)) || C((ROAD_STYLE[area.roads[idx].cls] ?? [4, '#6b7280'])[1]));
  };

  return {
    def: { id: layerId, name: area.name ?? 'Khu tự dựng', name_en: area.name ?? 'Custom area' },
    area, bbox, terrainAt,
    buildings: { lon: Float64Array.from(area.buildings, b => b.lon), lat: Float64Array.from(area.buildings, b => b.lat), ground, count: area.buildings.length },
    roadPoints: area.roads.map(r => r.line.map(([lon, lat]) => [lon, lat, terrainAt(lon, lat)])),
    roadLengthKm: area.roads.map(r => r.line.slice(1).reduce((s, p, i) => s + Math.hypot((p[0] - r.line[i][0]) * 111320 * Math.cos(p[1] * Math.PI / 180), (p[1] - r.line[i][1]) * 110574), 0) / 1000),
    /** Độ sâu ngập từng nhà / đoạn đường (m) do mô phỏng tính; null = màu gốc. */
    setDepths(bd, rd) {
      depths = bd; roadDepths = rd;
      for (let i = 0; i < area.buildings.length; i++) paintB(i);
      for (let i = 0; i < area.roads.length; i++) paintR(i);
      scene.requestRender();
    },
    propsOf(id) {
      if (id.kind === 'road') {
        const r = area.roads[id.idx];
        return { name: r.name ?? r.cls, code: r.id, highway: r.cls, ...(roadDepths ? { depth_now_m: +Math.max(0, roadDepths[id.idx]).toFixed(2) } : {}) };
      }
      const b = area.buildings[id.idx];
      return { name: b.name ?? (b.src === 'osm' ? `${b.type ?? 'nhà'} · OSM` : 'Nhà · Open Buildings'), code: b.id,
               source: b.src === 'osm' ? 'OpenStreetMap' : `Open Buildings (${(b.confidence * 100).toFixed(0)}% tin cậy)`,
               levels: b.levels, height_m: +b.height.toFixed(1), height_from: b.how, area_m2: Math.round(b.area),
               ground_m: +ground[id.idx].toFixed(2), ...(depths ? { depth_now_m: +Math.max(0, depths[id.idx]).toFixed(2) } : {}) };
    },
    highlight(id) {
      const prev = selected;
      selected = id && id.kind !== 'road' ? id.idx : null;
      if (prev != null) paintB(prev);
      if (selected != null) paintB(selected);
      scene.requestRender();
    },
    setVisible(on) { for (const [, p] of prims) p.show = on; ds.show = on; scene.requestRender(); },
    setOpacity() {},
    flyTo() {
      viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north),
                            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-42), roll: 0 }, duration: 1.5 });
    },
    destroy() {
      for (const [col, p] of prims) col.remove(p);
      viewer.dataSources.remove(ds, true);
      scene.requestRender();
    },
  };
}
