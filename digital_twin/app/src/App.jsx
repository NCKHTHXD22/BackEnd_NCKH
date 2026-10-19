import { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import { createViewer, flyHome, flyTo, setBasemap, setNight, BASEMAPS } from './map/viewer.js';
import { loadLayer, entityProps } from './map/layers.js';
import { loadHoiAnBuildings, loadHoiAnRoads, createFloodLayer } from './hoian/hoian.js';
import LayerPanel from './components/LayerPanel.jsx';
import InfoPanel from './components/InfoPanel.jsx';
import FloodPanel from './components/FloodPanel.jsx';

// Kiểu lớp → hàm nạp. Lớp mới có kiểu riêng thì đăng ký thêm ở đây.
const LOADERS = { geojson: loadLayer, hoian_buildings: loadHoiAnBuildings, hoian_roads: loadHoiAnRoads };

export default function App() {
  const box = useRef(null);
  const viewerRef = useRef(null);
  const handles = useRef({});
  const pending = useRef({});
  const floodRef = useRef(null);
  const [catalog, setCatalog] = useState(null);
  const [layerState, setLayerState] = useState({});
  const [info, setInfo] = useState(null);
  const [env, setEnv] = useState(null);
  const [basemap, setBm] = useState('satellite');
  const [exag, setExag] = useState(1.5);
  const [night, setNightState] = useState(false);
  const [flood, setFlood] = useState({ open: false, ready: false, curve: null });

  const patch = (id, p) => setLayerState(s => ({ ...s, [id]: { ...s[id], ...p } }));

  const select = useCallback(picked => {
    const viewer = viewerRef.current;
    const prev = viewer.__selectedHandle;
    prev?.highlight?.(null);
    viewer.__selectedHandle = null;
    const layerId = picked?.layerId;
    const h = layerId && handles.current[layerId];
    if (!h) { setInfo(null); viewer.selectedEntity = undefined; viewer.scene.requestRender(); return; }
    if (h.propsOf) {                       // đối tượng trong Primitive (nhà 3D)
      viewer.selectedEntity = undefined;
      h.highlight(picked);
      viewer.__selectedHandle = h;
      setInfo({ layer: h.def, props: h.propsOf(picked), pickId: picked });
    } else {
      viewer.selectedEntity = picked;
      setInfo({ layer: h.def, props: entityProps(picked) });
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
  const catalogRef = useRef(null);

  useEffect(() => {
    let destroyed = false;
    (async () => {
      const { viewer, terrainName, hasIonToken } = await createViewer(box.current);
      if (destroyed) { viewer.destroy(); return; }
      viewerRef.current = viewer;
      window.vgtbViewer = viewer; // để kiểm thử tự động / gỡ lỗi trong console
      setEnv({ terrainName, hasIonToken });
      flyHome(viewer, 0);

      const cat = await (await fetch('/data/dt/layers.json')).json();
      catalogRef.current = cat;
      setCatalog(cat);
      for (const def of cat.layers.filter(l => LOADERS[l.type])) {
        if (def.lazy) { patch(def.id, { status: 'idle', visible: false }); continue; }
        patch(def.id, { status: 'loading', visible: def.visible, opacity: 1 });
        LOADERS[def.type](viewer, def)
          .then(h => { handles.current[def.id] = h; patch(def.id, { status: 'ready' }); })
          .catch(e => { console.warn(def.id, e); patch(def.id, { status: 'error', visible: false }); });
      }

      const click = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      click.setInputAction(ev => {
        const p = viewer.scene.pick(ev.position);
        select(Cesium.defined(p) ? p.id : null);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      click.setInputAction(ev => {
        const p = viewer.scene.pick(ev.endPosition);
        viewer.canvas.style.cursor = Cesium.defined(p) && p.id?.layerId ? 'pointer' : '';
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    })();
    return () => { destroyed = true; viewerRef.current?.destroy(); };
  }, [select]);

  const onToggle = (id, on) => {
    const h = handles.current[id];
    if (!h) { if (on) ensureLayer(id); return; }
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

  // ---- Khu thí điểm Hội An -------------------------------------------------------------
  const openHoiAn = async () => {
    flyTo(viewerRef.current, 'hoian');
    setFlood(f => ({ ...f, open: true }));
    const [bld, roads] = await Promise.all([ensureLayer('hoian_buildings'), ensureLayer('hoian_roads')]);
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
  const toggleNight = () => {
    const on = !night;
    setNightState(on);
    setNight(viewerRef.current, on);
    handles.current.hoian_roads?.setNight?.(on);
    handles.current.hoian_buildings?.setNight?.(on);
  };

  // Quan hệ giữa đối tượng: hồ ↔ lưu vực bộ phận của hồ
  const related = [];
  if (info?.layer.id === 'reservoirs') {
    const c = handles.current.catchments?.find(`LVH-${info.props.lake_id}`);
    if (c) related.push({ layerId: 'catchments', code: `LVH-${info.props.lake_id}`, label: 'Xem lưu vực bộ phận của hồ' });
  }
  if (info?.layer.id === 'catchments' && info.props.reservoir_code) {
    related.push({ layerId: 'reservoirs', code: info.props.reservoir_code, label: 'Đến hồ chứa' });
  }

  return (
    <div className="app">
      <div ref={box} className="map" />
      <div className="topbar panel">
        <h1>Bản đồ số lưu vực Vu Gia – Thu Bồn</h1>
        <button onClick={() => flyHome(viewerRef.current)}>Toàn lưu vực</button>
        <button className="accent" onClick={openHoiAn}>Khu Hội An · Kịch bản ngập</button>
        <button onClick={toggleNight} className={night ? 'on' : ''}>{night ? 'Ban đêm' : 'Ban ngày'}</button>
        <select value={basemap} onChange={e => { setBm(e.target.value); setBasemap(viewerRef.current, e.target.value, night); }}>
          {Object.entries(BASEMAPS).map(([k, b]) => <option key={k} value={k}>{b.name}</option>)}
        </select>
        <label className="exag" title="Phóng đại địa hình theo chiều đứng">
          Địa hình ×{exag.toFixed(1)}
          <input type="range" min="1" max="4" step="0.5" value={exag}
            onChange={e => {
              const v = Number(e.target.value); setExag(v);
              viewerRef.current.scene.verticalExaggeration = v; viewerRef.current.scene.requestRender();
            }} />
        </label>
      </div>
      <LayerPanel catalog={catalog} state={layerState} onToggle={onToggle} onOpacity={onOpacity} />
      {flood.open && <FloodPanel ready={flood.ready} curve={flood.curve} onLevel={onLevel} onClose={closeFlood} />}
      <InfoPanel shifted={flood.open} info={info} related={related} onClose={() => select(null)} onGoto={onGoto} />
      {env && (
        <div className="status">
          Địa hình: {env.terrainName}
          {!env.hasIonToken && <> · chưa có token Cesium ion (xem README)</>}
        </div>
      )}
    </div>
  );
}
