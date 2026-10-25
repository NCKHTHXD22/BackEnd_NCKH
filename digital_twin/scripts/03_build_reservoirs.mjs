// Bước 3 – Sinh lớp "Hồ chứa" (GeoJSON) từ dữ liệu sẵn có của hệ thống:
//   - tọa độ tuyến đập:  web/src/utils/reservoirs.js (tọa độ HIỂN THỊ dùng chung với bản đồ 2D;
//                        tọa độ trong src/api/config/reservoirs.js là đầu vào mô hình – không dùng ở đây)
//   - tên có dấu, địa chỉ: src/script/seedRainLake.js  (mảng `lakes`)
//   - thông số kỹ thuật:  src/script/lakeSpecsData.js  (mảng `LAKE_SPECS`, theo QĐ 1865)
// Hai file seed kết nối MongoDB khi import, nên ở đây chỉ đọc phần mảng dữ liệu.
// Chạy: node digital_twin/scripts/03_build_reservoirs.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const out = path.resolve(here, '../../web/public/data/dt/reservoirs.geojson');

const readArray = (file, name) => {
  const src = fs.readFileSync(path.join(repo, file), 'utf8');
  const start = src.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`Không thấy ${name} trong ${file}`);
  const end = src.indexOf('\n];', start);
  return vm.runInNewContext(src.slice(start + `const ${name} = `.length, end + 2));
};

const { RESERVOIRS } = await import(pathToUrl(path.join(repo, 'web/src/utils/reservoirs.js')));
const lakes = Object.fromEntries(readArray('src/script/seedRainLake.js', 'lakes').map(l => [l.Id_Lake, l]));
const { LAKE_SPECS } = await import(pathToUrl(path.join(repo, 'src/script/lakeSpecsData.js')));   // QĐ 1865
const specs = Object.fromEntries(LAKE_SPECS.map(s => [s.lake_id, s]));

// Nhánh sông theo LSTM_Py_Backend_v2/config/reservoirs.py (RIVER_BRANCHES)
const BRANCH = {
  1: 'A Vương', 13: 'A Vương', 16: 'A Vương',
  9: 'Sông Bung', 3: 'Sông Bung', 7: 'Sông Bung', 8: 'Sông Bung', 11: 'Sông Bung',
  18: 'Đắk Mi', 14: 'Đắk Mi', 2: 'Đắk Mi', 19: 'Đắk Mi',
  4: 'Sông Tranh', 12: 'Sông Tranh', 17: 'Sông Tranh', 15: 'Sông Tranh',
};
// Hồ không có trong cả hai file seed (chỉ có tên không dấu trong reservoirs.js)
const NAME_FALLBACK = { 18: 'Hồ Đắk Mi 2' };
const titleCase =s => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

// Tạm ẩn trên bản đồ: Đắk Mi 2 (18) chưa có thông số kỹ thuật và số liệu đo trong hệ thống
const HIDDEN_ON_MAP = new Set([18]);

const features = Object.entries(RESERVOIRS).filter(([id]) => !HIDDEN_ON_MAP.has(Number(id))).map(([id, r]) => {
  id = Number(id);
  const s = specs[id] ?? {};
  const l = lakes[id] ?? {};
  const name = s.name ? `Hồ ${s.name}` : (l.name ? titleCase(l.name) : NAME_FALLBACK[id] ?? titleCase(r.name));
  const props = {
    code: `HO-${id}`,
    lake_id: id,
    name,
    branch: BRANCH[id] ?? null,
    river: s.river ?? null,
    address: s.address ?? l.address ?? null,
    regulation_doc: s.regulation_doc ?? null,
    MNC: s.MNC ?? null, MNDBT: s.MNDBT ?? null, MNGC: s.MNGC ?? null, crest: s.crest ?? null,
    total_volume: s.total_volume ?? null, dead_volume: s.dead_volume ?? null, flood_volume: s.flood_volume ?? null,
    turbines: s.turbines ?? null, capacity_mw: s.capacity_mw ?? null, design_head: s.design_head ?? null,
    spillway_crest_elev: s.spillway_crest_elev ?? null, spillway_width: s.spillway_width ?? null,
    has_spec: Boolean(specs[id]),
  };
  return { type: 'Feature', id: props.code, properties: props, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } };
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }, null, 1));
const missing = features.filter(f => !f.properties.has_spec).map(f => f.properties.name);
console.log(`Đã ghi ${features.length} hồ → ${path.relative(repo, out)} (ẩn: ${[...HIDDEN_ON_MAP].join(', ')})`);
if (missing.length) console.log('Chưa có thông số kỹ thuật:', missing.join(', '));

function pathToUrl(p) { return new URL('file:///' + p.replace(/\\/g, '/')).href; }
