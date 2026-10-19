import * as Cesium from 'cesium';

const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;

export const BASEMAPS = {
  satellite: {
    make: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 19,
      credit: 'Ảnh nền © Esri, Maxar, Earthstar Geographics',
    }),
  },
  osm: {
    make: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maximumLevel: 19,
      credit: '© OpenStreetMap contributors',
    }),
  },
};

// Tên bản đồ nền hiển thị theo i18n: digitalTwin.basemaps.<khóa>
// Địa hình: có token Cesium ion → Cesium World Terrain; không có → ArcGIS World Elevation 3D
// (dùng tạm được, không cần tài khoản). Khi tự lưu trữ terrain trên VPS, thay ở đây bằng
// Cesium.CesiumTerrainProvider.fromUrl('<máy chủ>/tiles/terrain').
async function makeTerrain() {
  if (ION_TOKEN) {
    Cesium.Ion.defaultAccessToken = ION_TOKEN;
    return { provider: await Cesium.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true }), name: 'Cesium World Terrain' };
  }
  const provider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
    'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer');
  return { provider, name: 'Esri World Elevation 3D' };
}

export async function createViewer(container) {
  const viewer = new Cesium.Viewer(container, {
    baseLayer: new Cesium.ImageryLayer(BASEMAPS.satellite.make()),
    baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, timeline: false, animation: false, infoBox: false,
    fullscreenButton: false, selectionIndicator: true,
  });
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.verticalExaggeration = 1.5;
  viewer.scene.requestRenderMode = true;           // chỉ vẽ lại khi có thay đổi – nhẹ máy
  viewer.scene.maximumRenderTimeChange = Infinity;
  viewer.cesiumWidget.creditContainer.style.fontSize = '10px';

  let terrainName = 'WGS84 ellipsoid';
  try {
    const t = await makeTerrain();
    viewer.terrainProvider = t.provider;
    terrainName = t.name;
  } catch (e) {
    console.warn('Không tải được địa hình, dùng mặt phẳng:', e);
  }
  return { viewer, terrainName, hasIonToken: Boolean(ION_TOKEN) };
}

// requestRenderMode chỉ vẽ khi được yêu cầu; hình bám địa hình (đường, polygon) dựng lại bất đồng
// bộ sau khi đổi vật liệu → vẽ liên tục vài giây để không giữ khung hình cũ.
export function renderBurst(viewer, ms = 3000) {
  clearInterval(viewer.__burst);
  const end = Date.now() + ms;
  viewer.__burst = setInterval(() => {
    viewer.scene.requestRender();
    if (Date.now() > end) clearInterval(viewer.__burst);
  }, 100);
}

export function setBasemap(viewer, key, night = false) {
  const layers = viewer.imageryLayers;
  layers.remove(layers.get(0), true);
  layers.add(new Cesium.ImageryLayer(BASEMAPS[key].make()), 0);
  setNight(viewer, night);
}

// Chế độ ban đêm: tối ảnh nền, bầu trời; đèn đường do lớp đường tự phát sáng (layers.js)
export function setNight(viewer, on) {
  const base = viewer.imageryLayers.get(0);
  base.brightness = on ? 0.28 : 1;
  base.saturation = on ? 0.6 : 1;
  base.hue = on ? -0.05 : 0;
  viewer.scene.skyAtmosphere.brightnessShift = on ? -0.75 : 0;
  viewer.scene.globe.atmosphereBrightnessShift = on ? -0.6 : 0;
  renderBurst(viewer);
}

const VIEWS = {
  // Nhìn từ biển (đông nam) vào phố cổ và hạ lưu sông Thu Bồn
  hoian: { lon: 108.348, lat: 15.842, h: 2600, heading: -40, pitch: -28 },
};
export function flyTo(viewer, key, duration = 2.5) {
  const v = VIEWS[key];
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(v.lon, v.lat, v.h),
    orientation: { heading: Cesium.Math.toRadians(v.heading), pitch: Cesium.Math.toRadians(v.pitch), roll: 0 },
    duration,
  });
}

// Góc nhìn mặc định: nhìn xiên toàn lưu vực từ phía đông nam (biển) lên thượng nguồn
const BASIN_CENTER = Cesium.Cartesian3.fromDegrees(107.72, 15.47, 0);
export function flyHome(viewer, duration = 2) {
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(BASIN_CENTER, 70000), {
    offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(-25), Cesium.Math.toRadians(-42), 195000),
    duration,
  });
}

// Chuyển đổi góc nhìn với bản đồ Leaflet 2D (tham số URL ?lat=&lon=&zoom=).
// Bề rộng khung nhìn ~ 156543 m/px × cos(vĩ độ) / 2^zoom × ~900 px.
const LEAFLET_K = 156543 * 900;
export function flyToPoint(viewer, lon, lat, zoom = 12, duration = 0) {
  const range = (LEAFLET_K * Math.cos(Cesium.Math.toRadians(lat))) / 2 ** zoom;
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat, 0), 1), {
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), range),
    duration,
  });
}

/** Điểm ở giữa màn hình và mức zoom Leaflet tương đương – để quay về bản đồ 2D đúng chỗ. */
export function currentView(viewer) {
  const scene = viewer.scene;
  const center = new Cesium.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
  const ray = viewer.camera.getPickRay(center);
  const hit = (ray && scene.globe.pick(ray, scene)) || viewer.camera.pickEllipsoid(center);
  if (!hit) return null;
  const c = Cesium.Cartographic.fromCartesian(hit);
  const lat = Cesium.Math.toDegrees(c.latitude), lon = Cesium.Math.toDegrees(c.longitude);
  const range = Cesium.Cartesian3.distance(viewer.camera.positionWC, hit);
  const zoom = Math.min(18, Math.max(5, Math.round(Math.log2((LEAFLET_K * Math.cos(c.latitude)) / range))));
  return { lat: +lat.toFixed(5), lon: +lon.toFixed(5), zoom };
}
