import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { FaLayerGroup, FaGlobeAsia, FaMap, FaMoon, FaSun, FaWater, FaGem, FaCube } from 'react-icons/fa';
import { createViewer, flyHome, flyTo, flyToPoint, currentView, setBasemap, setNight, setQuality, BASEMAPS } from './map/viewer.js';
import { loadLayer, entityProps } from './map/layers.js';
import { loadHoiAnBuildings, loadHoiAnRoads, createFloodLayer } from './hoian/hoian.js';
import { loadDams } from './map/dams.js';
import { loadFloodHand } from './map/floodHand.js';
import { loadSimulation } from './map/simulation.js';
import { loadRainStations, loadWaterStations } from './map/stations.js';
import { loadForecast } from './map/forecast.js';
import LayerPanel from './components/LayerPanel.jsx';
import InfoPanel from './components/InfoPanel.jsx';
import FloodPanel from './components/FloodPanel.jsx';
import FloodTimelinePanel from './components/FloodTimelinePanel.jsx';
import SimulationHUD from './components/SimulationHUD.jsx';
import AreaBuilderPanel from './components/AreaBuilderPanel.jsx';
import { IconButton, PILL_BTN, PILL_IDLE, PILL_ON, PILL_PRIMARY } from './components/ui.jsx';
import LakeModal from '../../components/Map/LakeModal';
import mapApi from '../../api/mapApi';
import useIsMobile from '../../hooks/useIsMobile';

// Kiểu lớp → hàm nạp. Lớp mới có kiểu riêng thì đăng ký thêm ở đây.
const LOADERS = {
  geojson: loadLayer, hoian_buildings: loadHoiAnBuildings, hoian_roads: loadHoiAnRoads, dams: loadDams, flood_hand: loadFloodHand,
  rain_stations: loadRainStations, wl_stations: loadWaterStations, forecast: loadForecast,
};
const CATALOG_URL = '/data/dt/layers.json';

export default function DigitalTwinMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isMobile = useIsMobile();
  const box = useRef(null);
  const viewerRef = useRef(null);
  const handles = useRef({});
  const pending = useRef({});
  const catalogRef = useRef(null);
  const floodRef = useRef(null);
  const [catalog, setCatalog] = useState(null);
  const [layerState, setLayerState] = useState({});
  const [info, setInfo] = useState(null);
  const [env, setEnv] = useState(null);
  const [basemap, setBm] = useState('satellite');
  const [exag, setExag] = useState(1);   // tỷ lệ thật – có công trình 3D (đập, nhà) nên mặc định không phóng đại
  const [night, setNightState] = useState(false);
  // HD mặc định trên máy tính, tiêu chuẩn trên điện thoại; nhớ lựa chọn của người dùng
  const [quality, setQualityState] = useState(() => {
    try { const q = localStorage.getItem('dt.quality'); if (q) return q; } catch { /* trình duyệt chặn localStorage */ }
    return typeof window !== 'undefined' && window.innerWidth < 640 ? 'standard' : 'high';
  });
  const [flood, setFlood] = useState({ open: false, ready: false, curve: null });
  const [showLayers, setShowLayers] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640);
  const [activeLake, setActiveLake] = useState(null);
  const [lakeData, setLakeData] = useState(null);
  // Mô phỏng diễn biến lũ theo giờ (map/simulation.js) – gắn với lớp "Ngập theo trận lũ"
  const simRef = useRef(null);                 // { dir, ctl, method }
  const simSeq = useRef(0);                    // lượt nạp dữ liệu trận (hủy lượt cũ khi đổi trận)
  const hourSeq = useRef(0);                   // lượt cập nhật giờ (bỏ kết quả về muộn)
  const simHourRef = useRef(null);
  const hudShown = useRef(false);
  const [sim, setSim] = useState(null);        // controller đang dùng (để truyền xuống thanh thời gian)
  const [simSnap, setSimSnap] = useState(null);
  const [hoianReady, setHoianReady] = useState(false);
  // "Dựng khu này" (builder/areaBuilder.js) – khu tự dựng đăng ký vào handles.current.area để bấm chọn và mô phỏng dùng
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaHandle, setAreaHandle] = useState(null);
  const lakesRef = useRef(null);   // danh sách hồ từ API (dùng chung cho bảng thông tin và LakeModal)
  const lakeRecord = async lakeId => {
    if (!lakesRef.current) lakesRef.current = await mapApi.getReservoirs().then(l => (Array.isArray(l) ? l : [])).catch(() => []);
    return lakesRef.current.find(r => Number(r.Id_Lake) === Number(lakeId)) ?? null;
  };

  const patch = (id, p) => setLayerState(s => ({ ...s, [id]: { ...s[id], ...p } }));

  const select = useCallback(picked => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.__selectedHandle?.highlight?.(null);
    viewer.__selectedHandle = null;
    let h = picked?.layerId && handles.current[picked.layerId];
    let tab;
    if (h?.redirect) {                     // bấm vào đập 3D, nhãn dự báo → chọn hồ chứa tương ứng (có thể mở sẵn một thẻ)
      const r = h.redirect(picked);
      tab = r.tab;
      picked = handles.current[r.layerId]?.find(r.code) ?? null;
      h = picked && handles.current[r.layerId];
    }
    if (!h) { setInfo(null); viewer.selectedEntity = undefined; viewer.scene.requestRender(); return; }
    if (h.propsOf) {                       // đối tượng trong Primitive (nhà, đường Hội An)
      viewer.selectedEntity = undefined;
      h.highlight(picked);
      viewer.__selectedHandle = h;
      setInfo({ layer: h.def, props: h.propsOf(picked), pickId: picked });
    } else {
      viewer.selectedEntity = picked;
      setInfo({ layer: h.def, props: entityProps(picked), tab });
    }
    viewer.scene.requestRender();
  }, []);

  /** Nạp lớp (một lần) rồi trả về handle. */
  const ensureLayer = useCallback(id => {
    if (handles.current[id]) return Promise.resolve(handles.current[id]);
    if (pending.current[id]) return pending.current[id];
    const def = catalogRef.current.layers.find(l => l.id === id);
    patch(id, { status: 'loading' });
    pending.current[id] = LOADERS[def.type](viewerRef.current, { ...def, visible: true })
      .then(h => { handles.current[id] = h; patch(id, { status: 'ready', visible: true, opacity: 1 }); return h; })
      .catch(e => { console.warn(id, e); patch(id, { status: 'error', visible: false }); throw e; });
    return pending.current[id];
  }, []);

  useEffect(() => {
    // StrictMode (dev) gắn–gỡ–gắn lại component: viewer tạo xong sau khi đã gỡ thì hủy ngay,
    // và mọi viewer đều hủy khi rời trang để không rò WebGL context.
    let destroyed = false;
    let viewer = null;
    let click = null;
    (async () => {
      const r = await createViewer(box.current);
      viewer = r.viewer;
      if (destroyed) { viewer.destroy(); return; }
      viewerRef.current = viewer;
      if (import.meta.env.DEV) window.vgtbViewer = viewer;
      setQuality(viewer, quality);
      setEnv({ terrainName: r.terrainName, hasIonToken: r.hasIonToken });
      const lat = Number(params.get('lat')), lon = Number(params.get('lon'));
      if (lat && lon) flyToPoint(viewer, lon, lat, Number(params.get('zoom')) || 12);
      else flyHome(viewer, 0);

      const cat = await (await fetch(CATALOG_URL)).json();
      if (destroyed) return;
      catalogRef.current = cat;
      setCatalog(cat);
      for (const def of cat.layers.filter(l => LOADERS[l.type])) {
        if (def.lazy) { patch(def.id, { status: 'idle', visible: false }); continue; }
        patch(def.id, { status: 'loading', visible: def.visible, opacity: 1 });
        LOADERS[def.type](viewer, def)
          .then(h => { if (!destroyed) { handles.current[def.id] = h; patch(def.id, { status: 'ready' }); } })
          .catch(e => { console.warn(def.id, e); patch(def.id, { status: 'error', visible: false }); });
      }

      click = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      click.setInputAction(ev => {
        if (viewer.__drawing) return;            // đang vẽ khung "Dựng khu này"
        const p = viewer.scene.pick(ev.position);
        select(Cesium.defined(p) ? p.id : null);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      // Đổi con trỏ khi rê qua đối tượng bấm được. scene.pick vẽ lại cả khung để dò → rất tốn: chỉ dò tối đa
      // ~7 lần/giây và bỏ qua khi đang kéo/xoay bản đồ (nguyên nhân chính gây khựng khi di chuyển).
      let dragging = false, lastPick = 0;
      const T = Cesium.ScreenSpaceEventType;
      for (const [down, up] of [[T.LEFT_DOWN, T.LEFT_UP], [T.RIGHT_DOWN, T.RIGHT_UP], [T.MIDDLE_DOWN, T.MIDDLE_UP]]) {
        click.setInputAction(() => { dragging = true; }, down);
        click.setInputAction(() => { dragging = false; }, up);
      }
      click.setInputAction(ev => {
        const now = performance.now();
        if (dragging || now - lastPick < 140) return;
        lastPick = now;
        const p = viewer.scene.pick(ev.endPosition);
        viewer.canvas.style.cursor = Cesium.defined(p) && p.id?.layerId ? 'pointer' : '';
      }, T.MOUSE_MOVE);
    })().catch(e => console.error('Khởi tạo bản đồ 3D lỗi:', e));
    return () => {
      destroyed = true;
      click?.destroy();
      simRef.current = null;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
      handles.current = {}; pending.current = {}; floodRef.current = null;
      if (import.meta.env.DEV) delete window.vgtbViewer;
    };
    // tham số URL chỉ dùng lúc mở trang
  }, [select]); // eslint-disable-line react-hooks/exhaustive-deps

  const onToggle = (id, on) => {
    const h = handles.current[id];
    if (!h) { if (on) ensureLayer(id).then(x => x.flyTo?.()).catch(() => {}); return; }
    h.setVisible(on); patch(id, { visible: on });
  };
  const onOpacity = (id, a) => { handles.current[id]?.setOpacity(a); patch(id, { opacity: a }); };

  const onGoto = (layerId, code) => {
    const h = handles.current[layerId];
    const e = h?.find?.(code);
    if (!e) return;
    if (!h.dataSource.show) onToggle(layerId, true);
    select(e);
    viewerRef.current.flyTo(e, { duration: 1.5, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), 0) });
  };

  // Mở bảng vận hành hồ (LakeModal sẵn có của web) – cần bản ghi hồ từ API như HomePage
  const onOpenLake = async lakeId => {
    const data = await lakeRecord(lakeId);
    // Hồ chưa có trong API inflowLake: mở với tên từ bản đồ, viết hoa như các hồ khác
    setActiveLake({ id: lakeId, data: data ?? { Id_Lake: lakeId, name: info?.props?.name?.toLocaleUpperCase('vi') } });
  };

  // Số liệu hồ cho thẻ Hiện trạng/Dự báo khi đang chọn một hồ
  const selectedLakeId = info?.layer.id === 'reservoirs' ? info.props.lake_id : null;
  useEffect(() => {
    let alive = true;
    setLakeData(null);
    if (selectedLakeId == null) return undefined;
    lakeRecord(selectedLakeId).then(d => {
      if (alive) setLakeData(d ?? { Id_Lake: selectedLakeId, name: info?.props?.name?.toLocaleUpperCase('vi') });
    });
    return () => { alive = false; };
  }, [selectedLakeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Khu thí điểm Hội An -------------------------------------------------------------
  const openHoiAn = async () => {
    flyTo(viewerRef.current, 'hoian');
    setFlood(f => ({ ...f, open: true }));
    const [bld, roads] = await Promise.all([ensureLayer('hoian_buildings'), ensureLayer('hoian_roads')]);
    if (!viewerRef.current) return;
    if (!floodRef.current) floodRef.current = createFloodLayer(viewerRef.current, bld.grid);
    roads.setNight?.(night);
    bld.setNight?.(night);
    const curve = [];
    for (let wl = 0.5; wl <= 5.001; wl += 0.25) {
      curve.push({ wl, area: floodRef.current.stats(wl).areaKm2, houses: bld.countFlooded(wl) });
    }
    setFlood({ open: true, ready: true, curve });
  };
  const onLevel = wl => {
    const s = floodRef.current.setLevel(wl);
    const houses = handles.current.hoian_buildings.setLevel(wl);
    const roadKm = handles.current.hoian_roads?.setLevel?.(wl) ?? 0;
    setInfo(i => (i?.pickId ? { ...i, props: handles.current[i.layer.id].propsOf(i.pickId) } : i));
    return { ...s, houses, roadKm };
  };
  const closeFlood = () => {
    floodRef.current?.setLevel(null);
    handles.current.hoian_buildings?.setLevel(null);
    handles.current.hoian_roads?.setLevel?.(null);
    setFlood(f => ({ ...f, open: false }));
  };
  // ---- Mô phỏng diễn biến lũ ------------------------------------------------------------
  const hoianHandles = () => ({ buildings: handles.current.hoian_buildings, roads: handles.current.hoian_roads, area: handles.current.area });
  const stopSim = useCallback(() => {
    simSeq.current++;
    simRef.current?.ctl.destroy(hoianHandles());
    simRef.current = null;
    simHourRef.current = null;
    setSim(null); setSimSnap(null);
  }, []);
  const onSimEvent = async ev => {
    const method = ev?.group === 'stage' ? 'stage' : ev?.group === 'flow' ? 'flow' : null;
    if (!method || !ev.dir) { stopSim(); return; }
    if (simRef.current?.dir === ev.dir) { simRef.current.method = method; return; }
    stopSim();
    const seq = simSeq.current;
    try {
      const ctl = await loadSimulation(viewerRef.current, { dir: ev.dir });
      if (seq !== simSeq.current || !viewerRef.current) { ctl.destroy(); return; }
      simRef.current = { dir: ev.dir, ctl, method };
      setSim(ctl);
    } catch (e) { console.warn('Không nạp được dữ liệu mô phỏng', e); }
  };
  const runSimHour = h => {
    const s = simRef.current;
    if (!s) return;
    simHourRef.current = h;
    if (h == null) { s.ctl.setVisible(false); hoianHandles().buildings?.setDepths(null); hoianHandles().roads?.setDepths(null); setSimSnap(null); return; }
    if (flood.open) closeFlood();                       // kịch bản Hội An cũ cùng tô màu nhà → tắt
    s.ctl.setVisible(true);
    const seq = ++hourSeq.current;
    const snap = s.ctl.setHour(h, {
      method: s.method, ...hoianHandles(),
      // tác động Hội An tính xong sau (lần đầu tải lưới, lấy mẫu địa hình) → cập nhật riêng phần đó
      onImpact: (impact, hh) => { if (simRef.current === s && simHourRef.current === hh) setSimSnap(x => (x ? { ...x, impact } : x)); },
    });
    if (seq === hourSeq.current) {
      setSimSnap(snap);
      if (!hudShown.current && !isMobile) { hudShown.current = true; setShowLayers(false); }   // nhường chỗ cho bảng thượng nguồn
    }
  };
  const buildHoian = async () => {
    await Promise.all([ensureLayer('hoian_buildings'), ensureLayer('hoian_roads')]);
    setHoianReady(true);
    if (simHourRef.current != null) runSimHour(simHourRef.current);
  };
  useEffect(() => { if (!layerState.flood_hand?.visible) stopSim(); }, [layerState.flood_hand?.visible, stopSim]);
  const onAreaBuilt = h => {
    handles.current.area = h;
    setAreaHandle(h);
    if (simHourRef.current != null) runSimHour(simHourRef.current);   // khu mới tham gia mô phỏng ngay
  };
  const clearArea = () => {
    const h = handles.current.area;
    if (!h) return;
    if (viewerRef.current?.__selectedHandle === h) select(null);
    h.destroy();
    delete handles.current.area;
    setAreaHandle(null);
    if (simHourRef.current != null) runSimHour(simHourRef.current);
  };

  const toggleNight = () => {
    const on = !night;
    setNightState(on);
    setNight(viewerRef.current, on);
    handles.current.hoian_roads?.setNight?.(on);
    handles.current.hoian_buildings?.setNight?.(on);
  };
  const toggleQuality = () => {
    const q = quality === 'high' ? 'standard' : 'high';
    setQualityState(q);
    setQuality(viewerRef.current, q);
    try { localStorage.setItem('dt.quality', q); } catch { /* bỏ qua */ }
  };
  const back2d = () => {
    const v = viewerRef.current && currentView(viewerRef.current);
    navigate(v ? `/?lat=${v.lat}&lon=${v.lon}&zoom=${v.zoom}` : '/');
  };

  // Quan hệ giữa đối tượng: hồ ↔ lưu vực bộ phận của hồ
  const related = [];
  if (info?.layer.id === 'reservoirs' && handles.current.catchments?.find(`LVH-${info.props.lake_id}`)) {
    related.push({ layerId: 'catchments', code: `LVH-${info.props.lake_id}`, labelKey: 'digitalTwin.info.gotoCatchment' });
  }
  if (info?.layer.id === 'catchments' && info.props.reservoir_code) {
    related.push({ layerId: 'reservoirs', code: info.props.reservoir_code, labelKey: 'digitalTwin.info.gotoReservoir' });
  }

  // Bố cục: desktop – panel nổi hai bên; điện thoại – panel thành ngăn dưới đáy
  const sheet = 'absolute left-2 right-2 bottom-2 z-[1001] max-h-[46vh]';
  const infoPos = isMobile ? sheet : `absolute top-20 z-[1000] w-[340px] max-h-[calc(100%-6.5rem)] ${flood.open ? 'right-[384px]' : 'right-3'}`;
  const wideInfoPos = isMobile ? 'absolute left-2 right-2 bottom-2 z-[1002] max-h-[78vh]'
    : 'absolute right-3 top-20 z-[1001] w-[min(1120px,calc(100%-5.5rem))] max-h-[calc(100%-6rem)]';
  const floodPos = isMobile ? sheet : 'absolute right-3 top-20 z-[1000] w-[360px] max-h-[calc(100%-6.5rem)]';
  const layerPos = isMobile ? sheet : 'absolute left-16 top-[4.5rem] z-[1000] w-72 max-h-[calc(100%-7rem)]';
  const timelinePos = isMobile ? sheet : 'absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] w-[min(780px,calc(100%-2rem))]';
  const handFlood = layerState.flood_hand?.visible && handles.current.flood_hand;

  return (
    <div className="absolute inset-0">
      <div ref={box} className="absolute inset-0" />

      {/* Thanh công cụ trên cùng */}
      <div className="absolute top-3 left-16 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[1000] flex gap-2 overflow-x-auto p-1.5 rounded-2xl bg-white/85 backdrop-blur border border-white/60 shadow-lg shadow-slate-900/10">
        <button onClick={openHoiAn} className={`${PILL_BTN} ${PILL_PRIMARY}`}><FaWater /> {t('digitalTwin.hoian')}</button>
        <button onClick={() => { setAreaOpen(v => !v); setShowLayers(false); }} className={`${PILL_BTN} ${areaOpen ? PILL_ON : PILL_IDLE}`}>
          <FaCube className="text-orange-500" /> {t('digitalTwin.area.button')}
        </button>
        <button onClick={toggleNight} className={`${PILL_BTN} ${night ? PILL_ON : PILL_IDLE}`}>
          {night ? <FaMoon /> : <FaSun className="text-amber-500" />} {t(night ? 'digitalTwin.night' : 'digitalTwin.day')}
        </button>
        <button onClick={toggleQuality} title={t('digitalTwin.qualityHint')} className={`${PILL_BTN} ${quality === 'high' ? PILL_ON : PILL_IDLE}`}>
          <FaGem /> {t(quality === 'high' ? 'digitalTwin.qualityHigh' : 'digitalTwin.qualityStandard')}
        </button>
        <select value={basemap} aria-label={t('digitalTwin.basemap')}
          onChange={e => { setBm(e.target.value); setBasemap(viewerRef.current, e.target.value, night); }}
          className={`${PILL_BTN} ${PILL_IDLE} pr-2`}>
          {Object.keys(BASEMAPS).map(k => <option key={k} value={k}>{t(`digitalTwin.basemaps.${k}`)}</option>)}
        </select>
        <label className={`${PILL_BTN} ${PILL_IDLE} font-medium`} title={t('digitalTwin.terrainHint')}>
          {t('digitalTwin.terrain')} ×{exag.toFixed(1)}
          <input type="range" min="1" max="4" step="0.5" value={exag} className="w-20 accent-blue-600"
            onChange={e => {
              const v = Number(e.target.value); setExag(v);
              viewerRef.current.scene.verticalExaggeration = v; viewerRef.current.scene.requestRender();
              handles.current.dams?.setExaggeration?.(v);   // đập/lòng hồ tự dựng phải phóng đại theo địa hình
            }} />
        </label>
      </div>

      {/* Cột nút nổi bên trái – giống HomePage */}
      <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2">
        <IconButton icon={<FaLayerGroup />} label={t('digitalTwin.layers.title')} active={showLayers} onClick={() => setShowLayers(v => !v)} />
        <IconButton icon={<FaGlobeAsia />} label={t('digitalTwin.home')} onClick={() => flyHome(viewerRef.current)} />
        <IconButton icon={<FaMap />} label={t('digitalTwin.back2d')} onClick={back2d} />
      </div>

      {showLayers && (
        <LayerPanel catalog={catalog} state={layerState} onToggle={onToggle} onOpacity={onOpacity}
          onClose={() => setShowLayers(false)} className={`${layerPos} animate-slide-in-left`}
          footer={env && <>{t('digitalTwin.terrainSource', { name: env.terrainName })}{!env.hasIonToken && <> · {t('digitalTwin.noIonToken')}</>}</>} />
      )}
      {handFlood && (   // bọc ngoài để căn giữa: hiệu ứng fade-in của panel ghi đè transform
        <div className={timelinePos}>
          <FloodTimelinePanel handle={handles.current.flood_hand} onClose={() => onToggle('flood_hand', false)}
            sim={sim ? { hours: sim.hours, times: sim.times } : null} onEvent={onSimEvent} onHour={runSimHour} />
        </div>
      )}
      {handFlood && simSnap && (
        <SimulationHUD snap={simSnap} isMobile={isMobile} hoianReady={hoianReady || Boolean(handles.current.hoian_buildings)}
          onBuildHoian={buildHoian} onFlyHoian={() => flyTo(viewerRef.current, 'hoian')} onFlyUpstream={() => sim?.flyUpstream()} />
      )}
      {areaOpen && viewerRef.current && (
        <AreaBuilderPanel viewer={viewerRef.current} built={areaHandle} onBuilt={onAreaBuilt} onClear={clearArea}
          onClose={() => setAreaOpen(false)} className={isMobile ? sheet : 'absolute left-16 top-[4.5rem] z-[1001] w-80 max-h-[calc(100%-7rem)] overflow-y-auto'} />
      )}
      {flood.open && <FloodPanel ready={flood.ready} curve={flood.curve} onLevel={onLevel} onClose={closeFlood} className={floodPos} />}
      <InfoPanel info={info} related={related} onClose={() => select(null)} onGoto={onGoto} onOpenLake={onOpenLake}
        lakeData={lakeData} className={`${infoPos} ${isMobile ? 'z-[1002]' : ''}`} wideClassName={wideInfoPos} />

      {!env && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="bg-white/90 rounded-xl px-4 py-2 shadow text-sm text-slate-600 animate-pulse-soft">{t('digitalTwin.loadingViewer')}</p>
        </div>
      )}
      <LakeModal lakeId={activeLake?.id} lakeData={activeLake?.data} onClose={() => setActiveLake(null)} />
    </div>
  );
}
