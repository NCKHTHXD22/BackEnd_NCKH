// Bước 24 – Ranh giới xã/phường/đặc khu thành phố Đà Nẵng sau sáp nhập (1/7/2025, 94 đơn vị).
// Nguồn: bản đồ hành chính https://bando.danang.gov.vn/ ("Đà Nẵng Mới"). Trang là ứng dụng React, ranh giới
// nhúng thẳng trong bundle JS dưới dạng object literal {type:"Feature",properties:{ma_xa,ten_xa,...},geometry}.
// Script tải trang → tìm bundle chính → trích các Feature → giản lược (Douglas–Peucker ~10 m) → GeoJSON.
// Chạy: node digital_twin/scripts/24_admin_boundaries.mjs [--refresh]   (mặc định dùng bundle đã tải trong data/raw/admin)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(here, '../data/raw/admin');
const OUT = path.resolve(here, '../../web/public/data/dt/admin_wards.geojson');
const SITE = 'https://bando.danang.gov.vn';
const TOL = 0.0001;          // độ (~11 m) – đủ cho ranh giới hiển thị ở tỷ lệ xã
const DIGITS = 5;            // ~1 m
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };

async function bundle() {
  fs.mkdirSync(RAW, { recursive: true });
  const cached = fs.readdirSync(RAW).filter(f => /^index-.*\.js$/.test(f));
  if (cached.length && !process.argv.includes('--refresh')) return fs.readFileSync(path.join(RAW, cached[0]), 'utf8');
  const html = await (await fetch(`${SITE}/`, { headers: UA })).text();
  // Bundle chính là <script type="module" src="/assets/index-xxxx.js"> (bỏ bản legacy)
  const src = html.match(/<script[^>]+type="module"[^>]+src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  if (!src) throw new Error('Không tìm thấy bundle chính trong trang');
  const js = await (await fetch(SITE + src, { headers: UA })).text();
  for (const f of cached) fs.unlinkSync(path.join(RAW, f));
  fs.writeFileSync(path.join(RAW, path.basename(src)), js);
  console.log(`Tải ${src}: ${(js.length / 1e6).toFixed(1)} MB`);
  return js;
}

/** Cắt object literal bắt đầu tại `start` (ký tự '{'), bỏ qua ngoặc nằm trong chuỗi. */
function sliceObject(s, start) {
  let depth = 0, quote = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  throw new Error(`Object literal không đóng tại ${start}`);
}

// Douglas–Peucker trên một vòng (giữ điểm đầu = cuối)
function simplify(ring, tol) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      const d = L ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / L : Math.hypot(px - ax, py - ay);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}
const round = p => p.map(v => +v.toFixed(DIGITS));

// Giản lược có thể làm vòng tự cắt (đoạn tắt qua chỗ ranh giới thắt hẹp) → kiểm tra từng cặp đoạn không kề nhau
function selfIntersects(r) {
  const n = r.length - 1;
  const orient = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[i + 1];
    const [x0, x1] = a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]];
    const [y0, y1] = a[1] < b[1] ? [a[1], b[1]] : [b[1], a[1]];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;           // đoạn đầu và đoạn cuối chung điểm khép vòng
      const c = r[j], d = r[j + 1];
      if (Math.max(c[0], d[0]) < x0 || Math.min(c[0], d[0]) > x1 || Math.max(c[1], d[1]) < y0 || Math.min(c[1], d[1]) > y1) continue;
      if (orient(a, b, c) * orient(a, b, d) <= 0 && orient(c, d, a) * orient(c, d, b) <= 0) return true;
    }
  }
  return false;
}
function simplifyRing(ring) {
  for (const tol of [TOL, TOL / 4]) {
    const r = simplify(ring, tol).map(round);
    if (!selfIntersects(r)) return r;
  }
  return ring.map(round);
}

// Điểm đặt nhãn: trên đa giác lớn nhất, kẻ đường ngang qua tâm, lấy trung điểm đoạn nằm trong dài nhất
// (tâm hình học có thể rơi ra ngoài với xã hình chữ C, hình móc).
function labelPoint(polys) {
  const area = r => r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2;
  const poly = polys.reduce((m, p) => (Math.abs(area(p[0])) > Math.abs(area(m[0])) ? p : m), polys[0]);
  const outer = poly[0], A = area(outer);
  let cx = 0, cy = 0;
  outer.forEach(([x, y], i) => { const [x2, y2] = outer[(i + 1) % outer.length]; const k = x * y2 - x2 * y; cx += (x + x2) * k; cy += (y + y2) * k; });
  cx /= 6 * A; cy /= 6 * A;
  const xs = [];
  for (const ring of poly) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      if ((y1 > cy) !== (y2 > cy)) xs.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  return round(best ? [(best[0] + best[1]) / 2, cy] : [cx, cy]);
}

const js = await bundle();
const features = [];
for (let i = js.indexOf('{type:"Feature",properties:{ma_xa:'); i >= 0; i = js.indexOf('{type:"Feature",properties:{ma_xa:', i + 1)) {
  features.push(vm.runInNewContext(`(${sliceObject(js, i)})`));
}
if (!features.length) throw new Error('Không trích được Feature nào – cấu trúc bundle đã đổi');

let before = 0, after = 0;
const LOAI = { 'Xã': 'XA', 'Phường': 'PHUONG', 'Đặc khu': 'DACKHU' };
const out = features.map(f => {
  const p = f.properties;
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const coordinates = polys.map(poly => poly.map(ring => {
    before += ring.length;
    const r = simplifyRing(ring);
    after += r.length;
    return r;
  }));
  const [label_lon, label_lat] = labelPoint(coordinates);
  return {
    type: 'Feature',
    properties: {
      code: `DN-${p.ma_xa}`, name: `${p.loai} ${p.ten_xa}`, ma_xa: String(p.ma_xa), ten_xa: p.ten_xa,   // mã, không phải số lượng
      loai: p.loai, loai_code: LOAI[p.loai] ?? 'KHAC',
      sap_nhap: p.sap_nhap || null, tru_so: p.tru_so && p.tru_so !== 'đang cập nhật' ? p.tru_so : null,
      dtich_km2: p.dtich_km2 ?? null, dan_so: p.dan_so ?? null, matdo_km2: p.matdo_km2 ?? null,
      label_lon, label_lat,
    },
    geometry: { type: 'MultiPolygon', coordinates },
  };
}).sort((a, b) => a.properties.ma_xa - b.properties.ma_xa);

const fc = {
  type: 'FeatureCollection',
  source: `${SITE}/ (Đà Nẵng Mới – ranh giới sau sáp nhập 1/7/2025)`,
  generated: new Date().toISOString().slice(0, 10),
  features: out,
};
fs.writeFileSync(OUT, JSON.stringify(fc));
const count = k => out.filter(f => f.properties.loai === k).length;
console.log(`${out.length} đơn vị: ${count('Phường')} phường, ${count('Xã')} xã, ${count('Đặc khu')} đặc khu`);
console.log(`Đỉnh: ${before.toLocaleString()} → ${after.toLocaleString()} (giản lược ${TOL}°)`);
console.log(`Ghi ${path.relative(process.cwd(), OUT)}: ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
