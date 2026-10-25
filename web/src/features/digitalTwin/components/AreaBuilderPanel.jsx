import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Cesium from 'cesium';
import { FaCube, FaDrawPolygon, FaCheck, FaSpinner, FaTrash, FaPlane } from 'react-icons/fa';
import { PANEL, CloseButton } from './ui.jsx';
import { fetchArea, renderArea, MAX_AREA_KM2 } from '../builder/areaBuilder.js';

const EXAMPLES = [
  { key: 'hoianOld', bbox: { west: 108.3255, south: 15.8755, east: 108.3345, north: 15.8815 } },     // phố cổ Hội An ~0,64 km²
  { key: 'camLe', bbox: { west: 108.1925, south: 15.9975, east: 108.2015, north: 16.0045 } },        // quanh trạm Cẩm Lệ
];
const STEPS = ['nominatim', 'overpass', 'openBuildings', 'merge', 'render'];
const km2 = b => ((b.east - b.west) * 111.32 * Math.cos(((b.south + b.north) / 2) * Math.PI / 180) * (b.north - b.south) * 110.57);

/** "Dựng khu này": vẽ một khung trên bản đồ (2 cú bấm) → trình duyệt tự lấy OSM + Open Buildings + Nominatim và dựng 3D. */
export default function AreaBuilderPanel({ viewer, onBuilt, onClear, onClose, built, className = '' }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'vi-VN';
  const fmt = (v, d = 0) => Number(v).toLocaleString(locale, { maximumFractionDigits: d });
  const [mode, setMode] = useState(built ? 'done' : 'idle');   // idle | draw | ready | loading | done | error
  const [bbox, setBbox] = useState(built?.bbox ?? null);
  const [done, setDone] = useState([]);
  const [note, setNote] = useState(null);
  const [stats, setStats] = useState(built?.area?.stats ? { ...built.area.stats, name: built.area.name, areaKm2: built.area.areaKm2 } : null);
  const handler = useRef(null);
  const rect = useRef(null);
  const abort = useRef(null);

  const clearRect = () => { if (rect.current) { viewer.entities.remove(rect.current); rect.current = null; } viewer.scene.requestRender(); };
  const stopDraw = () => { handler.current?.destroy(); handler.current = null; viewer.__drawing = false; viewer.canvas.style.cursor = ''; };
  useEffect(() => () => { stopDraw(); abort.current?.abort(); clearRect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showRect = b => {
    const r = Cesium.Rectangle.fromDegrees(b.west, b.south, b.east, b.north);
    if (!rect.current) {
      rect.current = viewer.entities.add({ rectangle: { coordinates: r, material: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.18),
        outline: false, classificationType: Cesium.ClassificationType.TERRAIN } });
    } else rect.current.rectangle.coordinates = r;
    viewer.scene.requestRender();
  };
  const pick = pos => {
    const ray = viewer.camera.getPickRay(pos);
    const p = (ray && viewer.scene.globe.pick(ray, viewer.scene)) ?? viewer.camera.pickEllipsoid(pos);
    if (!p) return null;
    const c = Cesium.Cartographic.fromCartesian(p);
    return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)];
  };
  const startDraw = () => {
    stopDraw(); clearRect(); setBbox(null); setNote(null);
    setMode('draw');
    viewer.__drawing = true;                     // DigitalTwinMap bỏ qua bấm chọn đối tượng khi đang vẽ
    viewer.canvas.style.cursor = 'crosshair';
    let a = null;
    const h = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const toBox = (p, q) => ({ west: Math.min(p[0], q[0]), east: Math.max(p[0], q[0]), south: Math.min(p[1], q[1]), north: Math.max(p[1], q[1]) });
    h.setInputAction(ev => {
      const p = pick(ev.position);
      if (!p) return;
      if (!a) { a = p; return; }
      const b = toBox(a, p);
      stopDraw();
      setBbox(b); showRect(b);
      setMode('ready');
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    h.setInputAction(ev => { if (a) { const p = pick(ev.endPosition); if (p) showRect(toBox(a, p)); } }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    handler.current = h;
  };
  const pickExample = ex => {
    stopDraw(); setNote(null);
    setBbox(ex.bbox); showRect(ex.bbox); setMode('ready');
    viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(ex.bbox.west, ex.bbox.south, ex.bbox.east, ex.bbox.north), duration: 1.5 });
  };
  const build = async () => {
    if (!bbox) return;
    if (km2(bbox) > MAX_AREA_KM2) { setNote(t('digitalTwin.area.tooBig', { a: fmt(km2(bbox), 2), max: MAX_AREA_KM2 })); return; }
    abort.current = new AbortController();
    setMode('loading'); setDone([]); setNote(null);
    const mark = k => setDone(d => [...d, k]);
    try {
      onClear?.();
      const t0 = performance.now();
      const area = await fetchArea(bbox, {
        signal: abort.current.signal,
        onStep: k => {
          if (k === 'overpass') mark('nominatim');
          if (k === 'merge') { mark('overpass'); mark('openBuildings'); }
          if (k === 'overpassMirror') setNote(t('digitalTwin.area.mirror'));
          if (k === 'overpassRetry') setNote(t('digitalTwin.area.retry'));
        },
      });
      mark('merge');
      const handle = await renderArea(viewer, area);
      mark('render');
      clearRect();
      const s = { ...area.stats, seconds: (performance.now() - t0) / 1000, name: area.name, areaKm2: area.areaKm2 };
      area.stats = s;
      setStats(s);
      setMode('done');
      onBuilt?.(handle);
      handle.flyTo();
    } catch (e) {
      if (abort.current?.signal.aborted) { setMode('ready'); return; }
      setNote(String(e.message ?? e));
      setMode('error');
    }
  };
  const remove = () => { onClear?.(); clearRect(); setStats(null); setBbox(null); setMode('idle'); };

  return (
    <div className={`${PANEL} p-3 animate-slide-in-left ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-slate-500">{t('digitalTwin.area.eyebrow')}</p>
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><FaCube className="text-orange-500" /> {t('digitalTwin.area.title')}</h2>
        </div>
        <CloseButton onClick={() => { stopDraw(); if (mode !== 'done') clearRect(); onClose(); }} label={t('digitalTwin.area.close')} />
      </div>

      {mode !== 'done' && (
        <>
          <p className="mt-2 text-[11.5px] text-slate-600 leading-snug">{t(mode === 'draw' ? 'digitalTwin.area.drawHint' : 'digitalTwin.area.hint', { max: MAX_AREA_KM2 })}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={startDraw} disabled={mode === 'loading'} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${mode === 'draw' ? 'bg-orange-100 text-orange-800' : 'bg-orange-500 text-white hover:bg-orange-600'} disabled:opacity-50`}>
              <FaDrawPolygon /> {t('digitalTwin.area.draw')}
            </button>
            {EXAMPLES.map(ex => (
              <button key={ex.key} onClick={() => pickExample(ex)} disabled={mode === 'loading'} className="px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">
                {t(`digitalTwin.area.examples.${ex.key}`)}
              </button>
            ))}
          </div>
          {bbox && mode !== 'draw' && (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className={km2(bbox) > MAX_AREA_KM2 ? 'text-red-600 font-semibold' : 'text-slate-700'}>{fmt(km2(bbox), 2)} km²</span>
              {mode === 'loading'
                ? <button onClick={() => abort.current?.abort()} className="px-3 py-1.5 rounded-lg text-xs border border-slate-200">{t('digitalTwin.area.cancel')}</button>
                : <button onClick={build} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900">{t('digitalTwin.area.build')}</button>}
            </div>
          )}
          {(mode === 'loading' || mode === 'error') && (
            <ul className="mt-2 space-y-1 text-[11.5px]">
              {STEPS.map(k => (
                <li key={k} className="flex items-center gap-2 text-slate-600">
                  {done.includes(k) ? <FaCheck className="text-emerald-600" /> : mode === 'loading' ? <FaSpinner className="animate-spin text-slate-400" /> : <span className="w-3" />}
                  {t(`digitalTwin.area.steps.${k}`)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {mode === 'done' && stats && (
        <div className="mt-2 text-[11.5px] text-slate-700 space-y-1.5">
          <p className="font-semibold text-slate-800">{stats.name ?? t('digitalTwin.area.newArea')}</p>
          <p>{fmt(stats.areaKm2, 2)} km² · {t('digitalTwin.area.builtIn', { s: fmt(stats.seconds, 1) })} · {fmt(stats.houses)} {t('digitalTwin.area.houses')} · {fmt(stats.trees)} {t('digitalTwin.area.trees')} · {fmt(stats.roadKm, 1)} km {t('digitalTwin.area.roads')}</p>
          <div className="grid grid-cols-2 gap-1 text-center">
            <div className="rounded bg-orange-50 px-1 py-0.5"><b className="block">{fmt(stats.osmHouses)}</b><span className="text-[10px] text-slate-500">{t('digitalTwin.area.fromOsm')}</span></div>
            <div className="rounded bg-sky-50 px-1 py-0.5"><b className="block">{fmt(stats.obHouses)}</b><span className="text-[10px] text-slate-500">{t('digitalTwin.area.fromOb')}</span></div>
          </div>
          <p className="text-[10.5px] text-slate-500 leading-snug">
            {t('digitalTwin.area.dropped', { low: fmt(stats.dropped.lowConfidence), dup: fmt(stats.dropped.overlapOsm), road: fmt(stats.dropped.onRoad), water: fmt(stats.dropped.onWater), raw: fmt(stats.obRaw) })}
          </p>
          {stats.osmFailed && (
            <div className="text-[11px] text-amber-900 bg-amber-50 border-l-4 border-amber-400 rounded px-2 py-1.5">
              {t('digitalTwin.area.osmFailed')}
              <button onClick={build} className="mt-1 block px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600">{t('digitalTwin.area.rebuild')}</button>
            </div>
          )}
          <p className="text-[10.5px] text-slate-500 break-words">{t('digitalTwin.area.placeVia')}: {stats.place} · Overpass: {stats.overpass} · Open Buildings: {stats.openBuildings}</p>
          <p className="text-[10.5px] text-slate-500 leading-snug">{t('digitalTwin.area.floodHint')}</p>
          <div className="flex gap-1.5">
            <button onClick={() => built?.flyTo()} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white"><FaPlane /> {t('digitalTwin.area.fly')}</button>
            <button onClick={remove} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 hover:bg-red-50 hover:text-red-700"><FaTrash /> {t('digitalTwin.area.remove')}</button>
            <button onClick={startDraw} className="px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 hover:bg-slate-50">{t('digitalTwin.area.another')}</button>
          </div>
          <p className="text-[10px] text-slate-400">© OpenStreetMap · Open Buildings (Google, Microsoft – VIDA) · Nominatim</p>
        </div>
      )}
      {note && <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1">{note}</p>}
    </div>
  );
}
