// Bước 3 – Sinh lớp "Hồ chứa" (GeoJSON) từ dữ liệu sẵn có của backend:
//   - tọa độ + tên:      src/api/config/reservoirs.js
//   - tên có dấu, địa chỉ: src/script/seedRainLake.js  (mảng `lakes`)
//   - thông số kỹ thuật:  src/script/seedLakeSpecs.js  (mảng `LAKE_SPECS`)
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

const { RESERVOIRS } = await import(pathToUrl(path.join(repo, 'src/api/config/reservoirs.js')));
const lakes = Object.fromEntries(readArray('src/script/seedRainLake.js', 'lakes').map(l => [l.Id_Lake, l]));
const specs = Object.fromEntries(readArray('src/script/seedLakeSpecs.js', 'LAKE_SPECS').map(s => [s.lake_id, s]));

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

const features = Object.entries(RESERVOIRS).map(([id, r]) => {
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
console.log(`Đã ghi ${features.length} hồ → ${path.relative(repo, out)}`);
if (missing.length) console.log('Chưa có thông số kỹ thuật:', missing.join(', '));

function pathToUrl(p) { return new URL('file:///' + p.replace(/\\/g, '/')).href; }
