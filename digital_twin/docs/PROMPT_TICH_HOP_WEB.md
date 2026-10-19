# PROMPT: Tích hợp Bản đồ số 3D (digital_twin) vào web hiện tại – Hệ thống DSS lưu vực Vu Gia – Thu Bồn

> Dán toàn bộ nội dung dưới đây cho trợ lý lập trình (Claude Code hoặc tương đương) đang mở repo
> `BackEnd_NCKH`. Prompt chia 4 giai đoạn; mỗi giai đoạn phải chạy được, kiểm thử xong mới sang giai đoạn sau.

---

## 0. Vai trò và nguyên tắc làm việc

Bạn là kỹ sư frontend/GIS làm việc trên repo `BackEnd_NCKH` (monorepo: `src/` backend Node.js/Express +
MongoDB, `web/` React + Vite + Tailwind + Leaflet, `digital_twin/` ứng dụng bản đồ 3D CesiumJS độc lập,
`mobile/` Expo – **không đụng tới**, các thư mục `*_Py_Backend` – **không đụng tới**).

Nguyên tắc bắt buộc:
1. **Không làm mất hay đổi hành vi bất kỳ chức năng hiện có nào của `web/`** (danh sách ở mục 2). Mọi thay
   đổi trên trang cũ phải là bổ sung; nếu buộc phải sửa, ghi rõ lý do trong mô tả commit.
2. **Dùng chung hệ thiết kế của `web/`** (Tailwind + các lớp tiện ích trong `web/src/index.css`). Không
   mang bộ CSS tối riêng của `digital_twin/app/src/App.css` sang; viết lại giao diện bằng lớp Tailwind theo
   mục 4.
3. Đọc code trước khi sửa. Không đoán tên endpoint, tên trường – tra trong `web/src/api/mapApi.js`,
   `src/api/routes/`, `src/core/entities/`.
4. Mỗi giai đoạn: chạy `npm run build` và `npm run lint` trong `web/` không lỗi; tự kiểm thử thủ công theo
   danh sách nghiệm thu; chỉ commit khi người dùng yêu cầu, làm trên nhánh mới (không commit thẳng `main`).
5. Không đưa khóa bí mật vào mã nguồn: token Cesium ion, khóa Google Maps… đặt trong `web/.env.local`
   (`VITE_CESIUM_ION_TOKEN`, `VITE_GOOGLE_MAPS_KEY`) và thêm vào `.env.example`.
6. Giao diện, chú thích, thông báo lỗi bằng tiếng Việt; mọi chuỗi hiển thị đi qua i18n (vi + en).

---

## 1. Hiện trạng cần nắm (đã khảo sát)

### `web/` (giữ nguyên)
- Vite 7, React 19, React Router 7, Tailwind 3 (`darkMode: "class"`), Bootstrap 5 (một số trang), Leaflet +
  react-leaflet, Recharts, i18next (vi/en, khóa: `navbar, sidebar, adminNavbar, adminDashboard, lakeModal,
  operation, history, map, reportType, mapPanel, submitReport, adminLogin`), react-icons, lucide-react.
- Định tuyến (`web/src/App.jsx`):
  - `/` → `page/Home/HomePage.jsx` (bản đồ Leaflet toàn màn hình dưới `NavbarPublic`)
  - `/reports` → `page/Home/Reports.jsx`
  - `/admin/login`, `/admin/register`
  - `/admin/*` (bảo vệ bằng `RequireAdmin`, token `adminToken` trong localStorage) → `AdminLayout` với
    `dashboard, pending, approved, rejected, users, admins`
- API: `web/src/api/axiosClient.js` (`VITE_API_URL`, mặc định `http://localhost:5001/api`), `mapApi.js` gồm
  `getRainStations, getWaterLevelStations, getReservoirs, getLiveHydro, getPublicPosts, getForecastLstm/Rf/Xgb,
  getInflowHistory, getForecastHistory, getRainLakeHistory, runForecastModel, getReservoirAlerts…,
  getLakeSpecs, getZVCurve, getVolume, getPower, waterBalance, operationRec`.
- HomePage: lớp trạm mưa, trạm thủy văn, hồ chứa, bài đăng cộng đồng; ranh giới Việt Nam
  (`utils/vietnamBoundary.json`); 4 bản đồ nền (`mapPanel.tile*`); các panel tin tức, nền bản đồ, cộng đồng,
  cảnh báo; nút cài đặt, định vị; `LakeModal` (chi tiết hồ, dùng `OperationDashboard`,
  `FloodHistoryTraining`); `SubmitFloodReportModal` (người dân gửi phản ánh ngập).
- Thiết kế: nền sáng `#f8fafc`; header `bg-header` (gradient `#1d4ed8 → #2563eb → #0ea5e9`); sidebar admin
  `bg-sidebar`; lớp tiện ích `.glass` (nền trắng 85% + blur 12px), `.card-hover`, `.gradient-text`; nút bo
  `rounded-xl`, đổ bóng `shadow-lg shadow-slate-900/10`; animation `fade-in`, `slide-in-left`, `pulse-soft`;
  thanh cuộn mảnh tùy biến.
- `main.jsx` bật `<StrictMode>` → effect chạy 2 lần ở chế độ dev (lưu ý khi khởi tạo Cesium).

### `digital_twin/` (nguồn để tích hợp)
- `app/`: Vite + React + CesiumJS 1.140 (chép tài nguyên tĩnh Cesium bằng `vite-plugin-static-copy`, biến
  `CESIUM_BASE_URL`), cổng 5180.
  - `src/map/viewer.js`: tạo Viewer, địa hình (Cesium World Terrain nếu có token, không thì Esri World
    Elevation 3D), ảnh nền (Esri World Imagery / OSM), `flyHome`, `flyTo('hoian')`, `setNight`, `renderBurst`
    (bắt buộc giữ: scene chạy `requestRenderMode`).
  - `src/map/layers.js`: nạp lớp GeoJSON theo `public/data/layers.json`, kiểu hiển thị
    `basin, byBranch, streams, osmRivers, lakes, reservoirs`, `setOpacity`, `find(code)`.
  - `src/hoian/hoian.js`: 54.779 nhà 3D (một `Primitive`, màu theo từng nhà), đường
    (`GroundPolylinePrimitive`), lớp ngập (ảnh độ sâu phủ địa hình), `setLevel`, `setNight`, `propsOf`.
  - `src/components/`: `LayerPanel`, `InfoPanel` (thẻ Thông tin / Hiện trạng / Dự báo), `FloodPanel`
    (thanh mực nước, diễn biến lũ, 4 KPI, 2 đường cong).
  - `public/data/`: `layers.json`, `basin/catchments/streams/osm_rivers/lakes/reservoirs.geojson`,
    `hoian/buildings.json, flood_grid.json, roads.geojson` (~8 MB).
- `scripts/01…07`: pipeline Python/Node sinh dữ liệu trên. `README.md` mô tả phương pháp và giới hạn.
- Khóa nối dữ liệu: hồ chứa `lake_id` = `Id_Lake` trong MongoDB = khóa trong `mapApi.getReservoirs()`.

---

## 2. Danh sách chức năng PHẢI giữ (kiểm thử hồi quy sau mỗi giai đoạn)

| # | Chức năng | Cách kiểm |
|---|---|---|
| 1 | Bản đồ Leaflet `/` hiển thị trạm mưa, trạm thủy văn, hồ, bài đăng; bật/tắt từng lớp | Mở `/`, bật/tắt từng lớp |
| 2 | 4 bản đồ nền + ranh giới Việt Nam | Đổi từng nền |
| 3 | Panel tin tức, cộng đồng, cảnh báo (cảnh báo lưu lượng đến/xả, mưa lớn) | Mở từng panel |
| 4 | `LakeModal`: dự báo LSTM/RF/XGB, lịch sử, OperationDashboard, FloodHistoryTraining | Bấm 1 hồ |
| 5 | Gửi phản ánh ngập (`SubmitFloodReportModal`) | Gửi thử 1 phản ánh |
| 6 | `/reports` | Mở trang |
| 7 | Đăng nhập/đăng ký admin, các trang `/admin/*`, phân quyền | Đăng nhập, duyệt bài |
| 8 | Đổi ngôn ngữ vi/en, giao diện trên điện thoại | Đổi ngôn ngữ, thu cửa sổ 375 px |

---

## 3. GIAI ĐOẠN 1 – Đưa bản đồ 3D vào web (cùng giao diện, chưa đổi dữ liệu)

### 3.1. Cấu trúc đích
```
web/src/features/digitalTwin/
├── DigitalTwinPage.jsx        # trang /ban-do-so (NavbarPublic + bản đồ 3D toàn màn hình)
├── CesiumMap.jsx              # khởi tạo/hủy Viewer an toàn với StrictMode
├── map/viewer.js              # chuyển từ digital_twin/app/src/map/viewer.js
├── map/layers.js              # chuyển từ digital_twin/app/src/map/layers.js
├── hoian/hoian.js             # chuyển từ digital_twin/app/src/hoian/hoian.js
├── components/LayerPanel.jsx  # viết lại giao diện theo mục 4
├── components/InfoPanel.jsx
├── components/FloodPanel.jsx
├── data/fields.js
└── useDigitalTwin.js          # (tùy chọn) gom state lớp, chọn đối tượng, kịch bản ngập
web/public/data/dt/            # chép digital_twin/app/public/data/* (đổi url trong layers.json cho khớp)
```
`digital_twin/app/` vẫn giữ để chạy độc lập/thử nghiệm; `digital_twin/scripts/` ghi dữ liệu ra
`web/public/data/dt/` (thêm biến cấu hình đường dẫn đầu ra trong `scripts/config.py`).

### 3.2. Việc cần làm
1. `web/`: `npm install cesium` và `npm install -D vite-plugin-static-copy`; sửa `web/vite.config.js` chép
   `node_modules/cesium/Build/Cesium/{ThirdParty,Workers,Assets,Widgets}` vào `cesiumStatic`, `define`
   `CESIUM_BASE_URL: JSON.stringify('/cesiumStatic')` (đường dẫn tuyệt đối vì web dùng BrowserRouter có
   route lồng nhau). Kiểm tra `vercel.json` rewrite không chặn `/cesiumStatic/*` và `/data/*`.
2. **Tải lười**: `const DigitalTwinPage = lazy(() => import('./features/digitalTwin/DigitalTwinPage'))` +
   `<Suspense>`; CesiumJS (~4 MB) không được làm chậm trang `/`. Import `cesium/Build/Cesium/Widgets/widgets.css`
   bên trong trang 3D, không đưa vào `index.css`.
3. Thêm route `/ban-do-so` (alias `/digital-twin`) trong `App.jsx`, đặt trong `ErrorBoundary` hiện có.
4. `NavbarPublic`: thêm mục "Bản đồ số 3D" (i18n `navbar.digitalTwin`). Trên HomePage thêm nút nổi
   "Xem 3D" cạnh nhóm nút cài đặt/định vị, giữ camera tương ứng: chuyển tâm bản đồ Leaflet hiện tại sang
   tham số URL `/ban-do-so?lat=&lon=&zoom=` để 3D bay tới đúng chỗ, và ngược lại nút "Về bản đồ 2D".
5. `CesiumMap.jsx`: tạo Viewer trong `useEffect`, có cờ `destroyed` và `viewer.destroy()` khi unmount (tránh
   2 Viewer do StrictMode); gắn `window.vgtbViewer` chỉ khi `import.meta.env.DEV`.
6. Chuyển các module `map/*`, `hoian/*` gần như nguyên vẹn; chỉ đổi đường dẫn dữ liệu sang `/data/dt/...`.
7. i18n: chuyển toàn bộ chuỗi tiếng Việt trong LayerPanel/InfoPanel/FloodPanel/fields.js sang khóa
   `digitalTwin.*` trong `vi.json` và `en.json` (tên lớp trong `layers.json` dùng `nameKey`).
8. Ẩn credit Cesium gọn ở góc dưới (giữ ghi nguồn bắt buộc: Esri, OSM, Copernicus).

### 3.3. Nghiệm thu giai đoạn 1
- `/ban-do-so` hiển thị đủ như `digital_twin/app` hiện nay: 16 hồ, lưu vực, sông, mặt hồ, khu Hội An (nhà 3D,
  đường, kịch bản ngập, ngày/đêm), bấm đối tượng xem thông tin.
- Trang `/` tải nhanh như trước (so kích thước bundle chính trước/sau – Cesium phải nằm ở chunk riêng).
- Toàn bộ bảng mục 2 vẫn đạt. Mở/đóng `/ban-do-so` 5 lần liên tiếp không rò WebGL context (không có cảnh
  báo "Too many active WebGL contexts").

---

## 4. Quy tắc thiết kế chung (áp dụng cho mọi panel của bản đồ 3D)

- Panel nổi: `glass rounded-2xl shadow-lg shadow-slate-900/10 border border-white/60` (chế độ sáng);
  `dark:bg-slate-900/85 dark:border-slate-700 dark:text-slate-100` (chế độ tối theo `ThemeContext`).
- Tiêu đề panel: chữ `text-slate-800 font-semibold`, phụ đề `text-xs text-slate-500`; tiêu đề nhấn dùng
  `gradient-text`.
- Nút chính: `bg-header text-white rounded-xl px-3 py-2 shadow hover:-translate-y-0.5 transition`; nút phụ:
  `bg-white text-blue-700 border border-blue-100 rounded-xl hover:bg-blue-50`; nút đang bật dùng màu
  `bg-blue-600 text-white`; nút cảnh báo dùng tông cam như nút cảnh báo trên HomePage.
- Ô KPI: `rounded-xl bg-white/70 border border-slate-200 p-3`, số `text-2xl font-bold text-blue-700`.
- Thanh trượt, checkbox: `accent-blue-600`.
- Bảng màu dữ liệu giữ nguyên ý nghĩa (nhánh sông, độ sâu ngập 5 bậc) để không làm sai chú giải.
- Bố cục: bảng lớp bên trái (`slide-in-left`), bảng thông tin/kịch bản bên phải (`fade-in`), thanh công cụ
  dưới `NavbarPublic`; trên màn hình < 768 px các panel thành ngăn kéo dưới đáy (dùng `useIsMobile`).
- Font, thanh cuộn, icon (react-icons/lucide-react) dùng như phần còn lại của web.

---

## 5. GIAI ĐOẠN 2 – Nối dữ liệu thật từ backend (bản sao số cấp độ 2)

1. Backend (`src/`): thêm nhóm route `/api/dt`:
   - `GET /api/dt/layers` → trả `layers.json` (sau này lấy từ CSDL);
   - `GET /api/dt/layers/:id/geojson?bbox=&zoom=` → GeoJSON (giai đoạn đầu đọc file tĩnh; khi có PostGIS thì
     truy vấn `ST_AsGeoJSON` + đơn giản hóa theo zoom);
   - `GET /api/dt/features/:code` → thuộc tính tĩnh + số liệu mới nhất + dự báo (ghép từ service sẵn có:
     inflowLake, waterLevel, rainStation, forecastLstm…).
   Viết controller/route theo đúng mẫu hiện có trong `src/api/`.
2. Lớp động trong 3D, dùng lại `mapApi` hiện có (không viết API trùng):
   - Hồ chứa: màu theo % mực nước so với MNDBT (`getReservoirs` + `getLakeSpecs`), cột 3D cao theo Q đến.
   - Trạm mưa, trạm thủy văn (`getRainStations`, `getWaterLevelStations`): cột 3D theo lượng mưa/mực nước,
     màu theo cấp báo động.
   - Bài đăng phản ánh ngập (`getPublicPosts`): điểm nhấp nháy, bấm xem ảnh.
   - Cảnh báo (`getReservoirAlerts`): danh sách cảnh báo giống panel cảnh báo HomePage, bấm → bay tới.
3. InfoPanel thẻ "Hiện trạng" và "Dự báo": dùng lại component biểu đồ của `LakeModal`
   (tách phần biểu đồ thành component dùng chung nếu cần, **không sửa hành vi LakeModal**). Nút "Mở chi tiết
   hồ" mở chính `LakeModal` hiện có.
4. Tự cập nhật mỗi 5 phút (hoặc WebSocket nếu backend có), ghi rõ "Số liệu lúc hh:mm" trên mỗi đối tượng;
   số liệu quá 2 chu kỳ không cập nhật → biểu tượng xám.
5. Thanh trượt thời gian +0 → +12 giờ: màu/chiều cao hồ theo p50 dự báo, InfoPanel vẽ dải p10–p90.
6. Lớp "Điểm ngập lịch sử Đà Nẵng" từ bảng thống kê điểm ngập 2022–2025 (sau khi đã làm sạch + gán tọa độ):
   điểm tô theo số đợt ngập, bấm xem lịch sử mức ngập và lượng mưa trạm gần nhất.

Nghiệm thu: số liệu trên 3D khớp với Leaflet và `LakeModal` cùng thời điểm; mất mạng/API lỗi thì bản đồ vẫn
chạy, hiện thông báo thân thiện; bảng mục 2 vẫn đạt.

---

## 6. GIAI ĐOẠN 3 – Mô hình 3D chân thực (công trình, cây, cầu, đường, xe)

Làm theo thứ tự, mỗi bước độc lập, bật/tắt được như một lớp:

| Thành phần | Công cụ | Đầu ra | Ghi chú |
|---|---|---|---|
| Lưới ảnh thực toàn cảnh (nhà, cây, cầu thật) | **Google Photorealistic 3D Tiles** qua Map Tiles API hoặc Cesium ion | `Cesium3DTileset` | Kiểm tra trước độ phủ tại Đà Nẵng/Hội An và chi phí; cần khóa API, ghi nguồn Google |
| Khu tự bay chụp (Hội An, đập lớn) | Drone + **RealityScan/RealityCapture**, **Agisoft Metashape**, **Pix4D** hoặc **OpenDroneMap** (miễn phí) | Mesh có màu thật → 3D Tiles (Cesium ion hoặc 3d-tiles-tools) | Chính xác và tự chủ dữ liệu nhất |
| Nhà có mặt tiền, mái | **Blender + Blosm (blender-osm)** hoặc **BlenderGIS**; **Esri CityEngine** (có phí) để sinh hàng loạt | glTF → 3D Tiles (`pg2b3dm`, `3d-tiles-tools`) | Thay khối LOD1 hiện tại theo từng khu |
| Công trình điểm nhấn (Chùa Cầu, chợ Hội An, cầu Rồng, đập Sông Tranh 2…) | **Blender** (dựng tay từ ảnh/bản vẽ), **SketchUp**; nhận BIM **IFC** nếu có | glTF (nén Draco/Meshopt bằng **gltf-transform**) | Mỗi mô hình gắn `code` để bấm xem thông tin |
| Cây | Vị trí từ OSM (`natural=tree`, `landuse=forest`) hoặc nhận dạng từ ảnh; mô hình cây glTF (Blender Sapling, Sketchfab giấy phép CC) | 3D Tiles instanced (`i3dm` / `EXT_mesh_gpu_instancing`, công cụ **i3dm.export** của Geodan) | Vẽ hàng chục nghìn cây vẫn nhẹ |
| Đường thật (mặt đường, vạch kẻ, đèn) | Lưới OSM + Blender/Blosm hoặc vẽ mặt đường bằng polygon bám địa hình; đèn đường = glTF lặp | 3D Tiles / GroundPrimitive | Ban đêm: đèn phát sáng (bloom của Cesium) |
| Xe cộ | Mô hình xe glTF; quỹ đạo giả lập bằng **SUMO** (mô phỏng giao thông) từ mạng đường OSM, hoặc dữ liệu GPS/camera thật khi có | `SampledPositionProperty` + `Model` chạy theo đồng hồ Cesium | Ghi rõ "giả lập" nếu không phải dữ liệu thật |
| Mặt nước | Shader nước của Cesium (`Material.Water`) cho sông, biển, vùng ngập | Primitive | Mặt nước ngập dâng theo thanh mực nước |

Hướng thay thế cho mức chân thực như game (giống ảnh tham khảo VNTT): **Unreal Engine 5 + Cesium for
Unreal + Pixel Streaming** (phát hình về trình duyệt) – chỉ làm khi có máy chủ GPU và người làm Unreal;
dùng chung dữ liệu 3D Tiles ở trên nên không phải làm lại.

Hiệu năng bắt buộc: mọi dữ liệu lớn ở dạng 3D Tiles có LOD; nén glTF (Draco/Meshopt, ảnh KTX2); cho
phép tắt lớp nặng; trên điện thoại mặc định tắt lớp chân thực.

---

## 7. GIAI ĐOẠN 4 – Hoàn thiện thành bản sao số

1. **Dữ liệu nền chuẩn**: PostgreSQL + PostGIS trên VPS (lược đồ `layer`, `feature` (mã định danh duy nhất),
   `relation`); script `digital_twin/scripts` nạp vào CSDL thay vì ghi file.
2. **Quản trị trong trang admin**: trang "Bản đồ số" trong `AdminLayout` để bật/tắt lớp công khai, tải lên
   GeoJSON/glTF/kết quả HEC-RAS, sửa thuộc tính đối tượng, sửa tọa độ đập (hiện có 3 hồ nghi sai tọa độ –
   xem `digital_twin/data/kiem_tra_tuyen_dap.csv`).
3. **Mô phỏng ngập thật**: nhận kết quả HEC-RAS 2D (độ sâu theo thời gian) thay `flood_grid.json`; thanh
   thời gian chạy theo giờ; so sánh nhiều kịch bản cạnh nhau; xuất báo cáo PDF số nhà/đường/dân bị ảnh hưởng.
4. **Cảnh báo theo khu vực**: giao vùng ngập dự báo với ranh giới xã/phường, gửi cảnh báo qua kênh đang có
   (Expo push của mobile).
5. **4D/lịch sử**: phát lại một trận lũ đã qua (mưa, mực nước hồ, xả, điểm ngập) theo dòng thời gian.
6. **An toàn**: phân quyền xem/chỉnh lớp, ẩn thông tin cá nhân trong phản ánh, nhật ký truy cập, khóa API
   giới hạn theo tên miền.
7. **Triển khai**: tile 3D phục vụ tĩnh qua nginx (gzip, cache dài hạn) hoặc lưu trữ đối tượng; CDN nếu
   cần; giám sát dung lượng.
8. **Kiểm thử**: test tự động cho API `/api/dt` và cho hàm thuần (tô màu, thống kê ngập); kiểm thử hiệu
   năng (FPS, thời gian tải) trên máy văn phòng phổ thông.
9. **Tài liệu**: hướng dẫn sử dụng cho cán bộ, quy chế cập nhật dữ liệu, tự đánh giá cấp độ trưởng thành
   theo Hướng dẫn kỹ thuật UDT của Bộ KH&CN.

---

## 8. Không được làm

- Không xóa/thay Leaflet trên trang `/`; bản đồ 3D là trang bổ sung.
- Không sửa `mobile/`, các dịch vụ Python, job cron backend ngoài phần thêm route `/api/dt`.
- Không đưa dữ liệu thô lớn (`digital_twin/data/raw`, `work`) hay khóa API lên Git.
- Không trình bày mô hình ngập "dâng nước có kết nối" như kết quả thủy lực; giữ dòng ghi chú giới hạn
  trong FloodPanel cho tới khi có HEC-RAS.
- Không dùng mô hình 3D có giấy phép không cho phép sử dụng công khai; ghi nguồn mọi dữ liệu bên thứ ba.

## 9. Kết quả bàn giao mỗi giai đoạn

- Danh sách file đã thêm/sửa và lý do.
- Ảnh chụp màn hình: trang `/` (để chứng minh không đổi), `/ban-do-so` toàn lưu vực, khu Hội An ngày/đêm,
  kịch bản ngập, trên điện thoại.
- Kết quả `npm run build`, `npm run lint`, kích thước chunk chính và chunk Cesium.
- Bảng mục 2 với kết quả đạt/không đạt từng dòng.
