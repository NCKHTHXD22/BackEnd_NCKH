import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCloudRain, FaMountain, FaWater, FaHome, FaRoad, FaPlane, FaCube } from 'react-icons/fa';
import { PANEL } from './ui.jsx';
import { MODE_COLOR, ALARM_COLOR } from '../map/simulation.js';
import { ROAD_DEPTH_STOPS } from '../hoian/hoian.js';

const HOUSE_COLORS = ['#9be7ff', '#3fa9f5', '#1f6fd1', '#7b3fe4', '#e63946'];   // DEPTH_STOPS của hoian.js
const HOUSE_LABELS = ['< 0,5 m', '0,5–1 m', '1–2 m', '2–3 m', '> 3 m'];
const ROAD_LABELS = ['0,15–0,3 m', '0,3–0,5 m', '0,5–1 m', '> 1 m'];

/** Số nhà ngập theo độ sâu + km đường ngập theo mức nguy hiểm (Hội An hoặc khu tự dựng). */
function Impact({ imp, t, fmt }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-slate-600">{t('digitalTwin.sim.houses')}</span>
        <b className="text-base text-rose-700 tabular-nums">{fmt(imp?.houses?.total ?? 0)}</b>
      </div>
      <div className="grid grid-cols-5 gap-1 text-center">
        {(imp?.houses?.byClass ?? [0, 0, 0, 0, 0]).map((v, i) => (
          <div key={i} className="rounded px-1 py-0.5" style={{ background: `${HOUSE_COLORS[i]}33` }}>
            <b className="block tabular-nums">{fmt(v)}</b><span className="text-[9.5px] text-slate-600">{HOUSE_LABELS[i]}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-600 flex items-center gap-1"><FaRoad /> {t('digitalTwin.sim.roads')}</span>
        <b className="text-base text-amber-700 tabular-nums">{fmt(imp?.roads?.km_total ?? 0, 1)} km</b>
      </div>
      <div className="grid grid-cols-4 gap-1 text-center">
        {(imp?.roads?.km_by_class ?? [0, 0, 0, 0]).map((v, i) => (
          <div key={i} className="rounded px-1 py-0.5" style={{ background: `${ROAD_DEPTH_STOPS[i][1]}33` }}>
            <b className="block tabular-nums">{fmt(v, 1)}</b><span className="text-[9.5px] text-slate-600">{ROAD_LABELS[i]}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Bảng thông tin của chế độ mô phỏng diễn biến lũ: thượng nguồn (hồ), hạ du (trạm), tác động Hội An, thời gian + mưa.
 *  Chỉ hiển thị – số liệu do map/simulation.js tính cho từng giờ. */
export default function SimulationHUD({ snap, hoianReady, onBuildHoian, onFlyHoian, onFlyUpstream, isMobile }) {
  const { t, i18n } = useTranslation();
  const [allLakes, setAllLakes] = useState(false);
  if (!snap) return null;
  const locale = i18n.language === 'en' ? 'en-GB' : 'vi-VN';
  const fmt = (v, d = 0) => (v == null ? '–' : Number(v).toLocaleString(locale, { maximumFractionDigits: d }));
  const time = new Date(`${snap.time}+07:00`).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const lakes = [...snap.lakes].sort((a, b) => (b.q_in ?? 0) - (a.q_in ?? 0));
  const shown = allLakes ? lakes : lakes.slice(0, 7);
  const rain = snap.rain_mm ?? 0;
  const rainLabel = rain >= 10 ? t('digitalTwin.sim.rainHeavy') : rain >= 3 ? t('digitalTwin.sim.rainModerate') : rain > 0.2 ? t('digitalTwin.sim.rainLight') : t('digitalTwin.sim.rainNone');
  const imp = snap.impact;

  return (
    <>
      {/* thời gian + mưa */}
      <div className={`absolute ${isMobile ? 'top-[4.5rem] left-2 right-2' : 'top-[4.6rem] left-1/2 -translate-x-1/2'} z-[1000] pointer-events-none`}>
        <div className="mx-auto w-fit flex items-center gap-3 px-4 py-1.5 rounded-full bg-slate-900/80 text-white shadow-lg animate-fade-in">
          <span className="text-sm font-semibold tabular-nums">{time}</span>
          <span className={`flex items-center gap-1.5 text-xs ${rain >= 3 ? 'text-sky-300' : 'text-slate-300'}`}>
            <FaCloudRain className={rain >= 3 ? 'animate-pulse' : ''} /> {fmt(rain, 1)} mm/{t('digitalTwin.sim.hour')} · {rainLabel}
          </span>
        </div>
      </div>

      {!isMobile && (
        <div className={`${PANEL} absolute left-16 top-[7.2rem] z-[999] w-[330px] max-h-[calc(100%-20.5rem)] overflow-y-auto p-3 animate-slide-in-left`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><FaMountain className="text-emerald-600" /> {t('digitalTwin.sim.upstream')}</h3>
            <button onClick={onFlyUpstream} title={t('digitalTwin.sim.flyUpstream')} className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"><FaPlane /></button>
          </div>
          <p className="text-[10.5px] text-slate-500 mb-1.5">{t('digitalTwin.sim.upstreamHint')}</p>
          <div className="space-y-1.5">
            {shown.map(l => {
              const trend = l.q_in != null && l.q_in_prev3 != null ? l.q_in - l.q_in_prev3 : 0;   // so với 3 giờ trước
              const full = l.h != null && l.MNDBT != null ? l.h >= l.MNDBT : false;
              return (
                <div key={l.id} className="rounded-lg border border-slate-100 bg-white/70 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-[12px] text-slate-800 truncate">{l.name}</b>
                    {l.mode && (
                      <span className="text-[10px] font-semibold text-white rounded px-1.5 py-0.5 shrink-0" style={{ background: MODE_COLOR[l.mode] }}>
                        {t(`digitalTwin.sim.modes.${l.mode}`)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 grid grid-cols-3 gap-1 text-[11px] tabular-nums">
                    <span title={t('digitalTwin.sim.qIn')}>↓ {fmt(l.q_in)}<i className={`not-italic ml-0.5 ${trend > 50 ? 'text-red-600' : trend < -50 ? 'text-emerald-600' : 'text-slate-400'}`}>{trend > 50 ? '▲' : trend < -50 ? '▼' : '•'}</i></span>
                    <span title={t('digitalTwin.sim.qOut')} className={l.q_out > (l.q_in ?? 0) * 1.1 ? 'text-blue-700 font-semibold' : ''}>↑ {fmt(l.q_out)}</span>
                    <span title="H" className={full ? 'text-red-600 font-semibold' : 'text-slate-600'}>H {fmt(l.h, 1)}</span>
                  </div>
                  {l.rain > 0 && <div className="text-[10.5px] text-sky-700">{t('digitalTwin.sim.rain')} {fmt(l.rain, 1)} mm</div>}
                </div>
              );
            })}
          </div>
          {lakes.length > 7 && (
            <button onClick={() => setAllLakes(v => !v)} className="mt-1.5 text-[11px] text-blue-700 hover:underline">
              {allLakes ? t('digitalTwin.sim.showLess') : t('digitalTwin.sim.showAll', { n: lakes.length })}
            </button>
          )}
          <p className="mt-2 text-[10.5px] text-slate-500 leading-snug">↓ {t('digitalTwin.sim.qIn')} · ↑ {t('digitalTwin.sim.qOut')} (m³/s) · {t('digitalTwin.sim.noForecast')}</p>
        </div>
      )}

      <div className={`${PANEL} ${isMobile ? 'absolute left-2 right-2 top-[7rem] max-h-[30vh]' : 'absolute right-3 top-[7.2rem] w-[300px] max-h-[calc(100%-20.5rem)]'} z-[999] overflow-y-auto p-3 animate-fade-in`}>
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><FaWater className="text-blue-600" /> {t('digitalTwin.sim.downstream')}</h3>
        <div className="mt-1.5 grid grid-cols-1 gap-1">
          {snap.stations.map(s => (
            <div key={s.code} className="flex items-center justify-between text-[12px] rounded-md px-2 py-1 bg-white/70 border border-slate-100">
              <span className="text-slate-700">{s.name}</span>
              <span className="flex items-center gap-1.5 tabular-nums">
                <b className="text-slate-800">{s.h == null ? '–' : `${fmt(s.h, 2)} m`}</b>
                {s.level != null && (
                  <span className="text-[10px] font-semibold text-white rounded px-1.5" style={{ background: ALARM_COLOR[s.level] }}>
                    {s.level ? `BĐ ${['', 'I', 'II', 'III'][s.level]}` : t('digitalTwin.sim.belowAlarm')}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        <h3 className="mt-3 text-sm font-bold text-slate-800 flex items-center gap-2"><FaHome className="text-rose-600" /> {t('digitalTwin.sim.impact')}</h3>
        {!hoianReady ? (
          <div className="mt-1.5 text-[11.5px] text-slate-600">
            {t('digitalTwin.sim.buildHint')}
            <button onClick={onBuildHoian} className="mt-1.5 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700">{t('digitalTwin.sim.build')}</button>
          </div>
        ) : (
          <div className="mt-1.5 space-y-2 text-[11.5px]">
            <Impact imp={imp} t={t} fmt={fmt} />
            <p className="text-[10.5px] text-slate-500 leading-snug">{t('digitalTwin.sim.roadHint')}</p>
            <button onClick={onFlyHoian} className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900 flex items-center justify-center gap-2"><FaPlane /> {t('digitalTwin.sim.flyHoian')}</button>
          </div>
        )}
        {imp?.area && (
          <>
            <h3 className="mt-3 text-sm font-bold text-slate-800 flex items-center gap-2"><FaCube className="text-orange-500" /> {imp.area.name}</h3>
            <div className="mt-1.5 space-y-2 text-[11.5px]"><Impact imp={imp.area} t={t} fmt={fmt} /></div>
          </>
        )}
      </div>
    </>
  );
}
