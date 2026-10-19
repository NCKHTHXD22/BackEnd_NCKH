import { useEffect, useRef, useState } from 'react';

const fmt = (v, d = 1) => v.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Đường cong nhỏ: diện tích ngập / số nhà ngập theo mực nước, đánh dấu mực hiện tại. */
function Curve({ curve, level, k, color, label, unit, digits }) {
  const W = 300, H = 92, pl = 34, pb = 18, pt = 8;
  const xs = curve.map(c => c.wl), ys = curve.map(c => c[k]);
  const xmax = Math.max(...xs), ymax = Math.max(...ys) || 1;
  const X = v => pl + (v / xmax) * (W - pl - 8), Y = v => pt + (1 - v / ymax) * (H - pt - pb);
  const d = curve.map((c, i) => `${i ? 'L' : 'M'}${X(c.wl).toFixed(1)},${Y(c[k]).toFixed(1)}`).join('');
  return (
    <figure className="curve">
      <figcaption>{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={pl} x2={W - 8} y1={Y(ymax * f)} y2={Y(ymax * f)} className="grid" />
            <text x={pl - 4} y={Y(ymax * f) + 3} textAnchor="end">{fmt(ymax * f, digits)}</text>
          </g>
        ))}
        {[0, 1, 2, 3, 4, 5].filter(v => v <= xmax).map(v => (
          <text key={v} x={X(v)} y={H - 4} textAnchor="middle">{v} m</text>
        ))}
        <path d={d} fill="none" stroke={color} strokeWidth="2" />
        {level != null && <line x1={X(level)} x2={X(level)} y1={pt} y2={H - pb} className="now" />}
      </svg>
      <small>{unit}</small>
    </figure>
  );
}

export default function FloodPanel({ ready, curve, onLevel, onClose }) {
  const [level, setLevel] = useState(2.0);
  const [peak, setPeak] = useState(3.5);
  const [playing, setPlaying] = useState(false);
  const [stats, setStats] = useState(null);
  const timer = useRef(null);

  useEffect(() => { if (ready) setStats(onLevel(level)); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = v => { setLevel(v); setStats(onLevel(v)); };

  // Diễn biến giả định: nước lên từ 0,5 m tới đỉnh rồi rút, mỗi bước 0,1 m
  const play = () => {
    if (playing) { clearInterval(timer.current); setPlaying(false); return; }
    let v = 0.5, dir = 1;
    setPlaying(true);
    timer.current = setInterval(() => {
      v = +(v + dir * 0.1).toFixed(2);
      if (v >= peak) dir = -1;
      if (v <= 0.5 && dir < 0) { clearInterval(timer.current); setPlaying(false); }
      apply(v);
    }, 350);
  };
  useEffect(() => () => clearInterval(timer.current), []);

  return (
    <aside className="panel flood-panel">
      <header>
        <div>
          <small>Khu thí điểm Hội An · Kịch bản</small>
          <h2>Mô phỏng nguy cơ ngập</h2>
        </div>
        <button className="icon" onClick={() => { clearInterval(timer.current); onClose(); }} title="Tắt kịch bản">×</button>
      </header>
      {!ready ? <p className="muted">Đang dựng 54 nghìn nhà 3D và 2.570 đoạn đường… (lần đầu có thể mất 1–2 phút tùy máy)</p> : (
        <>
          <label className="wl">
            <span>Mực nước tại Hội An: <b>{fmt(level, 1)} m</b></span>
            <input type="range" min="0.5" max="5" step="0.1" value={level} disabled={playing}
              onChange={e => apply(Number(e.target.value))} />
          </label>
          <div className="row">
            <button onClick={play} className={playing ? 'on' : ''}>{playing ? '❚❚ Dừng' : '▶ Diễn biến lũ'}</button>
            <label>Đỉnh lũ
              <select value={peak} onChange={e => setPeak(Number(e.target.value))} disabled={playing}>
                {[2, 2.5, 3, 3.5, 4, 4.5, 5].map(v => <option key={v} value={v}>{fmt(v, 1)} m</option>)}
              </select>
            </label>
          </div>
          {stats && (
            <div className="kpis">
              <div><b>{fmt(stats.areaKm2, 2)}</b><span>km² ngập</span></div>
              <div><b>{stats.houses.toLocaleString('vi-VN')}</b><span>nhà bị ngập</span></div>
              <div><b>{fmt(stats.roadKm, 1)}</b><span>km đường ngập</span></div>
              <div><b>{fmt(stats.maxDepth, 1)}</b><span>m sâu nhất</span></div>
            </div>
          )}
          <ul className="legend depth">
            {[['#9be7ff', '< 0,5 m'], ['#3fa9f5', '0,5–1 m'], ['#1f6fd1', '1–2 m'], ['#7b3fe4', '2–3 m'], ['#e63946', '> 3 m']]
              .map(([c, t]) => <li key={t}><i style={{ background: c }} />{t}</li>)}
          </ul>
          {curve && (
            <>
              <Curve curve={curve} level={level} k="area" color="#3fa9f5" label="Diện tích ngập theo mực nước" unit="km²" digits={1} />
              <Curve curve={curve} level={level} k="houses" color="#e63946" label="Số nhà ngập theo mực nước" unit="nhà" digits={0} />
            </>
          )}
          <p className="note">
            Mô hình minh họa “dâng nước có kết nối” trên DEM 30 m (nước từ sông và biển tràn vào ô thấp hơn
            mực nước, có đường nối liền). Chưa tính dòng chảy, thời gian truyền lũ, đê bao. Thay bằng kết quả
            HEC-RAS 2D khi có. Mực nước theo hệ cao độ của DEM (EGM2008 ≈ mực nước biển trung bình).
          </p>
        </>
      )}
    </aside>
  );
}
