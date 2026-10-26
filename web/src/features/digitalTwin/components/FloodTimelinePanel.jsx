import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaPlay, FaPause, FaWater, FaCrosshairs } from 'react-icons/fa';
import { PANEL, CloseButton } from './ui.jsx';

const FLOW_NODES = [['ST-NONGSON', 'Nông Sơn'], ['ST-GIAOTHUY', 'Giao Thủy'], ['ST-THANHMY', 'Thành Mỹ'], ['J-VUGIA-END', 'cuối Vu Gia']];
const LEVEL_STATIONS = [['NONGSON', 'Nông Sơn'], ['GIAOTHUY', 'Giao Thủy'], ['AINGHIA', 'Ái Nghĩa'], ['CAULAU', 'Câu Lâu']];
const DEPTH_LEGEND = [['#b4dcff', '< 0,5 m'], ['#6eb4f5', '0,5–1 m'], ['#3282dc', '1–2 m'], ['#1950be', '2–4 m'], ['#0a2882', '> 4 m']];
const GROUPS = ['forecast', 'stage', 'flow', 'scenario'];
const SPEEDS = [['1×', 600], ['2×', 300], ['4×', 150]];   // ms cho mỗi giờ của trận

/** Khung ảnh ngập mới nhất không muộn hơn thời điểm ts (chuỗi ISO giờ VN cùng định dạng); −1 nếu chưa có khung nào. */
const frameAt = (frames, ts) => {
  let k = -1;
  frames.forEach((f, i) => { if (f.time.slice(0, 16) <= ts.slice(0, 16)) k = i; });
  return k;
};

/** Thanh thời gian cho lớp ngập theo trận lũ / kịch bản.
 *  - Có `sim` (trận lũ có dữ liệu mô phỏng): chạy theo TỪNG GIỜ của trận – ảnh ngập, mặt nước 3D, hồ, trạm, mưa và
 *    bảng thông tin (SimulationHUD) đổi cùng lúc qua `onHour`.
 *  - Không có `sim` (kịch bản, đang tải): chạy theo khung ảnh như trước.
 *  `request` ({ id }) – chuyển sang mục đó từ bên ngoài (nút "Dự báo 24 giờ" trên thanh công cụ). */
export default function FloodTimelinePanel({ handle, onClose, onEvent, sim = null, onHour, request = null, className = '' }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'vi-VN';
  const [eventId, setEventId] = useState(handle.events[0].id);
  const ev = handle.events.find(e => e.id === eventId);
  const group = ev?.group ?? 'flow';
  const [meta, setMeta] = useState(handle.meta);
  const [frame, setFrame] = useState(null);           // null = độ sâu lớn nhất cả trận
  const [hour, setHour] = useState(null);             // giờ của trận khi có `sim`; null = lớn nhất cả trận
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(300);
  const timer = useRef(null);
  const useSim = Boolean(sim) && group !== 'scenario';

  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => { onEvent?.(ev); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!useSim) handle.setFrame(frame); }, [frame, handle, useSim]);
  useEffect(() => {
    if (!useSim) return;
    if (hour == null) { handle.setFrame(null); onHour?.(null); return; }
    handle.setFrame(frameAt(meta.frames, sim.times[hour]));
    onHour?.(hour);
  }, [hour, useSim, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => { clearInterval(timer.current); setPlaying(false); };
  const changeEvent = async id => {
    stop();
    setEventId(id);
    setMeta(await handle.loadEvent(id));
    setFrame(null); setHour(null);
  };
  const start = ms => {
    clearInterval(timer.current);
    setPlaying(true);
    timer.current = setInterval(() => {
      if (useSim) {
        setHour(h => {
          const nxt = h == null ? 0 : h + 1;
          if (nxt >= sim.hours) { clearInterval(timer.current); setPlaying(false); return h; }
          return nxt;
        });
      } else {
        setFrame(f => {
          const nxt = f == null ? 0 : f + 1;
          if (nxt >= meta.frames.length) { clearInterval(timer.current); setPlaying(false); return null; }
          return nxt;
        });
      }
    }, useSim ? ms : 700);
  };
  useEffect(() => { if (request && request.id !== eventId) changeEvent(request.id); }, [request]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => (playing ? stop() : start(speed));
  const changeSpeed = ms => { setSpeed(ms); if (playing) start(ms); };

  const simFrame = useSim && hour != null ? frameAt(meta.frames, sim.times[hour]) : null;
  const cur = useSim ? (simFrame != null && simFrame >= 0 ? meta.frames[simFrame] : null) : frame == null ? null : meta.frames[frame];
  const fmt = (v, d = 0) => Number(v).toLocaleString(locale, { maximumFractionDigits: d });
  const hasFrames = meta.frames.length > 0;
  const byLevel = meta.station_peaks_m != null;                 // theo mực nước trạm / kịch bản
  const evName = e => (i18n.language === 'en' ? e.name_en ?? e.name : e.name);
  const rp = meta.return_period_years?.CAULAU;
  const fmtTime = s => new Date(`${s.slice(0, 19)}+07:00`).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fc = group === 'forecast' ? meta.forecast : null;
  const lead = fc && hour != null ? hour - fc.issue_index : null;          // giờ so với lúc phát báo
  const label = useSim
    ? (hour == null ? t(fc ? 'digitalTwin.hand.maxForecast' : 'digitalTwin.hand.maxAll') : `${fmtTime(sim.times[hour])}${lead != null ? ` (${lead > 0 ? '+' : ''}${lead} h)` : ''}`)
    : cur ? fmtTime(cur.time) : t('digitalTwin.hand.maxAll');
  const beforeWindow = useSim && hour != null && simFrame < 0;

  return (
    <div className={`${PANEL} p-3 animate-fade-in ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
            {t('digitalTwin.hand.eyebrow')}
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">{t('digitalTwin.layers.illustrative')}</span>
          </p>
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><FaWater className="text-blue-600" /> {t(fc ? 'digitalTwin.sim.titleForecast' : useSim ? 'digitalTwin.sim.title' : 'digitalTwin.hand.title')}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <select value={eventId} onChange={e => changeEvent(e.target.value)} aria-label={t('digitalTwin.hand.event')}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white max-w-[15rem]">
            {GROUPS.filter(g => handle.events.some(e => (e.group ?? 'flow') === g)).map(g => (
              <optgroup key={g} label={t(`digitalTwin.hand.groups.${g}`)}>
                {handle.events.filter(e => (e.group ?? 'flow') === g).map(e => <option key={e.id} value={e.id}>{evName(e)}</option>)}
              </optgroup>
            ))}
          </select>
          <button onClick={handle.flyTo} title={t('digitalTwin.hand.fly')} className="p-1.5 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700"><FaCrosshairs /></button>
          <CloseButton onClick={onClose} label={t('digitalTwin.flood.close')} />
        </div>
      </div>

      {hasFrames ? (
        <div className="mt-2 flex items-center gap-2">
          <button onClick={toggle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700">
            {playing ? <><FaPause size={10} /> {t('digitalTwin.flood.pause')}</> : <><FaPlay size={10} /> {t('digitalTwin.flood.play')}</>}
          </button>
          {useSim ? (
            <input type="range" min="-1" max={sim.hours - 1} value={hour ?? -1} className="flex-1 accent-blue-600"
              aria-label={t('digitalTwin.hand.time')}
              onChange={e => { const v = Number(e.target.value); setHour(v < 0 ? null : v); }} />
          ) : (
            <input type="range" min="-1" max={meta.frames.length - 1} value={frame ?? -1} className="flex-1 accent-blue-600"
              aria-label={t('digitalTwin.hand.time')}
              onChange={e => { const v = Number(e.target.value); setFrame(v < 0 ? null : v); }} />
          )}
          {useSim && (
            <select value={speed} onChange={e => changeSpeed(Number(e.target.value))} aria-label={t('digitalTwin.sim.speed')}
              className="text-xs border border-slate-200 rounded-lg px-1.5 py-1 bg-white">
              {SPEEDS.map(([l, ms]) => <option key={ms} value={ms}>{l}</option>)}
            </select>
          )}
          <span className="text-xs font-semibold text-slate-700 w-36 text-right tabular-nums">{label}</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-600">
          {t('digitalTwin.hand.envelope')}
          {rp != null && <> · {t('digitalTwin.hand.returnPeriod', { years: fmt(rp, 1) })}</>}
        </p>
      )}
      {beforeWindow && <p className="mt-1 text-[11px] text-slate-500">{t('digitalTwin.sim.beforeWindow')}</p>}
      {fc && (
        <p className="mt-1 text-[11px] text-violet-800">
          {t('digitalTwin.hand.issued', { time: fmtTime(fc.issue_time), scenario: fc.scenario_label,
                                           min: fc.model_horizon_min_h, max: fc.model_horizon_h, total: fc.horizon_h })}
        </p>
      )}

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-6 gap-1.5 text-center">
        <div className="rounded-lg bg-blue-50 px-2 py-1">
          <b className="block text-sm text-blue-700 tabular-nums">{fmt(cur ? cur.area_km2 : beforeWindow ? 0 : meta.max.area_km2, 1)}</b>
          <span className="text-[10.5px] text-slate-500">{t('digitalTwin.hand.area')}</span>
        </div>
        <div className="rounded-lg bg-blue-50 px-2 py-1">
          <b className="block text-sm text-blue-700 tabular-nums">{fmt(cur ? cur.max_depth_m : beforeWindow ? 0 : meta.max.max_depth_m, 1)} m</b>
          <span className="text-[10.5px] text-slate-500">{t('digitalTwin.hand.maxDepth')}</span>
        </div>
        {byLevel ? LEVEL_STATIONS.map(([k, name]) => {
          const v = cur ? cur.levels_m?.[k] : meta.station_peaks_m[k];
          return (
            <div key={k} className="rounded-lg bg-slate-50 px-2 py-1">
              <b className="block text-sm text-slate-700 tabular-nums">{v != null ? `${fmt(v, 2)} m` : '–'}</b>
              <span className="text-[10.5px] text-slate-500">H {name}{cur ? '' : ` (${t('digitalTwin.hand.peak')})`}</span>
            </div>
          );
        }) : FLOW_NODES.map(([k, name]) => (
          <div key={k} className="rounded-lg bg-slate-50 px-2 py-1">
            <b className="block text-sm text-slate-700 tabular-nums">{cur?.q?.[k] != null ? fmt(cur.q[k]) : fmt(meta.peak_flow_m3s?.[k] ?? NaN)}</b>
            <span className="text-[10.5px] text-slate-500">Q {name}{cur ? '' : ` (${t('digitalTwin.hand.peak')})`}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {DEPTH_LEGEND.map(([c, l]) => (
          <span key={l} className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ background: c }} />{l}</span>
        ))}
      </div>
      {useSim ? (   // đang mô phỏng: gập ghi chú để thanh thời gian thấp, không che bảng thông tin hai bên
        <details className="mt-1.5 text-[11px] text-amber-900">
          <summary className="cursor-pointer text-amber-800 font-medium">{t('digitalTwin.sim.methodNote')}</summary>
          <p className="mt-1 leading-relaxed bg-amber-50 border-l-4 border-amber-400 rounded px-2.5 py-1.5">
            {t(group === 'flow' ? 'digitalTwin.hand.note' : `digitalTwin.hand.note_${group}`)}
          </p>
        </details>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed bg-amber-50 border-l-4 border-amber-400 text-amber-900 rounded px-2.5 py-1.5">
          {t(group === 'flow' ? 'digitalTwin.hand.note' : `digitalTwin.hand.note_${group}`)}
        </p>
      )}
    </div>
  );
}
