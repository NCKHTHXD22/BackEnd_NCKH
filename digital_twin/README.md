# Bản đồ số 3D lưu vực Vu Gia – Thu Bồn

> **Đã tích hợp vào web** tại trang `/ban-do-so` (mã ở `web/src/features/digitalTwin/`). Thư mục `app/`
> ở đây giữ lại để thử nghiệm độc lập; cả hai đọc chung dữ liệu ở `web/public/data/dt/`.

Ứng dụng web bản đồ 3D (CesiumJS) – giai đoạn 1 của bản sao số lưu vực theo
*Hướng dẫn kỹ thuật UDT* (Bộ KH&CN) và tài liệu `Documents/Huong_Dan_Thuc_Hien_Ban_Do_So_3D_VuGiaThuBon.docx`.
Việc tích hợp với backend/web hiện có làm ở giai đoạn sau (xem mục cuối).

## Cấu trúc

```
digital_twin/
├── app/                      # ứng dụng web (Vite + React + CesiumJS)
│   │                         # dữ liệu đọc từ web/public/data/dt/ (publicDir trong vite.config.js)
│   └── src/
│       ├── map/viewer.js     # khởi tạo Cesium: địa hình, ảnh nền, góc nhìn
│       ├── map/layers.js     # nạp lớp + kiểu hiển thị từng lớp
│       ├── data/fields.js    # nhãn tiếng Việt cho thuộc tính hiển thị khi bấm
│       └── components/       # LayerPanel (bật/tắt, độ trong suốt), InfoPanel (thông tin)
├── scripts/                  # xử lý dữ liệu, chạy theo thứ tự 01 → 05
├── data/
│   ├── raw/                  # dữ liệu gốc tải về (không đưa lên Git)
│   ├── work/                 # dữ liệu trung gian (không đưa lên Git)
│   └── kiem_tra_tuyen_dap.csv  # bảng kiểm tra vị trí 16 đập – cần xem lại
└── .venv/                    # môi trường Python (không đưa lên Git)
```

## Chạy ứng dụng

```bash
cd digital_twin/app
npm install          # lần đầu
npm run dev          # mở http://localhost:5180
npm run build        # bản build tĩnh ở app/dist/ (đưa lên nginx được ngay)
```

Có sẵn: địa hình 3D, ảnh vệ tinh / bản đồ OSM, phóng đại địa hình, 6 lớp dữ liệu bật/tắt và chỉnh độ
trong suốt, bấm vào đối tượng để xem thông tin, liên kết hồ ↔ lưu vực bộ phận.

## Chạy lại xử lý dữ liệu

```bash
python -m venv digital_twin/.venv
digital_twin/.venv/Scripts/pip install -r digital_twin/scripts/requirements.txt
digital_twin/.venv/Scripts/python digital_twin/scripts/01_download_dem.py      # DEM Copernicus 30 m (~200 MB)
digital_twin/.venv/Scripts/python digital_twin/scripts/02_download_osm.py      # sông, mặt nước từ OSM
node digital_twin/scripts/03_build_reservoirs.mjs                               # 16 hồ từ dữ liệu backend
digital_twin/.venv/Scripts/python digital_twin/scripts/04_hydrology.py         # lưu vực, mạng sông (~10 phút)
digital_twin/.venv/Scripts/python digital_twin/scripts/05_osm_layers.py        # sông có tên, mặt hồ
digital_twin/.venv/Scripts/python digital_twin/scripts/06_hoian_download.py    # Hội An: nhà, đường, mặt nước (OSM)
digital_twin/.venv/Scripts/python digital_twin/scripts/07_hoian.py             # Hội An: nhà 3D, đường, lưới ngập
digital_twin/.venv/Scripts/python digital_twin/scripts/08_dams.py              # đập 3D: tuyến đập, lòng hồ
digital_twin/.venv/Scripts/python digital_twin/scripts/09_data_inventory.py    # kiểm kê dữ liệu 16 hồ, chọn trận lũ thử
digital_twin/.venv/Scripts/python digital_twin/scripts/10_network.py          # mạng kết nối lưu vực – sông – hồ
digital_twin/.venv/Scripts/python digital_twin/scripts/11_event_series.py     # chuỗi giờ 16 hồ trong các trận thử
node digital_twin/scripts/12_reservoir_check.mjs                               # kiểm chứng cân bằng nước hồ (4.1)
digital_twin/.venv/Scripts/python digital_twin/scripts/13_routing.py          # diễn toán Muskingum-Cunge (5.1)
digital_twin/.venv/Scripts/python digital_twin/scripts/14_hand.py             # ngập HAND theo giờ (6.1) → lớp web
digital_twin/.venv/Scripts/python digital_twin/scripts/15_zv_estimate.py      # ước tính lại bảng Z-V từ số liệu vận hành
node digital_twin/scripts/12_reservoir_check.mjs --zv=estimated              # kiểm chứng với bảng Z-V ước tính
node src/script/syncAutoStations.js 2025-10-24 2025-11-02                     # lấy lại độ sâu ngập tháp VRain (ghi CSDL)
node digital_twin/scripts/16_tower_export.mjs                                  # xuất độ sâu tháp theo trận (chỉ đọc CSDL)
digital_twin/.venv/Scripts/python digital_twin/scripts/16_tower_check.py      # kiểm định ngập HAND bằng tháp (6.3)
digital_twin/.venv/Scripts/python digital_twin/scripts/17_station_levels.py   # chuẩn hóa mực nước trạm KTTV (Documents/Data_MucNuoc)
digital_twin/.venv/Scripts/python digital_twin/scripts/18_tide_sontra.py      # hằng số điều hòa triều Sơn Trà (5.3)
digital_twin/.venv/Scripts/python digital_twin/scripts/19_hand_stage.py       # ngập theo mực nước trạm đo + hiệu chỉnh lệch mặt chuẩn (6.1, 6.3)
digital_twin/.venv/Scripts/python digital_twin/scripts/16_tower_check.py --model=stage   # kiểm định bản đồ theo mực nước trạm
digital_twin/.venv/Scripts/python digital_twin/scripts/20_routing_check.py    # kiểm chứng diễn toán bằng mực nước trạm (5.1)
node digital_twin/scripts/21_qd1865_replay.mjs                                 # chạy lại QĐ 1865 trên trận lũ thử (4.3)
digital_twin/.venv/Scripts/python digital_twin/scripts/22_flood_scenarios.py  # kịch bản lũ lịch sử / cấp báo động + tần suất
node src/script/importStationLevels.js 2025-01-01 2025-12-31 [--dry-run]       # nạp mực nước giờ vào CSDL (ghi production)

digital_twin/.venv/Scripts/python digital_twin/scripts/23_sim_package.py     # gói dữ liệu "Mô phỏng diễn biến lũ" cho bản đồ 3D

Thứ tự khi có số liệu mới: 17 → 09 → 11 → 12 → 13 → 14 → 16_tower_export → 16 → 18 → 19 → 16 --model=stage → 20 → 21 → 22 → 23.
```

Bước 4 cần WhiteboxTools: lần đầu thư viện `whitebox` tự tải về; nếu mạng chặn, tải
`WhiteboxTools_win_amd64.zip` rồi giải nén thư mục `WBT` vào `.venv/Lib/site-packages/whitebox/`.

| Script | Làm gì | Ghi chú phương pháp |
| --- | --- | --- |
| 01 | Tải 6 ô DEM GLO-30 (N14–16, E107–108) | Cao độ theo geoid EGM2008 |
| 02 | Tải sông (`waterway=river`) và mặt nước (`natural=water`, `landuse/water=reservoir`) qua Overpass | © OpenStreetMap, ODbL |
| 03 | Ghép tọa độ (`src/api/config/reservoirs.js`), tên/địa chỉ (`seedRainLake.js`), thông số (`seedLakeSpecs.js`) | Không chép tay – đổi dữ liệu backend rồi chạy lại |
| 04 | Ghép DEM → UTM 49N 30 m → biển (cao độ 0) thành không dữ liệu → BreachDepressions + FillDepressions → D8 → tích lũy dòng chảy → sông (ngưỡng 10 km²) → Strahler → lưu vực | Tuyến đập: cửa ra mặt hồ OSM gần nhất (≤ 1,5 km), nếu không có thì ô tích lũy lớn nhất trong 150 m |
| 05 | Gộp sông OSM theo tên, cắt mặt nước theo lưu vực | Bỏ mặt nước < 0,05 km² |
| 09 | Độ phủ số liệu thật (sau QC) của 16 hồ theo tháng; đỉnh lũ mùa 9–12; chọn trận cho chuỗi thí điểm Sông Tranh 2 + Đắk Mi 4 | Ra `Documents/QC_Kiem_Ke_Du_Lieu.xlsx`, `data/compute/events.json` |
| 11–12 | Chuỗi giờ trận thử; chạy lõi cân bằng nước backend (`src/services/reservoirSim.js`) với Q đến/Q xả đo, so mực nước | Phát hiện bảng Z-V tự mâu thuẫn ở 3/4 hồ |
| 13 | Muskingum-Cunge trên mạng bước 10; tham số từ DEM + Manning; khu giữa theo mô-đun dòng chảy hồ đầu nguồn | Kiểm chứng tại hồ hạ lưu; đồng bằng chưa diễn toán |
| 14 | HAND + đường quan hệ tổng hợp, mặt nước đồng bằng làm trơn; phân lưu chia theo tỷ lệ giả định | Ra `web/public/data/dt/flood_hand/` (lớp “Ngập theo trận lũ”) |
| 15 | Suy ngược dV/dH từ Q đến/Q xả/mực nước theo giờ (loại 2 trận thử), gom theo khoảng 1 m, tích phân thành Z-V | Đã ghi vào `src/script/seedLakeSpecs.js`; thay bằng bảng chính thức khi có |
| 10 | Mạng kết nối: thượng nguồn dò D8 từ đập/trạm tới đầu đồng bằng; đồng bằng nối 12 sông có tên trên OSM (giữ phân lưu); khai báo chuyển nước Đắk Mi 4 | Ra `data/compute/network.json/.geojson`; cảnh báo trong `warnings` |

### Kết quả hiện tại

- Lưu vực: **10.070 km²** (tính từ DEM; con số thường công bố khoảng 10.350 km² – lệch ~3%,
  chủ yếu ở vùng đồng bằng hạ lưu nơi DEM 30 m kém chính xác).
- Mạng sông từ DEM: 567 đoạn, 2.688 km, cấp Strahler tối đa 5. Sông có tên (OSM): 34 sông.
- Mặt nước: 97 vùng, 27,9 km².
- Lưu vực đến tuyến đập (tọa độ đập theo OSM): A Vương 683 km², Sông Tranh 2 → 3 → 4 = 1.106 → 1.448 → 1.609 km²,
  Đắk Mi 3 → 4 = 613 → 1.122 km², Sông Bung 4 → 4A → 5 → 6 = 1.490 → 2.295 → 2.392 → 2.412 km²
  (đầy đủ trong `data/kiem_tra_tuyen_dap.csv`).

## Khu thí điểm Hội An

Bấm **"Khu Hội An · Kịch bản ngập"** trên thanh trên cùng: bản đồ bay tới Hội An, nạp nhà 3D và đường,
mở bảng mô phỏng ngập. Lần đầu dựng 54.779 nhà mất khoảng 1–2 phút tùy máy.

| Thành phần | Dữ liệu và cách làm |
| --- | --- |
| Nhà 3D | 54.779 footprint OSM (khung 15,855–15,91° B, 108,29–108,39° Đ). Chỉ 113 nhà có số tầng/chiều cao gốc; còn lại ước tính theo loại nhà và diện tích nền (± 1 m ngẫu nhiên cố định theo mã nhà cho tự nhiên). Màu tường vàng đất kiểu Hội An. Vẽ bằng 1 `Primitive` Cesium, đặt chân nhà theo địa hình đang hiển thị |
| Đường | 2.570 đoạn OSM (bỏ lối đi bộ), 1 `GroundPolylinePrimitive`; ban đêm đổi màu đèn đường |
| Ngập | Lưới 360×198 ô (~30 m). Mỗi ô có “mực nước bắt đầu ngập” tính bằng priority-flood từ biển + sông/kênh OSM. Kéo thanh mực nước → tô vùng ngập theo độ sâu, nhà và đường bị ngập đổi màu, thống kê diện tích / số nhà / km đường |
| Bấm vào nhà/đường | Loại, số tầng ước tính, chiều cao, cao độ nền, mực nước bắt đầu ngập, độ sâu ngập theo kịch bản hiện tại |

**Giới hạn cần nói rõ khi trình bày:** đây là mô hình “dâng nước có kết nối” để minh họa, không phải mô
hình thủy lực – chưa tính lưu lượng, thời gian truyền lũ, đê bao, cống; DEM Copernicus 30 m là mô hình bề
mặt (có mái nhà, cây) nên cao độ nền trong phố chỉ là xấp xỉ. Khi có kết quả HEC-RAS 2D, thay
`flood_grid.json` bằng độ sâu ngập theo thời gian của HEC-RAS là giữ nguyên được giao diện.

## Việc cần người thực hiện

1. ~~Kiểm tra tọa độ đập~~ – đã cập nhật 2026-10-19 theo OpenStreetMap (xem `web/src/utils/reservoirs.js`);
   `data/kiem_tra_tuyen_dap.csv` không còn hồ nào bị cảnh báo. Tọa độ trong cấu hình mô hình
   (`src/api/config/reservoirs.js`, config LSTM/XGBoost/RF) **giữ nguyên** vì là đầu vào mô hình đã huấn luyện.
2. **Đắk Mi 2 đang tạm ẩn trên bản đồ** (`HIDDEN_ON_MAP` trong script 03) vì chưa có thông số và số liệu đo.
   Khi bổ sung vào `src/script/seedLakeSpecs.js` + CSDL thì bỏ ẩn và chạy lại script 03 → 04.
3. **(Tùy chọn) Token Cesium ion** để dùng Cesium World Terrain: đăng ký miễn phí tại ion.cesium.com,
   chép `app/.env.example` thành `app/.env.local` và điền token. Không có token, ứng dụng dùng địa hình
   Esri World Elevation 3D (vẫn chạy tốt).
4. **Hội An:** mực nước báo động I/II/III và đỉnh lũ lịch sử tại trạm Hội An (để đặt mốc trên thanh mực
   nước), vết lũ đã điều tra (để kiểm định vùng ngập), mô hình Blender các công trình điểm nhấn
   (Chùa Cầu, chợ Hội An…) nếu muốn đẹp như ảnh tham khảo.
5. **Dữ liệu cần xin/thu thập** cho các lớp đang "chờ dữ liệu" trong bảng lớp:
   ranh giới xã/phường sau sáp nhập 2025 (Sở NN&MT), DEM LiDAR hạ lưu, kết quả HEC-RAS 2D, footprint nhà.

## Thêm một lớp mới

1. Đặt file GeoJSON (WGS84) vào `web/public/data/dt/`, mỗi đối tượng có thuộc tính `code` (mã định danh duy nhất) và `name`.
2. Thêm 1 mục vào `web/public/data/dt/layers.json` (`id`, `group`, `name` + `name_en`, `url` dạng `/data/dt/...`, `style`, `legend`).
3. Nếu cần kiểu hiển thị riêng: thêm hàm vào `STYLES` trong `web/src/features/digitalTwin/map/layers.js`;
   thuộc tính hiển thị: `web/src/features/digitalTwin/data/fields.js`, nhãn vi/en: khóa `digitalTwin.field.*`
   trong `web/src/i18n/locales/`.

## Tích hợp với hệ thống hiện có (giai đoạn sau)

- `layers.json` → `GET /api/dt/layers`; `url` của mỗi lớp → `GET /api/dt/layers/:id/geojson`.
- Thẻ *Hiện trạng* / *Dự báo* trong `InfoPanel.jsx` → API số liệu hồ, dự báo LSTM/XGBoost
  (khóa nối: `lake_id` = `Id_Lake` trong MongoDB).
- Lớp trạm mưa/trạm thủy văn lấy từ collection `RainStation`, `WaterLevelStation`.
- Có thể nhúng `app/` vào `web/` như một trang `/map3d`, hoặc giữ là ứng dụng riêng và liên kết qua menu.
