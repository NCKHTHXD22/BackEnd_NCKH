import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaWater, FaPlay, FaPause } from 'react-icons/fa';
import { PANEL, PANEL_HEAD, CloseButton } from './ui.jsx';

const DEPTH_LEGEND = [['#9be7ff', '< 0,5 m'], ['#3fa9f5', '0,5–1 m'], ['#1f6fd1', '1–2 m'], ['#7b3fe4', '2–3 m'], ['#e63946', '> 3 m']];

/** Đường cong nhỏ: diện tích / số nhà ngập theo mực nước, đánh dấu mực hiện tại. */
function Curve({ curve, level, k, color, label, unit, digits, lang }) {
  const W = 300, H = 92, pl = 36, pb = 18, pt = 8;
  const f = v => v.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: digits });
  const xmax = Math.max(...curve.map(c => c.wl)), ymax = Math.max(...curve.map(c => c[k])) || 1;
  const X = v => pl + (v / xmax) * (W - pl - 8), Y = v => pt + (1 - v / ymax) * (H - pt - pb);
  const d = curve.map((c, i) => `${i ? 'L' : 'M'}${X(c.wl).toFixed(1)},${Y(c[k]).toFixed(1)}`).join('');
  return (
    <figure className="mt-3">
      <figcaption className="text-xs font-semibold text-slate-600 mb-0.5">{label} <span className="font-normal text-slate-400">({unit})</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full h-auto">
        {[0, 0.5, 1].map(q => (
          <g key={q}>
            <line x1={pl} x2={W - 8} y1={Y(ymax * q)} y2={Y(ymax * q)} stroke="#e2e8f0" />
            <text x={pl - 4} y={Y(ymax * q) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{f(ymax * q)}</text>
          </g>
        ))}
        {[0, 1, 2, 3, 4, 5].filter(v => v <= xmax).map(v => (
          <text key={v} x={X(v)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">{v} m</text>
        ))}
        <path d={d} fill="none" stroke={color} strokeWidth="2" />
        {level != null && <line x1={X(level)} x2={X(level)} y1={pt} y2={H - pb} stroke="#2563eb" strokeDasharray="3 3" />}
      </svg>
    </figure>
  );
}

export default function FloodPanel({ ready, curve, onLevel, onClose, className = '' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const fmt = (v, d = 1) => v.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });
  const [level, setLevel] = useState(2.0);
  const [peak, setPeak] = useState(3.5);
  const [playing, setPlaying] = useState(false);
  const [stats, setStats] = useState(null);
  const timer = useRef(null);

  useEffect(() => { if (ready) setStats(onLevel(level)); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearInterval(timer.current), []);

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

  return (
    <div className={`${PANEL} flex flex-col animate-fade-in ${className}`}>
      <div className={PANEL_HEAD}>
        <div>
          <p className="text-[11px] font-medium text-slate-500">{t('digitalTwin.flood.eyebrow')}</p>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><FaWater className="text-blue-600" /> {t('digitalTwin.flood.title')}</h2>
        </div>
        <CloseButton onClick={() => { clearInterval(timer.current); onClose(); }} label={t('digitalTwin.flood.close')} />
      </div>
      <div className="p-3 overflow-y-auto">
        {!ready ? (
          <p className="text-xs text-slate-500 animate-pulse-soft">{t('digitalTwin.flood.building')}</p>
        ) : (
          <>
            <label className="block text-sm text-slate-700">
              {t('digitalTwin.flood.level')}: <b className="text-blue-700">{fmt(level)} m</b>
              <input type="range" min="0.5" max="5" step="0.1" value={level} disabled={playing}
                onChange={e => apply(Number(e.target.value))} className="w-full accent-blue-600 mt-1" />
            </label>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <button onClick={play}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg font-semibold ${playing ? 'bg-orange-500 text-white' : 'bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-sm'}`}>
                {playing ? <><FaPause size={10} /> {t('digitalTwin.flood.pause')}</> : <><FaPlay size={10} /> {t('digitalTwin.flood.play')}</>}
              </button>
              <label className="flex items-center gap-1.5 text-slate-600">{t('digitalTwin.flood.peak')}
                <select value={peak} onChange={e => setPeak(Number(e.target.value))} disabled={playing}
                  className="border border-slate-200 rounded-lg px-1.5 h-8 bg-white">
                  {[2, 2.5, 3, 3.5, 4, 4.5, 5].map(v => <option key={v} value={v}>{fmt(v)} m</option>)}
                </select>
              </label>
            </div>
            {stats && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {[[fmt(stats.areaKm2, 2), 'kpiArea'], [stats.houses.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN'), 'kpiHouses'],
                  [fmt(stats.roadKm), 'kpiRoads'], [fmt(stats.maxDepth), 'kpiDepth']].map(([v, k]) => (
                  <div key={k} className="rounded-xl bg-blue-50/60 border border-blue-100 px-3 py-2">
                    <b className="block text-xl font-bold text-blue-700 leading-tight">{v}</b>
                    <span className="text-[11px] text-slate-500">{t(`digitalTwin.flood.${k}`)}</span>
                  </div>
                ))}
              </div>
            )}
            <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
              {DEPTH_LEGEND.map(([c, l]) => (
                <li key={l} className="flex items-center gap-1 text-[11px] text-slate-500">
                  <i className="inline-block w-3 h-3 rounded-sm" style={{ background: c }} />{l}
                </li>
              ))}
            </ul>
            {curve && (
              <>
                <Curve curve={curve} level={level} k="area" color="#3fa9f5" label={t('digitalTwin.flood.curveArea')} unit="km²" digits={1} lang={lang} />
                <Curve curve={curve} level={level} k="houses" color="#e63946" label={t('digitalTwin.flood.curveHouses')} unit={t('digitalTwin.flood.unitHouses')} digits={0} lang={lang} />
              </>
            )}
            <p className="mt-3 text-[11px] leading-relaxed bg-amber-50 border-l-4 border-amber-400 text-amber-900 rounded px-2.5 py-2">
              {t('digitalTwin.flood.note')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
