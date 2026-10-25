// Bước 12 – Kiểm chứng cân bằng nước hồ chứa (lộ trình 4.1) bằng số liệu thật của các trận lũ thử.
//
// Với mỗi hồ có bảng Z-V: bắt đầu từ mực nước đo đầu trận, đưa Q đến và Q xả ĐO theo giờ vào lõi
// src/services/reservoirSim.js (cùng mã backend dùng), so mực nước tính với mực nước đo.
// Sai lệch lớn nghĩa là bảng Z-V, Q đến hoặc Q xả có vấn đề (không phải lỗi của phép cân bằng).
//
// Chạy: node digital_twin/scripts/12_reservoir_check.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const { simulateReservoir, interpVolume } = await import(pathToFileURL(path.join(repo, 'src/services/reservoirSim.js')));

// File seed kết nối MongoDB khi import → chỉ đọc phần mảng dữ liệu (như 03_build_reservoirs.mjs)
const readArray = (file, name) => {
  const src = fs.readFileSync(path.join(repo, file), 'utf8');
  const start = src.indexOf(`const ${name} = [`);
  const end = src.indexOf('\n];', start);
  return vm.runInNewContext(src.slice(start + `const ${name} = `.length, end + 2));
};
const data = await import(pathToFileURL(path.join(repo, 'src/script/lakeSpecsData.js')));   // QĐ 1865
const specs = Object.fromEntries(data.LAKE_SPECS.map(s => [s.lake_id, s]));
// --zv=estimated: dùng bảng Z-V ước tính từ số liệu vận hành (15_zv_estimate.py) thay cho bảng chính thức QĐ 1865
const useEstimated = process.argv.includes('--zv=estimated');
let curves = data.ZV_CURVES;
if (useEstimated) {
  const est = JSON.parse(fs.readFileSync(path.join(repo, 'digital_twin/data/compute/zv_estimated.json'), 'utf8')).lakes;
  curves = curves.map(c => (est[c.lake_id] ? { ...c, points: est[c.lake_id].points } : c));
}

const evDir = path.join(repo, 'digital_twin/data/compute/events');
const report = [];
for (const file of fs.readdirSync(evDir).filter(f => f.endsWith('.json')).sort()) {
  const ev = JSON.parse(fs.readFileSync(path.join(evDir, file), 'utf8'));
  for (const curve of curves) {
    const d = ev.lakes[curve.lake_id];
    if (!d) continue;
    const spec = specs[curve.lake_id];
    const n = d.inflow.length;
    const h0 = d.water_level[0];
    const sim = simulateReservoir({ points: curve.points, htl0: h0, qIn: d.inflow.slice(1), qOut: d.outflow.slice(1), spec });
    const obs = d.water_level.slice(1);
    const real = d.real_water_level.slice(1);
    const err = sim.map((r, i) => r.htl - obs[i]).filter((_, i) => real[i]);
    const rmse = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / Math.max(1, err.length));
    const bias = err.reduce((s, e) => s + e, 0) / Math.max(1, err.length);
    // Thể tích: lượng nước vào − ra theo số liệu, so với thay đổi dung tích suy ra từ mực nước đo (Z-V)
    const dV_flow = d.inflow.slice(1).reduce((s, q, i) => s + (q - d.outflow[i + 1]) * 3600 / 1e6, 0);
    const dV_level = interpVolume([...curve.points].sort((a, b) => a.z - b.z), d.water_level[n - 1]) -
      interpVolume([...curve.points].sort((a, b) => a.z - b.z), h0);
    const pct = k => Math.round(100 * d[k].reduce((s, x) => s + x, 0) / n);
    report.push({
      event: ev.event, lake_id: curve.lake_id, lake: curve.name,
      h_start: h0, h_end_obs: d.water_level[n - 1], h_end_sim: +sim.at(-1).htl.toFixed(2),
      h_max_obs: Math.max(...d.water_level), h_max_sim: +Math.max(...sim.map(r => r.htl)).toFixed(2),
      rmse_m: +rmse.toFixed(2), bias_m: +bias.toFixed(2),
      dV_flow_mm3: +dV_flow.toFixed(1), dV_level_mm3: +dV_level.toFixed(1),
      real_pct: { inflow: pct('real_inflow'), outflow: pct('real_outflow'), wl: pct('real_water_level') },
      MNDBT: spec?.MNDBT, MNGC: spec?.MNGC,
    });
  }
}
console.table(report.map(r => ({
  trận: r.event, hồ: r.lake, 'H đầu': r.h_start, 'H cuối đo': r.h_end_obs, 'H cuối tính': r.h_end_sim,
  'Hmax đo': r.h_max_obs, 'Hmax tính': r.h_max_sim, 'RMSE (m)': r.rmse_m, 'lệch TB (m)': r.bias_m,
  'ΔV theo Q (tr.m³)': r.dV_flow_mm3, 'ΔV theo H (tr.m³)': r.dV_level_mm3,
  '% thật Q/Qx/H': `${r.real_pct.inflow}/${r.real_pct.outflow}/${r.real_pct.wl}`,
})));
const out = path.join(repo, `digital_twin/data/compute/reservoir_check${useEstimated ? '_zv_estimated' : ''}.json`);
fs.writeFileSync(out, JSON.stringify({ note: 'Kiểm chứng cân bằng nước bằng Q đến/Q xả đo (12_reservoir_check.mjs)', report }, null, 1));
console.log('→', out);
