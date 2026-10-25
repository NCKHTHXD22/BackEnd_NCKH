import * as Cesium from 'cesium';
import { renderBurst } from './viewer.js';

// Lớp ngập theo trận lũ / kịch bản (mức cơ sở, lộ trình 6.1/9.1): ảnh độ sâu từng khung giờ phủ lên địa hình.
// Dữ liệu: <url><thư mục>/meta.json + t###.png + max.png, tạo bởi digital_twin/scripts/14_hand.py (theo lưu lượng),
// 19_hand_stage.py (theo mực nước trạm đo), 22_flood_scenarios.py (kịch bản, chỉ max.png). Mỗi mục trong `events`
// có thể có `url` và `dir` riêng (mặc định: url của lớp, dir = id).
// Mỗi lúc chỉ giữ một ImageryLayer (thay ảnh khi đổi khung) để không chiếm bộ nhớ đồ họa.
const slash = u => (u.endsWith('/') ? u : `${u}/`);

export async function loadFloodHand(viewer, def) {
  const pathOf = id => {
    const ev = def.events.find(e => e.id === id) ?? { id };
    return `${slash(ev.url ?? def.url)}${ev.dir ?? ev.id}/`;
  };
  let meta = null, rect = null, layer = null, eventId = null, token = 0;
  let visible = Boolean(def.visible), opacity = 0.85;

  const show = async file => {
    const my = ++token;
    const provider = await Cesium.SingleTileImageryProvider.fromUrl(`${pathOf(eventId)}${file}`, { rectangle: rect });
    if (my !== token || viewer.isDestroyed()) return;          // đã chuyển khung khác trong lúc tải
    const next = viewer.imageryLayers.addImageryProvider(provider);
    next.alpha = opacity;
    next.show = visible;
    if (layer) viewer.imageryLayers.remove(layer, true);
    layer = next;
    viewer.scene.requestRender();
  };

  const loadEvent = async id => {
    eventId = id;
    meta = await (await fetch(`${pathOf(id)}meta.json`)).json();
    const [w, s, e, n] = meta.bounds;
    rect = Cesium.Rectangle.fromDegrees(w, s, e, n);
    // tải sẵn ảnh vào bộ nhớ đệm trình duyệt để phát mượt
    meta.frames.forEach(f => { const img = new Image(); img.src = `${pathOf(id)}${f.file}`; });
    await show('max.png');
    return meta;
  };

  await loadEvent(def.events[0].id);
  return {
    def,
    events: def.events,
    get meta() { return meta; },
    loadEvent,
    // null = độ sâu lớn nhất cả trận; số âm = ẩn ảnh (giờ mô phỏng trước khung đầu tiên)
    setFrame: i => {
      if (i != null && i < 0) {
        token++;
        if (layer) { viewer.imageryLayers.remove(layer, true); layer = null; viewer.scene.requestRender(); }
        return undefined;
      }
      return i == null ? show('max.png') : show(meta.frames[i].file);
    },
    flyTo: () => viewer.camera.flyTo({ destination: rect, duration: 1.5 }),
    setVisible(v) {
      visible = v;
      if (layer) layer.show = v;
      renderBurst(viewer, 500);
    },
    setOpacity(a) {
      opacity = a;
      if (layer) layer.alpha = a;
      viewer.scene.requestRender();
    },
  };
}
