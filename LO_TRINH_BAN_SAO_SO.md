# Lộ trình bản sao số Vu Gia – Thu Bồn

File gốc để theo dõi tiến độ phát triển bản sao số: mưa → dòng chảy → hồ chứa → truyền lũ → ngập hạ du → tác động → hiển thị 3D.

- Tạo: 24/10/2026 · Cập nhật lần cuối: 25/10/2026
- Tài liệu đi kèm: [Documents/Lo_Trinh_Ban_Sao_So_DaNang_2027.xlsx](Documents/Lo_Trinh_Ban_Sao_So_DaNang_2027.xlsx) (bảng chi tiết, thông tin cần cung cấp, khái toán) · [Documents/De_Xuat_Ban_Sao_So_DaNang_2027.docx](Documents/De_Xuat_Ban_Sao_So_DaNang_2027.docx) (đề xuất gửi Sở KH&CN)

## Cách dùng file này

1. Mỗi hạng mục con có **trạng thái**, **người phụ trách**, **ngày** và danh sách việc dạng `- [ ]`. Làm xong việc nào thì đánh `- [x]`.
2. Đổi trạng thái theo quy ước bên dưới, rồi cập nhật bảng **Tổng quan tiến độ**.
3. Mỗi lần có thay đổi đáng kể, thêm một dòng vào **Nhật ký** ở cuối file (ngày, việc, kết quả, commit).
4. Một hạng mục chỉ được đánh ✅ khi đạt hết các điều kiện ở dòng **Hoàn thành khi**.

| Ký hiệu | Ý nghĩa |
|---|---|
| ⬜ | Chưa làm |
| 🟡 | Đang làm / đã có một phần |
| ⛔ | Đang chờ dữ liệu hoặc quyết định |
| ✅ | Hoàn thành (đạt điều kiện "Hoàn thành khi") |

---

## Tổng quan tiến độ

| HM | Tên | Giai đoạn | Trạng thái | Ghi chú |
|---|---|---|---|---|
| HM1 | Chuẩn hóa dữ liệu và quan trắc | 1. Nền tảng | 🟡 | Đã kiểm kê dữ liệu hồ, chốt trận lũ thử (1.1); đã có mạng kết nối (1.4, chờ xác nhận tọa độ trạm, nhà máy); chưa có lược đồ chuẩn |
| HM2 | Địa hình và công trình thủy lực | 1. Nền tảng | 🟡 | 2.4 xong (tách hiển thị/tính toán); chờ DTM, mặt cắt sông |
| HM3 | Mưa và mưa – dòng chảy | 2. Chuỗi tính toán | ⬜ | Đã có AI dự báo Q đến hồ (LSTM/RF/XGBoost) |
| HM4 | Hồ chứa và vận hành liên hồ | 2. Chuỗi tính toán | 🟡 | 4.1 xong; 4.2 thông số 16 hồ + Z-V 5 hồ theo QĐ 1865; 4.3 quy tắc QĐ 1865 đã mã hóa (thiếu mực nước 4 trạm) |
| HM5 | Truyền lũ trên mạng sông | 2. Chuỗi tính toán | 🟡 | 5.1 chạy được: NSE 0,86–0,98 tại hồ hạ lưu có khu giữa nhỏ; chưa kiểm chứng tại trạm sông |
| HM6 | Ngập hạ du | 2. Chuỗi tính toán | 🟡 | 6.1 mức cơ sở HAND theo giờ cho 2 trận (đồng bằng Vu Gia – Thu Bồn); chưa kiểm chứng |
| HM7 | Điều phối mô phỏng và kho kết quả | 3. Hệ thống | ⬜ | |
| HM8 | Tác động và cảnh báo | 3. Hệ thống | 🟡 | Có cảnh báo theo trạm, cảnh báo gần điểm ngập, push |
| HM9 | Hiển thị Cesium và cảnh quan | 4. Hiển thị | 🟡 | 9.1: lớp “Ngập theo trận lũ” + thanh thời gian trên /ban-do-so (local, chưa deploy) |
| HM10 | Kiểm định, vận hành, triển khai | Xuyên suốt | 🟡 | Có DISABLE_JOBS, workflow deploy |

### Các mốc

| Mốc | Nội dung | Điều kiện đạt | Trạng thái | Ngày |
|---|---|---|---|---|
| M0 | Nền dữ liệu | 1.1, 1.2, 1.4, 2.4 xong; đã gửi yêu cầu xin dữ liệu | ⬜ | |
| M1 | Chuỗi nhanh Thu Bồn | Trận lũ thử chạy hết 4.1 → 5.1 → 6.1 → 9.1, xem được trên bản đồ | ✅ mức cơ sở, chưa kiểm chứng tại trạm sông | 25/10/2026 |
| M2 | Chuỗi mô hình chính | 3.2, 5.2, 6.2 thay bản nhanh; kiểm định 6.3 có CSI và sai số | ⬜ | |
| M3 | Hệ thống vận hành | Run manager, API /api/dt, tác động và cảnh báo theo vị trí chạy thử | ⬜ | |
| M4 | Cảnh quan khu pilot | Phố cổ Hội An có nhà mái, đường, cây, đèn dạng 3D Tiles | ⬜ | |

**Chuỗi pilot:** hồ Sông Tranh 2 (cộng phần nước Đắk Mi 4 chuyển sang) → Nông Sơn → Giao Thủy → Câu Lâu → Hội An.
**Trận lũ thử (chốt theo 1.1):** đỉnh 29/10/2025 (hiệu chỉnh; Q đến đỉnh Sông Tranh 2 ≈ 4.995 m³/s, mưa 954 mm, 97% số liệu thật) và đỉnh 14/11/2023 (kiểm định; ≈ 3.188 m³/s, 95% số liệu thật). Trận 2020 nằm ngoài dữ liệu (bắt đầu 01/2022); trận 10/2022 Sông Tranh 2 chỉ có 50–60% số liệu thật. Dự phòng: 18/11/2025 (100%). Xem `digital_twin/data/compute/events.json`.

---

## Các bước tiến hành

Làm theo thứ tự đợt. Cột "Điều kiện bắt đầu" là các việc phải xong trước khi bắt đầu đợt đó.

| Đợt | Việc | Điều kiện bắt đầu | Kết quả cuối đợt |
|---|---|---|---|
| 0 | Chuẩn bị: CSDL staging (10.2); gửi văn bản xin dữ liệu (2.1, 2.2, 4.2, chuỗi KTTV); chốt trận lũ thử | — | Môi trường thử an toàn; yêu cầu dữ liệu đã gửi |
| 1 | 1.1 kiểm kê dữ liệu → 1.4 mạng kết nối → 2.4 tách dữ liệu → 1.2 lược đồ quan trắc | Đợt 0 | **M0** |
| 2 | 4.1 Qout(t) → 5.3 biên triều → 5.1 Muskingum-Cunge → 6.1 HAND → 9.1 lớp nước động | M0; có chuỗi Q/H theo giờ của trận thử | **M1** – chuỗi nhanh chạy được |
| 3 | 1.3 hệ cao độ; 3.1 trường mưa; 3.3 đánh giá AI vận hành thật; 4.2 đặc tính xả; 4.3 liên hồ | M1; có mốc cao độ trạm, quy trình vận hành | Đầu vào chuẩn cho mô hình chính |
| 4 | 2.1 DTM, 2.2 mặt cắt, 2.3 công trình → 3.2 mưa – dòng chảy → 5.2 thủy lực 1D → 6.2 thủy lực 2D → 6.3 kiểm định | Có DTM, mặt cắt (từ đợt 0) | **M2** |
| 5 | 7.1 → 7.2 → 7.3 → 7.4; 8.1 → 8.2 → 8.3; 6.4 hậu xử lý | M2 (có thể bắt đầu 7.1, 7.4 từ sau M1) | **M3** |
| 6 | 9.2 nhà mái → 9.3 đường, cây, đèn → 9.4 đập theo hồ sơ → 9.5 hiệu năng → 9.6 xe, người | Có thể làm song song từ đợt 2 | **M4** |
| Xuyên suốt | 10.1 kiểm thử CI, 10.3 tài liệu; 3.4 tổ hợp, 4.4 tối ưu (sau M2) | — | |

**Quy tắc chung khi làm:**
- Script xử lý dữ liệu đánh số tiếp trong `digital_twin/scripts/` (sau `08_dams.py`). Dữ liệu tính toán để trong `digital_twin/data/compute/`, dữ liệu hiển thị để trong `web/public/data/dt/`.
- Chạy backend local luôn với `DISABLE_JOBS=1`. `web/.env` đang trỏ production, nên chỉ thao tác đọc cho tới khi có staging.
- Không cộng gộp lưu lượng các hồ bậc thang; mọi tổng lưu lượng phải đi qua mạng kết nối 1.4.
- Kết quả nào là minh họa thì giao diện phải ghi "minh họa".

---

## HM1. Chuẩn hóa dữ liệu và quan trắc

**Mục đích:** có chuỗi số liệu tin cậy, đồng bộ thời gian, đơn vị và cao độ; mọi mô hình phía sau phụ thuộc phần này.
**Phương pháp:** kiểm kê, kiểm soát chất lượng (QC) tự động, chuẩn hóa về một lược đồ chung.
**Công nghệ:** MongoDB time-series, Python (pandas), Node service.
**Lưu ý:** kiểm tra các nguồn lịch sử đang có (`rainHistory`, `inflowLakeHistory`, `rainLakeHistory`, `waterLevel`) trước khi thêm collection mới.

### 1.1 Kiểm kê và đánh giá chất lượng dữ liệu — 🟡 (phần hồ chứa xong; chờ số liệu trạm sông)
- Phụ trách: Claude · Bắt đầu: 25/10/2026 · Xong:
- **Mục đích:** biết trạm, hồ, giai đoạn nào đủ dữ liệu để hiệu chỉnh và kiểm định.
- **Phương pháp:** thống kê độ phủ, độ trễ, tỷ lệ thiếu, giá trị bất thường; so chéo VNDMS, PCTT, số liệu hồ.
- **Công nghệ:** Python, Jupyter; báo cáo Excel/HTML.
- **Đã có:** `Documents/QC_Check_Excel_Backbone_16Ho.csv`, `Documents/Data_Sach_16Ho/`, mưa VNDMS 2022–2026.
- **Việc cần làm:**
  - [x] Lập danh mục chuỗi dữ liệu 16 hồ (Q đến, Q xả, mực nước, mưa; giờ; 01/2022–03/2026) → `digital_twin/scripts/09_data_inventory.py`
  - [x] Tính % số liệu thật theo hồ, theo tháng (Đắk Mi 4 66%, Sông Tranh 2 54% … Sông Côn 2 2% với Q đến)
  - [x] Bất thường: dùng cờ QC sẵn có (spike, đoạn nội suy tuyến tính, giá trị sai)
  - [x] Chọn trận lũ: hiệu chỉnh 29/10/2025, kiểm định 14/11/2023 → `digital_twin/data/compute/events.json`
  - [x] Xuất báo cáo `Documents/QC_Kiem_Ke_Du_Lieu.xlsx`
  - [ ] Kiểm kê số liệu trạm sông (Nông Sơn, Giao Thủy, Câu Lâu, Hội An, Ái Nghĩa, Thành Mỹ, Cẩm Lệ) – **hiện chưa có trong hệ thống, cần xin Đài KTTV**
  - [ ] Kiểm kê mưa theo trạm VNDMS (hiện mới dùng mưa trung bình lưu vực hồ)
- **Hoàn thành khi:** có báo cáo QC cho mọi chuỗi đang dùng và danh sách trận lũ đã chốt.

### 1.2 Lược đồ quan trắc chuẩn — 🟡 (bảng `waterlevelobservations` chạy với 3 nguồn: PCTT, muangap, VRain; còn thiếu số liệu giờ trạm KTTV)
- **Nguồn đang lấy tự động (25/10/2026):**
  - pctt.danang.gov.vn: 11 trạm KTTV, ngưỡng BĐ I–III (không có số liệu đo) – job `pcttHydro` phút 20
  - muangap.danang.gov.vn (API công khai): 8 trạm mực nước sông + 5 trạm hồ tự động (mã `MG…`), chỉ có giá trị hiện tại → job `autoStations` phút 25 tích lũy chuỗi; 5 trạm chưa từng có số liệu; ngưỡng BĐ = 0 (chưa khai báo)
  - mucnuoc.vrain.vn (tài khoản Sở): 79 tháp báo ngập/lũ (mã `FT…`, 56 tháp 1,5 m + 23 tháp 3 m), độ sâu ngập theo giờ, có lịch sử → job `autoStations`; `-999` = không có số liệu
  - Chạy tay / lấy lại: `node src/script/syncAutoStations.js [--dry-run] [--hide-empty] [từ ngày] [đến ngày]`
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** mỗi giá trị đo truy được thời điểm đo, thời điểm nhận, nguồn và trạng thái.
- **Phương pháp:** bảng dạng dài `station_id, variable, t_obs, t_recv, value, unit, datum, source, qc_flag, revised_from`.
- **Công nghệ:** MongoDB time-series, index `(station_id, variable, t_obs)`.
- **Việc cần làm:**
  - [ ] Đọc schema các collection lịch sử hiện có, ghi lại trường nào đã có/thiếu
  - [ ] Thiết kế collection `observations`; bổ sung lịch sử cho `WaterLevelStation` ([src/core/entities/WaterLevelStation.js](src/core/entities/WaterLevelStation.js))
  - [ ] Viết adapter ghi song song từ các job hiện tại (không đổi hành vi cũ)
  - [ ] Thời gian lưu UTC, hiển thị +07:00
  - [ ] Gắn cờ QC: thiếu / ngoài ngưỡng / nhảy bậc / đã hiệu chỉnh
  - [ ] Thử trên staging trước, rồi mới bật ở production (hỏi trước khi bật)
- **Hoàn thành khi:** các job ghi song song vào `observations` ít nhất 7 ngày không lỗi; truy vấn được lịch sử mực nước trạm.

### 1.3 Thống nhất hệ cao độ — ⛔ (chờ mốc cao độ trạm)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** mực nước trạm, cao trình hồ, DEM và Cesium so sánh được với nhau.
- **Phương pháp:** quy về VN-2000 (Hòn Dấu); ghi độ lệch so với EGM2008 (DEM Copernicus) và WGS84 (Cesium).
- **Công nghệ:** PROJ/pyproj, geoid EGM2008.
- **Việc cần làm:**
  - [ ] Thu thập cao độ "0 trạm", mốc cao độ các trạm thủy văn
  - [ ] Đo độ lệch DEM tại vị trí trạm và mặt hồ (mặt hồ trên DEM đang lệch so với MNDBT)
  - [ ] Viết hàm chuyển đổi dùng chung Python (`digital_twin/scripts/vertical.py`) và JS
  - [ ] Bảng độ lệch từng trạm/hồ → `digital_twin/data/compute/vertical_offsets.csv`
- **Hoàn thành khi:** mọi cao độ trong mô hình có ghi rõ hệ quy chiếu và chuyển đổi được qua lại.

### 1.4 Mạng kết nối lưu vực – sông – hồ — 🟡 (đã dựng; chờ xác nhận tọa độ trạm, nhà máy)
- Phụ trách: Claude · Bắt đầu: 25/10/2026 · Xong:
- **Mục đích:** biết nước của hồ nào chảy vào nhánh nào; tránh cộng trùng nước hồ bậc thang (Sông Bung 4 → 4A → 5 → 6).
- **Phương pháp:** đồ thị có hướng: nút (tiểu lưu vực, hồ, hợp lưu, phân lưu, trạm, cửa sông), cạnh (đoạn sông).
- **Công nghệ:** Python networkx, GeoJSON; sau này PostGIS.
- **Đã có:** lưu vực các hồ và mạng sông từ DEM (`04_hydrology.py`), diện tích khớp số công bố (A Vương 683, Sông Bung 4 1.490, Sông Tranh 2 1.106 km²).
- **Việc cần làm:**
  - [x] `digital_twin/scripts/10_network.py`: thượng nguồn theo D8, đồng bằng theo 12 sông có tên trên OSM (giữ được phân lưu)
  - [x] 40 nút, 43 cạnh: 15 đập, 7 trạm, hợp lưu, nút phân lưu đồng bằng, 2 cửa sông (Cửa Đại, Cửa Hàn)
  - [x] Đồng bằng: Vu Gia → Quảng Huế (sang Thu Bồn) / Ái Nghĩa → Yên → Cẩm Lệ → Hàn; Thu Bồn → Giao Thủy → Câu Lâu → Hội An → Cửa Đại; Vĩnh Điện từ Thu Bồn ra Hàn
  - [x] Khai báo Đắk Mi 4 chuyển nước sang Thu Bồn (tạm nối vào Nông Sơn; phần xả tràn theo Đắk Mi)
  - [x] Kiểm tra: mọi đập tới cửa sông, không chu trình; hồ bậc thang đúng (Sông Tranh 2→3→4, Đắk Mi 3→4, Sông Bung 2→4→4A→5→6)
  - [x] Xuất `digital_twin/data/compute/network.json` + `network.geojson` (mở bằng QGIS)
  - [ ] Diện tích tại trạm: Nông Sơn +1,1% ✓; Thành Mỹ +10,7%, Giao Thủy −8,2% ✗ → **cần tọa độ trạm chính xác**
  - [ ] Xác nhận vị trí nhà máy, tuyến xả Đắk Mi 4 / 4C và Za Hưng – A Vương (số liệu hiện tại chưa khớp D8)
  - [ ] Tỷ lệ chia nước tại phân lưu (Quảng Huế, Yên/Quá Giáng, Vĩnh Điện) – để trống, xác định ở 5.2
- **Hoàn thành khi:** từ một hồ bất kỳ đi được tới cửa sông, và tổng diện tích tại các trạm khớp số công bố (sai lệch < 5%).

## HM2. Địa hình và dữ liệu công trình phục vụ thủy lực

**Mục đích:** địa hình và hình học sông đủ chính xác để tính ngập; địa hình hiển thị đẹp không đồng nghĩa địa hình tính toán chính xác.
**Phương pháp:** tách dữ liệu tính toán (DTM, mặt cắt) khỏi dữ liệu hiển thị; ưu tiên Ái Nghĩa – Giao Thủy – Hội An – Đà Nẵng.
**Công nghệ:** GDAL/rasterio, WhiteboxTools, QGIS, HEC-RAS RAS Mapper.

### 2.1 DTM hạ du độ phân giải cao — ⛔ (chờ dữ liệu)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** xác định đường nước lan và độ sâu ngập.
- **Phương pháp:** ưu tiên LiDAR / bản đồ địa hình 1:2.000–1:10.000; nếu không có: FABDEM hiệu chỉnh bằng điểm khống chế.
- **Công nghệ:** GDAL, PDAL, QGIS.
- **Việc cần làm:**
  - [ ] Gửi văn bản xin DTM/bản đồ địa hình (Sở NN&MT, Cục Đo đạc)
  - [ ] Phương án dự phòng: tải FABDEM vùng hạ du
  - [ ] Nắn về VN-2000; hiệu chỉnh bằng điểm GPS/RTK, cao độ đường
  - [ ] Tính RMSE tại điểm kiểm tra; ghi vào metadata
- **Hoàn thành khi:** có DTM vùng pilot kèm RMSE đã đo.

### 2.2 Mặt cắt và cao độ đáy sông — ⛔ (chờ dữ liệu)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** tính khả năng dẫn nước, mực nước, vận tốc; DEM vệ tinh không thấy đáy sông.
- **Phương pháp:** mặt cắt đo đạc + nội suy; nơi thiếu thì lòng sông giả định có ghi chú.
- **Công nghệ:** HEC-RAS, Python.
- **Việc cần làm:**
  - [ ] Xin mặt cắt Vu Gia, Thu Bồn, Quảng Huế, Vĩnh Điện, Hàn, Cẩm Lệ
  - [ ] Số hóa về dạng `(station, elevation)`; gắn vào tim sông của mạng 1.4
  - [ ] Nội suy giữa mặt cắt; khắc lòng sông vào DTM tính toán
  - [ ] Đánh dấu đoạn dùng lòng sông giả định
- **Hoàn thành khi:** sông chính vùng pilot có mặt cắt (đo hoặc giả định có ghi chú) cách nhau ≤ 1 km.

### 2.3 Công trình ảnh hưởng dòng chảy — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** thể hiện đê, bờ bao, nền đường, cầu, cống, đập dâng.
- **Phương pháp:** trích OSM + bổ sung cao độ; cầu/cống theo khẩu độ, cao độ dạ cầu, mặt cầu.
- **Công nghệ:** OSM, khảo sát, HEC-RAS (break lines, bridge/culvert).
- **Việc cần làm:**
  - [ ] Trích tuyến đê, đường đắp, cầu, cống từ OSM vùng pilot
  - [ ] Danh sách cầu lớn trên Vu Gia – Thu Bồn, Hàn – Cẩm Lệ; xin hồ sơ hoặc đo cao độ
  - [ ] Xuất làm đường biên cứng cho lưới 2D
- **Hoàn thành khi:** mọi cầu, đê trong vùng pilot có cao độ (đo hoặc ước lượng có ghi chú).

### 2.4 Tách dữ liệu hiển thị và tính toán — ✅
- Phụ trách: Claude · Bắt đầu: 25/10/2026 · Xong: 25/10/2026
- **Mục đích:** tránh nhầm "nhìn thấy" thành "đã tính".
- **Phương pháp:** metadata `purpose` (display/compute) và `accuracy` cho mỗi lớp.
- **Công nghệ:** `web/public/data/dt/layers.json`, `digital_twin/data/compute/`.
- **Việc cần làm:**
  - [x] Tạo thư mục `digital_twin/data/compute/` + README quy ước
  - [x] Thêm `purpose` (display/compute/illustrative), `accuracy` vào các lớp đã có dữ liệu trong `layers.json`
  - [x] Nhãn “minh họa” trên bảng lớp (đập 3D, ngập theo trận lũ); bảng ngập Hội An đã có sẵn ghi chú minh họa
- **Hoàn thành khi:** mọi lớp trong `layers.json` có `purpose`; lớp minh họa có nhãn trên giao diện.

## HM3. Mưa và mưa – dòng chảy

**Mục đích:** biến mưa đo và dự báo thành lưu lượng tại cửa ra từng tiểu lưu vực, kể cả nhánh không có hồ.
**Phương pháp:** trường mưa không gian + mô hình thủy văn khái niệm chạy song song AI; chỉ AI đã kiểm định đúng điều kiện vận hành mới nối vào chuỗi.
**Công nghệ:** Python, Open-Meteo/ECMWF (qua `weatherProxy`), HEC-HMS hoặc GR4J/HBV.

### 3.1 Trường mưa không gian – thời gian — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** mưa theo vị trí, theo giờ trên mọi tiểu lưu vực.
- **Phương pháp:** IDW/kriging mưa trạm + GSMaP/IMERG nơi thiếu trạm; dự báo ECMWF/GFS/ICON.
- **Công nghệ:** xarray, NetCDF/Zarr, pykrige.
- **Việc cần làm:**
  - [ ] Lưới ~1 km phủ lưu vực; nội suy mưa trạm theo giờ
  - [ ] Ghép mưa vệ tinh cho vùng thiếu trạm
  - [ ] Mưa trung bình theo tiểu lưu vực (theo mạng 1.4)
  - [ ] Lưu cả mưa thực đo và từng bản dự báo, kèm thời điểm phát hành
- **Hoàn thành khi:** có chuỗi mưa giờ theo tiểu lưu vực cho các trận thử.

### 3.2 Mô hình mưa – dòng chảy tiểu lưu vực — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** lưu lượng vào hồ và dòng chảy khu giữa.
- **Phương pháp:** GR4J/HBV hiệu chỉnh tự động (SCE-UA/DE) hoặc HEC-HMS (SCS-CN + Clark).
- **Công nghệ:** Python (spotpy, hydroeval), HEC-HMS.
- **Việc cần làm:**
  - [ ] Chọn mô hình (GR4J/HBV hay HEC-HMS), ghi lý do
  - [ ] Hiệu chỉnh trên A Vương, Sông Tranh 2, Sông Bung 4
  - [ ] Chuyển tham số sang lưu vực tương tự
  - [ ] Xuất `Q(t)` cho mỗi nút của mạng 1.4
- **Hoàn thành khi:** NSE/KGE trên trận kiểm định được ghi vào bảng đánh giá.

### 3.3 Đánh giá AI trong điều kiện vận hành thật — 🟡 (sửa lỗi XGBoost production; chuỗi hạ du hindcast – `25_forecast_chain.py`)
- Phụ trách: · Bắt đầu: 26/10/2026 · Xong:
- **Kết quả 26/10/2026:**
  - XGBoost production dự báo cao gấp ~14 lần Q đến thực đo (hồ 1, 2, 4; 45–48 giờ): mô hình học trên feature ĐÃ chuẩn hóa
    (StandardScaler theo hồ của dataset v2) nhưng `main_api.py` đưa feature thô. Sửa: `config/feature_scalers.json`
    (`export_feature_scalers.py`); thử lại 4 giờ phát báo × 3 hồ: MAE 224–508 → 10–32 m³/s. RF cùng lỗi, đã sửa (chưa deploy).
    Kết quả đánh giá offline của XGBoost/RF (Excel) không bị ảnh hưởng – chỉ phần phục vụ sai.
  - Chuỗi hạ du (dự báo ngược 2 trận 2025, 49 lần phát báo/trận): với thượng nguồn biết trước, MAE mực nước +24 h trận kiểm
    định: Nông Sơn 0,83 m (giữ nguyên 2,90), Giao Thủy 0,60 (1,60), Ái Nghĩa 0,55 (1,31), Câu Lâu 0,35 (0,93); giữ nguyên Q
    thượng nguồn chỉ hơn mốc giữ nguyên chút ít → giá trị nằm ở dự báo Q đến/Q xả. Quanh đỉnh, lệch thời gian diễn toán (−6 h /
    +14 h, bước 20) làm bản đồ +18–24 h kém mốc giữ nguyên (CSI 0,57–0,65) → cần 3.2 (mưa – dòng chảy khu giữa).
- **Mục đích:** tách "giỏi khi biết trước mưa" khỏi "dự báo thật với mưa dự báo" (RF/XGBoost huấn luyện với mưa thực đo dạng oracle).
- **Phương pháp:** hindcast với bản dự báo mưa có tại thời điểm phát hành; NSE, KGE, sai số đỉnh, lệch thời điểm đỉnh theo hồ, trận, thời hạn 6/12/24/48/72 giờ.
- **Công nghệ:** Python, Open-Meteo Historical Forecast API.
- **Việc cần làm:**
  - [ ] Tải các bản dự báo mưa lịch sử cho các trận thử
  - [ ] Chạy LSTM, RF, XGBoost (và 3.2 khi có) trên cùng đầu vào
  - [ ] Bảng so sánh theo hồ × trận × thời hạn → `Documents/Danh_Gia_Du_Bao_Van_Hanh.xlsx`
  - [ ] Chọn mô hình chính cho từng hồ; ghi vào model card (10.3)
- **Hoàn thành khi:** mỗi hồ có mô hình được chọn kèm sai số trong điều kiện vận hành thật.

### 3.4 Bất định và dự báo tổ hợp — ⬜ (sau M2)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** cảnh báo kèm độ tin cậy P10/P50/P90.
- **Phương pháp:** ECMWF ENS hoặc đa mô hình.
- **Công nghệ:** Open-Meteo Ensemble API, xarray.
- **Việc cần làm:**
  - [ ] Chạy 3.2 cho từng thành viên tổ hợp
  - [ ] Tổng hợp phân vị, chuyển sang HM4–HM6
- **Hoàn thành khi:** dự báo Q đến hồ có dải P10–P90 hiển thị được.

## HM4. Hồ chứa và vận hành liên hồ

**Mục đích:** biết mỗi hồ giữ, xả bao nhiêu, xả vào nhánh nào theo thời gian.
**Phương pháp:** cân bằng nước từng bước + quy tắc vận hành + giới hạn công trình.
**Công nghệ:** Node ([src/services/lakeCalc.service.js](src/services/lakeCalc.service.js)) cho API; lõi tính toán Python dùng chung.

### 4.1 Cân bằng nước với Qout(t) — ✅
- Phụ trách: Claude · Bắt đầu: 25/10/2026 · Xong: 25/10/2026
- **Mục đích:** sửa giới hạn `waterBalance()` dùng một `q_out` cố định cho cả chuỗi.
- **Phương pháp:** `dV/dt = Qin(t) − Qturbine(t) − Qspill(t) − Qloss`; tra `H(V)`.
- **Công nghệ:** JS/Python + kiểm thử đơn vị.
- **Việc cần làm:**
  - [x] Lõi thuần `src/services/reservoirSim.js`: `q_out` là số / mảng Qout(t) / hàm `policy(state)`; `waterBalance()` và API `POST /api/lake-specs/:id/water-balance` nhận thêm mảng, giữ nguyên dạng kết quả
  - [x] Kiểm thử `tests/reservoirSim.test.js` (`npm test`, 9/9 đạt): giống hệt thuật toán cũ khi q_out là số, bảo toàn khối lượng nước, hàm vận hành, cảnh báo
  - [x] Kiểm chứng trận thử (`digital_twin/scripts/12_reservoir_check.mjs`): Sông Bung 4 RMSE mực nước 0,15–0,22 m; A Vương 0,38–1,22 m; Đắk Mi 4 1,5–1,7 m; Sông Tranh 2 0,5–1,3 m
  - [x] **Bảng Z-V trong `seedLakeSpecs.js` tự mâu thuẫn** → đã thay bằng bảng ước tính từ số liệu vận hành 2022–2026 (`digital_twin/scripts/15_zv_estimate.py`, loại 2 trận thử). Kiểm chứng độc lập, RMSE mực nước: A Vương 0,03/0,05 m; Đắk Mi 4 0,05/0,06 m; Sông Bung 4 0,01/0,11 m; Sông Tranh 2 trận 2023 0,19 m
  - [ ] Sông Tranh 2 trận 10/2025: Q đến/Q xả báo cáo chỉ giải thích 145/206 triệu m³ nước tích (hụt ~30%) → hỏi chủ hồ
  - [x] **Đã thay bằng bảng Z-F-W chính thức Phụ lục II QĐ 1865** (A Vương, Đắk Mi 4, Sông Bung 4, Sông Tranh 2, Sông Bung 2). Bảng ước tính từ số liệu trùng bảng chính thức (Sông Tranh 2: 14,7/16,5/18,4/20,5 km² mỗi khoảng 5 m). RMSE mực nước 0,01–0,2 m
  - [x] MNC Sông Tranh 2 = 140 m (QĐ), không phải 158 m
  - [x] **Đã seed vào CSDL production** (25/10/2026): 16 hồ + 5 bảng Z-V theo QĐ 1865; API production trả số liệu mới. Bản sao lưu trước khi seed: `digital_twin/data/backup/lakespecs_zvcurves_truoc_QD1865_2026-10-25.json`
- **Hoàn thành khi:** API cũ không đổi kết quả; chạy lại trận thử với Qout thực cho sai số mực nước được ghi lại.

### 4.2 Đặc tính xả của công trình — ✅ theo QĐ 1865 (còn thiếu đường xả tràn Q = f(H, độ mở))
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** lưu lượng xả nằm trong giới hạn vật lý từng đập.
- **Phương pháp:** đường xả tràn `Q = f(H, độ mở)`, số cửa, kích thước, Q tua-bin max, Q môi trường.
- **Công nghệ:** `lake-specs` (API đã có).
- **Đã có:** MNDBT, MNC, MNGC, dung tích trong `lake-specs`.
- **Việc cần làm:**
  - [ ] Xin quy trình vận hành, hồ sơ thiết kế từng hồ
  - [ ] Bổ sung trường đường xả tràn, cửa van, tua-bin vào `lake-specs`
  - [ ] Dùng số liệu thật thay kích thước ước tính trong `web/src/features/digitalTwin/map/dams.js`
- **Hoàn thành khi:** các hồ trong chuỗi pilot (Sông Tranh 2, Đắk Mi 4) có đủ đặc tính xả.

### 4.3 Mô phỏng quy trình vận hành liên hồ — 🟡 (đã chạy lại QĐ 1865 trên 2 trận 2025 với mực nước trạm thật – `21_qd1865_replay.mjs`)
- **Kết quả 25/10/2026:** trận 10/2025 các hồ gần đầy → xả ≈ Q đến, giảm đỉnh 0–2 % (Sông Bung 2: 19 %), chế độ an toàn công trình tới 62 giờ (A Vương); cắt lũ đúng khuyến nghị 43–98 % số giờ. Trận 11/2025: giảm đỉnh 36–59 %, cắt lũ đúng 88–100 %. Mực nước trạm làm đổi chế độ khuyến nghị 4–47 giờ/hồ.
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** kịch bản xả đúng Quy trình vận hành liên hồ Vu Gia – Thu Bồn (QĐ 1865/QĐ-TTg – kiểm tra bản sửa đổi mới nhất).
- **Phương pháp:** mô phỏng theo luật: mực nước đón lũ, cắt lũ, ràng buộc mực nước trạm hạ du.
- **Công nghệ:** Python rule engine, YAML.
- **Việc cần làm:**
  - [ ] Mã hóa điều khoản quy trình thành luật YAML
  - [ ] Chạy hồ theo thứ tự thượng → hạ lưu trên mạng 1.4
  - [ ] So với lịch sử xả thật các trận thử
  - [ ] Thay phần khuyến nghị theo ngưỡng/hệ số trong `operationRecommendation()`
- **Hoàn thành khi:** mô phỏng tái tạo được lịch xả thật của trận thử ở mức chấp nhận (ghi tiêu chí).

### 4.4 Tối ưu vận hành — ⬜ (sau M2)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** đề xuất phương án xả giảm ngập hạ du, bảo đảm an toàn đập.
- **Phương pháp:** MPC / tối ưu đa mục tiêu trên dự báo tổ hợp.
- **Công nghệ:** scipy.optimize, pymoo.
- **Việc cần làm:**
  - [ ] Định nghĩa hàm mục tiêu (ngập hạ du, an toàn đập, phát điện)
  - [ ] Thử trên trận kiểm định, so với vận hành thật
- **Hoàn thành khi:** có ít nhất một trận cho thấy phương án đề xuất giảm ngập mà không vi phạm ràng buộc.

## HM5. Truyền lũ trên mạng sông

**Mục đích:** biết lũ tới mỗi điểm hạ du lúc nào, đỉnh bao nhiêu, nhập lưu ra sao.
**Phương pháp:** diễn toán nhanh toàn mạng + thủy lực 1D sông chính vùng triều.
**Công nghệ:** Python (Muskingum-Cunge), HEC-RAS 1D, hoặc MIKE 11 nếu có bản quyền.

### 5.1 Diễn toán nhanh Muskingum-Cunge — 🟡 (đã kiểm chứng bằng mực nước trạm – `20_routing_check.py`; thiếu mưa – dòng chảy khu giữa)
- **Kết quả 25/10/2026** (quan hệ H–Q dựng trên trận 10/2025, áp sang 11/2025): NSE mực nước 0,70–0,87; trận 10/2025 lệch đỉnh 0 – −6 giờ, trận 11/2025 đỉnh mô hình muộn 14–29 giờ – lũ do mưa khu giữa lên trước khi hồ xả lớn → cần 3.2. Nông Sơn thiếu số liệu đúng lúc đỉnh 18/11.
- Phụ trách: Claude · Bắt đầu: 25/10/2026 · Xong:
- **Mục đích:** kết quả trong vài giây cho chế độ "kịch bản".
- **Phương pháp:** diễn toán từng đoạn của mạng 1.4; cộng tại hợp lưu.
- **Công nghệ:** Python numpy; đóng gói API.
- **Việc cần làm:**
  - [x] `digital_twin/scripts/11_event_series.py` (chuỗi giờ trận thử) + `13_routing.py`: Muskingum-Cunge, tham số vật lý từ DEM + Manning, khu giữa theo mô-đun dòng chảy hồ đầu nguồn
  - [x] Kiểm chứng tại hồ hạ lưu (Q đến đo), NSE trận 2025/2023: Sông Tranh 4 0,96/0,89; Sông Bung 6 0,95/0,69; Đắk Mi 4 0,86/0,62; kém ở Sông Bung 4 (khu giữa 78% → cần 3.2)
  - [ ] Hiệu chỉnh bằng thời gian truyền lũ quan sát (Nông Sơn → Giao Thủy, Thành Mỹ → Ái Nghĩa) – **chờ số liệu trạm**
  - [x] Kiểm tra cân bằng khối lượng tự động: hệ số dòng chảy khu giữa > 1,2 hoặc âm → không dùng Q xả báo cáo (coi như chảy qua), không dùng để kiểm chứng. Trận 2025 loại: Sông Tranh 3 (hệ số 2,39), Sông Tranh 4 (1,65), Sông Bung 4A (âm), Sông Bung 6, Za Hưng, Sông Côn 2, Khe Diên, Đắk Mi 4C
  - Đỉnh tính (chưa kiểm chứng) trận 29/10/2025 sau khi loại số liệu sai: Nông Sơn ≈ 10.950, Giao Thủy ≈ 11.500, cuối Vu Gia ≈ 13.800 m³/s (trước: 16.650 / 17.080 / 14.000)
- **Hoàn thành khi:** lệch thời điểm đỉnh tại trạm kiểm tra được đo và ghi lại.

### 5.2 Thủy lực 1D hạ du — ⛔ (chờ 2.2)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** mực nước, vận tốc, nước dềnh vùng triều và phân lưu.
- **Phương pháp:** Saint-Venant 1D dòng không ổn định.
- **Công nghệ:** HEC-RAS 6.x, ras-commander / HEC-RAS Controller.
- **Việc cần làm:**
  - [ ] Dựng mạng 1D: Vu Gia, Thu Bồn, Quảng Huế, Vĩnh Điện, Yên, Cẩm Lệ, Hàn
  - [ ] Biên trên từ HM4, HM3; biên dưới từ 5.3
  - [ ] Hiệu chỉnh Manning theo Ái Nghĩa, Giao Thủy, Câu Lâu, Hội An
  - [ ] Điều khiển chạy tự động từ Python
- **Hoàn thành khi:** sai số mực nước đỉnh tại các trạm trên trận kiểm định được ghi lại.

### 5.3 Điều kiện biên triều tại cửa sông — 🟡 (mô hình triều Sơn Trà `18_tide_sontra.py`: RMSE 0,13 m trên 2008–2009; mạng sông chưa ra tới cửa Hàn, cửa Đại)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** ảnh hưởng triều cường tới ngập Hội An, Đà Nẵng.
- **Phương pháp:** hằng số điều hòa + nước dâng do bão (kịch bản).
- **Công nghệ:** Python utide.
- **Việc cần làm:**
  - [ ] Xin số liệu mực nước triều Sơn Trà, Hội An/Cửa Đại
  - [ ] Phân tích điều hòa; dự tính chuỗi giờ tại Cửa Đại, Cửa Hàn cho trận thử
- **Hoàn thành khi:** có chuỗi biên triều cho các trận thử và cho kỳ dự báo.

## HM6. Ngập hạ du

**Mục đích:** độ sâu, vận tốc, hướng chảy, thời gian ngập từng ô theo thời gian, thay thanh trượt "nước dâng đồng loạt".
**Phương pháp:** HAND làm mức cơ sở; thủy lực 2D ghép 1D làm mô hình chính.
**Công nghệ:** WhiteboxTools, HEC-RAS 2D hoặc SFINCS.

### 6.1 Mức cơ sở HAND — 🟡 (2 phương án: theo lưu lượng `14_hand.py`, theo mực nước trạm đo `19_hand_stage.py`)
- Phụ trách: Claude · Bắt đầu: 25/10/2026 · Xong:
- **Mục đích:** bản đồ ngập tức thì từ mực nước trạm khi chưa chạy kịp 2D.
- **Phương pháp:** độ sâu = mực nước đoạn sông gần nhất − HAND, có kiểm tra liên thông.
- **Công nghệ:** WhiteboxTools, Python.
- **Đã có:** priority-flood cho Hội An trong `digital_twin/scripts/07_hoian.py` (một mực nước chung, minh họa).
- **Việc cần làm:**
  - [x] `digital_twin/scripts/14_hand.py`: HAND (D8 vùng núi, nhánh gần nhất vùng đồng bằng) + đường quan hệ tổng hợp từng đoạn → độ sâu theo giờ
  - [x] Mực nước theo từng đoạn sông từ 5.1; phân lưu chia theo tỷ lệ GIẢ ĐỊNH (Quảng Huế 50%, Vĩnh Điện 15%…)
  - [x] Ảnh độ sâu mỗi 3 giờ: trận 2025 lớn nhất 577 km², trận 2023 413 km² (có thể lớn hơn thực tế: chưa có đê, DEM 30 m)
  - [x] Giao diện ghi rõ “minh họa”, liệt kê giả định
  - [x] Sửa lỗi: `dem_breach.tif` bị khoét trũng tới −615 m ở đồng bằng → cao độ lấy từ `dem_utm.tif` (bước 10, 14)
  - [x] Kiểm định sơ bộ bằng 68 tháp báo ngập VRain, trận 2025 (6.3): POD 0,67 · FAR 0,44 · CSI 0,44 · mô hình **sâu hơn đo +2,3 m**
  - [ ] Hiệu chỉnh: giảm độ sâu (đê/đường chưa có, CHANNEL_DEPTH 4 m, làm trơn); 11 tháp bị sót, nhiều tháp ở Hòa Phong – Hòa Nhơn – Hòa Phú (lưu vực Túy Loan, Q chỉ suy từ mô-đun Thành Mỹ)
  - [ ] Kiểm chứng với vết lũ / ảnh Sentinel-1 (6.3)
- **Hoàn thành khi:** trận thử có bản đồ ngập theo thời gian từ mực nước từng đoạn sông.

### 6.2 Thủy lực 2D ghép 1D — ⛔ (chờ 2.1, 2.2)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** nước tràn bờ, lan đồng, vào khu dân cư có vận tốc, hướng.
- **Phương pháp:** lưới mịn 10–20 m ở đô thị, 50–100 m ở đồng; ghép 1D; không cộng trùng mưa đã vào dòng chảy tiểu lưu vực.
- **Công nghệ:** HEC-RAS 2D hoặc SFINCS + hydromt-sfincs.
- **Việc cần làm:**
  - [ ] Chọn HEC-RAS 2D hay SFINCS (thử tốc độ trên vùng nhỏ), ghi lý do
  - [ ] Pilot Giao Thủy → Hội An: lưới, độ nhám theo lớp phủ, biên cứng 2.3
  - [ ] Nhận biên từ HM5
  - [ ] Xuất độ sâu, vận tốc mỗi 15–60 phút
- **Hoàn thành khi:** trận thử chạy hết; có raster độ sâu và vận tốc theo thời gian.

### 6.3 Hiệu chỉnh và kiểm định ngập — 🟡 (hiệu chỉnh trận 10/2025, kiểm định độc lập trận 11/2025 bằng tháp VRain; chờ vết lũ)
- **Kết quả 25/10/2026** (68 tháp, trận kiểm định 11/2025): theo lưu lượng – sai số độ sâu +2,37 m, FAR 0,59, CSI 0,36; theo mực nước trạm (lệch mặt chuẩn −0,9 m hiệu chỉnh trên 10/2025) – sai số −0,40 m (MAE 0,48 m), FAR 0,20, CSI 0,31 (0,40 trong ±1 ô). Bỏ sót ở lưu vực Túy Loan, Hòa Tiến (không có trạm) và ngập đô thị do mưa.
- Phụ trách: Claude · Bắt đầu: 25/10/2026 · Xong:
- **Mục đích:** định lượng mô hình đúng tới đâu.
- **Phương pháp:** so vết lũ, bảng điểm ngập Đà Nẵng, Sentinel-1, phản ánh ngập từ app; CSI, sai số độ sâu.
- **Công nghệ:** Google Earth Engine, Python.
- **Đã có:** `16_tower_export.mjs` + `16_tower_check.py` – so độ sâu lớn nhất mô hình với 79 tháp VRain
  (`data/compute/flood_towers/check_<trận>.json`). Lưu ý dữ liệu tháp: `-999` = không có số liệu; tháp 1,5 m đo tối đa
  1,0 m (giá trị 1,0 = "≥ 1 m"); 1 cảm biến đứng yên (FT431018); 4,98 m ở tháp 3 m năm 2023 = vượt tầm, bỏ.
  Trận 2023 chỉ 7 tháp có số liệu → **không đủ làm trận kiểm định độc lập**; 9 tháp (Hòa Bắc, Hòa Hiệp, Hòa Liên) nằm ngoài vùng mô hình.
  Tháp tập trung ở Đà Nẵng cũ (Hòa Vang) – vùng Hội An/Điện Bàn ít tháp.
- **Việc cần làm:**
  - [ ] Thu thập vết lũ 2020, 2022; ảnh Sentinel-1 các ngày lũ
  - [ ] Hiệu chỉnh trên trận 2020
  - [ ] Kiểm định trên trận 2022 (không chỉnh tham số)
  - [ ] Lưu kết quả đánh giá kèm phiên bản mô hình
- **Hoàn thành khi:** có CSI và sai số độ sâu trên trận kiểm định độc lập.

### 6.4 Hậu xử lý kết quả ngập — 🟡 (thư viện kịch bản `22_flood_scenarios.py`: 9 trận lịch sử 2004–2025 + 3 cấp báo động; tần suất Gumbel 19 năm)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** kết quả lên web nhẹ, tải từng phần.
- **Phương pháp:** COG / tile ảnh theo bước thời gian + thống kê tóm tắt.
- **Công nghệ:** GDAL, rio-cogeo, TiTiler (hoặc tile PNG mã hóa độ sâu).
- **Việc cần làm:**
  - [ ] Xuất `depth_t{n}.tif`, `velocity_t{n}.tif` dạng COG
  - [ ] Cắt tile hoặc dựng TiTiler
  - [ ] Đo dung lượng tải một khung thời gian
- **Hoàn thành khi:** Cesium tải một khung ngập vùng pilot dưới 2 giây trên mạng thường.

## HM7. Điều phối mô phỏng và kho kết quả

**Mục đích:** gắn các mô hình rời rạc thành một phiên chạy thống nhất, có phiên bản, truy xuất lại được.
**Phương pháp:** run manager + hàng đợi; mỗi phiên có `run_id`, thời điểm phát hành, phiên bản mô hình, dữ liệu đầu vào, giả định.
**Công nghệ:** Prefect/Celery hoặc BullMQ + Redis; PostGIS/TimescaleDB hoặc MongoDB + MinIO.

### 7.1 Run manager — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** chạy đúng thứ tự mưa → thủy văn → hồ → truyền lũ → ngập → tác động; theo dõi tiến độ, lỗi.
- **Phương pháp:** DAG; 3 chế độ hiện trạng, kịch bản, dự báo.
- **Công nghệ:** Prefect, gọi job Node qua HTTP.
- **Việc cần làm:**
  - [ ] Định nghĩa task cho từng bước (đầu vào/đầu ra rõ)
  - [ ] Metadata phiên: `run_id, mode, issued_at, sim_start, sim_end, model_versions, inputs_hash, assumptions, status`
  - [ ] Trạng thái phiên trên trang admin
- **Hoàn thành khi:** chạy lại một phiên cũ theo `run_id` cho cùng kết quả.

### 7.2 Bộ chuyển đổi kết quả — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** đầu ra mọi mô hình về cấu trúc chung.
- **Phương pháp:** NetCDF/Zarr chuẩn CF cho lưới; JSON/Parquet cho chuỗi điểm.
- **Công nghệ:** xarray.
- **Việc cần làm:**
  - [ ] Adapter AI (Q), hồ (H, Qout), routing, HEC-RAS (HDF5), SFINCS (NetCDF)
- **Hoàn thành khi:** mọi bước của chuỗi pilot ghi kết quả theo cùng một chuẩn.

### 7.3 Kho kết quả không gian – thời gian — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** truy vấn nhanh "mực nước tại X lúc t", "ô ngập lúc t".
- **Phương pháp:** vector, mạng, tài sản → PostGIS; chuỗi thời gian → TimescaleDB/MongoDB; raster → object storage.
- **Công nghệ:** PostgreSQL + PostGIS, MinIO.
- **Việc cần làm:**
  - [ ] Thiết kế bảng; dựng trên staging
  - [ ] **Hỏi trước** khi cài đặt hoặc thay đổi VPS production
  - [ ] Sao lưu định kỳ
- **Hoàn thành khi:** dữ liệu chuỗi pilot nằm trong kho, truy vấn được qua API.

### 7.4 Đồng hồ mô phỏng chung và API `/api/dt` — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** mưa, hồ, sông, ngập, xe, biểu đồ cùng chạy một dòng thời gian.
- **Phương pháp:** API theo `run_id` + khoảng thời gian; `Cesium.Clock` làm đồng hồ chung.
- **Công nghệ:** Express route mới, Cesium Clock/Timeline.
- **Việc cần làm:**
  - [ ] `GET /api/dt/runs`
  - [ ] `GET /api/dt/runs/:id/series?node=`
  - [ ] `GET /api/dt/runs/:id/flood?t=`
  - [ ] Cache phiên đã chạy xong
- **Hoàn thành khi:** web bản đồ 3D lấy toàn bộ dữ liệu phiên qua `/api/dt`.

## HM8. Tác động và cảnh báo

**Mục đích:** chuyển "nước sâu bao nhiêu" thành "nhà nào, đường nào, ai bị ảnh hưởng, khi nào".
**Phương pháp:** chồng ghép không gian, phân tích mạng đường, cảnh báo theo vị trí kèm độ tin cậy.
**Công nghệ:** PostGIS, OSMnx/pgRouting, job cảnh báo hiện có (`floodAlert`, `proximityAlert`, Expo push).

### 8.1 Chồng ghép ngập với tài sản — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** đếm nhà, trường, trạm y tế bị ngập theo cấp sâu.
- **Phương pháp:** độ sâu tại công trình so cao độ sàn (ước lượng nếu chưa có); cấp <0,5 / 0,5–1 / >1 m.
- **Công nghệ:** PostGIS `ST_Intersects`, rasterstats.
- **Việc cần làm:**
  - [ ] Gắn `building_id` cho 54.779 nhà Hội An
  - [ ] Bổ sung trường, trạm y tế, trụ sở
  - [ ] Tính chỉ số theo bước thời gian, lưu theo `run_id`, tổng hợp theo xã/phường
- **Hoàn thành khi:** trận thử có bảng số nhà ngập theo cấp và theo xã/phường.

### 8.2 Gián đoạn giao thông và khả năng tiếp cận — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** tuyến nào không đi được, khu nào bị cô lập.
- **Phương pháp:** loại đoạn ngập quá ngưỡng (ví dụ 0,3 m với xe máy); đường ngắn nhất tới điểm sơ tán.
- **Công nghệ:** OSMnx / pgRouting.
- **Việc cần làm:**
  - [ ] Đồ thị đường OSM vùng pilot
  - [ ] Cập nhật theo bước ngập; danh sách tuyến bị cắt
  - [ ] Khu dân cư không tới được điểm sơ tán
- **Hoàn thành khi:** trận thử có bản đồ tuyến bị chia cắt theo thời gian.

### 8.3 Cảnh báo theo vị trí — 🟡
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** cảnh báo dựa trên kết quả ngập, không chỉ ngưỡng tại trạm.
- **Phương pháp:** "dự kiến ngập Y m lúc T, độ tin cậy Z" (từ 3.4).
- **Công nghệ:** `proximityAlert.job.js`, `expoPush.service.js`.
- **Đã có:** cảnh báo gần điểm ngập, push Expo.
- **Việc cần làm:**
  - [ ] Nguồn cảnh báo mới từ kết quả ngập theo `run_id`
  - [ ] Chạy "chỉ admin xem" một mùa lũ; so với thực tế
  - [ ] Chỉ bật cho người dùng sau khi đánh giá
- **Hoàn thành khi:** có báo cáo đánh giá sau một mùa lũ chạy thử.

## HM9. Hiển thị Cesium và cảnh quan

**Mục đích:** hiển thị đúng kết quả tính theo thời gian; cảnh quan đẹp ở khu pilot mà vẫn nhẹ.
**Phương pháp:** ba cấp: toàn lưu vực (địa hình, sông, hồ, mưa) · đô thị (nhà, đường, cầu, ngập) · quan sát gần (cây, đèn, xe, người).
**Công nghệ:** CesiumJS, 3D Tiles, glTF, Blender.
**Đã có:** `/ban-do-so` với địa hình, sông, 15 hồ, lưu vực, đập 3D 13 hồ có số liệu sống, nhà/đường Hội An, chế độ HD.

### 9.1 Lớp nước động theo thời gian — 🟡 (bản đầu)
- Phụ trách: Claude · Bắt đầu: 25/10/2026 · Xong:
- **Mục đích:** nước dâng hạ theo đoạn sông, lan đồng bằng, chảy theo vận tốc.
- **Phương pháp:** mặt nước theo đoạn sông (HM5), raster độ sâu (HM6), hạt theo vận tốc chỉ khi có vận tốc, nếu không ghi "minh họa".
- **Công nghệ:** Cesium Primitive/Material, Clock, Timeline.
- **Việc cần làm:**
  - [x] Lớp “Ngập theo trận lũ (HAND)” (`map/floodHand.js`) + thanh thời gian `FloodTimelinePanel.jsx`: chọn trận, phát/tua, diện tích, độ sâu, Q Nông Sơn/Giao Thủy/Thành Mỹ/cuối Vu Gia
  - [x] **Mô phỏng diễn biến lũ theo giờ** (`map/simulation.js`, `SimulationHUD.jsx`, dữ liệu `23_sim_package.py`): một đồng hồ chung cho
    16 hồ (Q đến/xả, H, mưa, chế độ QĐ 1865), 9 trạm (H + màu báo động), 43 đoạn sông (vệt chảy theo Q), mưa rơi + trời u ám
    theo mưa đo, mặt nước 3D đặt đúng cao độ (nhà bị ngập chân), nhà/đường Hội An tô theo độ sâu và mức nguy hiểm đi lại
  - [x] Mặt nước từng đoạn sông theo thời gian (tô màu/tốc độ vệt chảy theo Q)
  - [x] "Dựng khu này" (`builder/areaBuilder.js`): OSM (Overpass + 2 máy dự phòng sau 7 s) + Open Buildings (đọc theo byte) + Nominatim,
    ghép nhà theo quy tắc ưu tiên OSM; khu tự dựng tham gia mô phỏng ngập (mặt nước toàn vùng ~300 m)
  - [ ] Dự báo Q đến tại thời điểm phát lại (cần chạy dự báo ngược – chưa có lưu trữ cho trận 2025)
  - [x] Lớp độ sâu ngập theo khung thời gian (từ 6.1, sau là 6.2)
  - [ ] Ba chế độ Hiện trạng / Kịch bản / Dự báo, luôn hiện `run_id` và thời điểm phát hành
  - [ ] So sánh hai phương án xả
- **Hoàn thành khi:** trận thử phát lại được trên bản đồ từ đầu tới cuối.

### 9.2 Nhà có mái và mặt tiền (3D Tiles) — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** cảnh đô thị chân thật, chọn được từng nhà.
- **Phương pháp:** sinh từ footprint OSM; suy kiểu mái, số tầng; texture theo loại nhà.
- **Công nghệ:** Blender + Blosm hoặc Python trimesh → glTF; 3d-tiles-tools/py3dtiles.
- **Việc cần làm:**
  - [ ] Pilot phố cổ Hội An 1–2 km²
  - [ ] Giữ `building_id` trong metadata (nối 8.1)
  - [ ] Đo hiệu năng; mở rộng toàn Hội An khi đạt
- **Hoàn thành khi:** khu pilot hiển thị nhà có mái, bấm được từng nhà, đạt ngân sách hiệu năng 9.5.

### 9.3 Đường, cầu, cây, đèn — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** hoàn thiện cảnh quan đường phố.
- **Phương pháp:** mặt đường theo cấp có vạch kẻ; cầu theo cao độ thật (2.3); cây, đèn instancing.
- **Công nghệ:** glTF `EXT_mesh_gpu_instancing`; vật liệu phát sáng + bloom ban đêm.
- **Việc cần làm:**
  - [ ] 5–10 mẫu cây, đèn trong Blender
  - [ ] Sinh vị trí từ OSM; xuất tile riêng
  - [ ] Mặt đường có vạch kẻ cho vùng pilot
- **Hoàn thành khi:** khu pilot có đường, cầu, cây, đèn; chế độ đêm có đèn sáng.

### 9.4 Đập chi tiết theo hồ sơ thật — 🟡
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** thay kích thước ước tính trong `dams.js` bằng số liệu thiết kế.
- **Phương pháp:** thông số từ 4.2; đập quan trọng dựng tay.
- **Công nghệ:** `dams.js`, Blender/glTF.
- **Đã có:** 13 đập dựng theo mặt cắt trọng lực gần đúng.
- **Việc cần làm:**
  - [ ] Bảng thông số hình học từng đập
  - [ ] `buildDam()` ưu tiên số liệu thật, chỉ ước tính khi thiếu
- **Hoàn thành khi:** các đập trong chuỗi pilot dùng số liệu thiết kế.

### 9.5 Phân cấp chi tiết và hiệu năng — 🟡
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** mượt trên máy thường, điện thoại.
- **Phương pháp:** 3D Tiles LOD; ẩn lớp chi tiết khi xa; HD/Tiêu chuẩn.
- **Công nghệ:** Cesium `maximumScreenSpaceError`, `DistanceDisplayCondition`.
- **Đã có:** chế độ HD/Tiêu chuẩn, giảm tải khi rê chuột, hoạt ảnh nước giới hạn khung hình.
- **Việc cần làm:**
  - [ ] Đặt ngân sách mỗi cấp (tam giác, dung lượng tải)
  - [ ] Đo trên máy có GPU thật và một điện thoại tầm trung
- **Hoàn thành khi:** có số đo khung hình/giây thực tế cho từng cấp, đạt ngân sách.

### 9.6 Xe và người — ⬜ (giai đoạn sau)
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** cảnh động; sau này phân tích sơ tán.
- **Phương pháp:** xe chạy theo kịch bản trên tuyến OSM, dừng/đổi hướng khi đường ngập (8.2), ghi "trình diễn"; sau dùng SUMO.
- **Công nghệ:** Cesium `SampledPositionProperty`, SUMO.
- **Việc cần làm:**
  - [ ] Kịch bản xe trên vài tuyến khu pilot
  - [ ] Phản ứng với tuyến bị cắt từ 8.2
- **Hoàn thành khi:** có lớp xe trình diễn, ghi rõ "trình diễn".

## HM10. Kiểm định, vận hành và triển khai (xuyên suốt)

**Mục đích:** hệ thống đáng tin, chạy ổn định, an toàn dữ liệu.
**Phương pháp:** kiểm thử tự động, giám sát, tách môi trường, quản lý secret.
**Công nghệ:** GitHub Actions, Vercel, VPS, PM2/Docker.

### 10.1 Kiểm thử và CI — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** thay đổi code không làm hỏng chức năng cũ.
- **Phương pháp:** kiểm thử đơn vị lõi tính toán; kiểm thử giao diện Puppeteer.
- **Công nghệ:** Vitest/Jest, pytest, GitHub Actions.
- **Việc cần làm:**
  - [ ] Kiểm thử đơn vị cho `lakeCalc.service.js` (trước khi sửa 4.1)
  - [ ] Đưa kiểm thử bản đồ 3D (Puppeteer) vào repo, chạy trong CI
  - [ ] Giảm dần 35 lỗi lint hiện có của `web/`
- **Hoàn thành khi:** mỗi lần push chạy kiểm thử tự động.

### 10.2 Môi trường và bảo mật — 🟡
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** chạy thử không ghi vào CSDL thật, không đẩy thông báo cho người dùng thật.
- **Phương pháp:** dev/staging/prod; `DISABLE_JOBS`; xoay vòng token từng bị lộ.
- **Công nghệ:** `.env` theo môi trường, GitHub Secrets.
- **Đã có:** `DISABLE_JOBS=1` bỏ qua cron khi chạy local.
- **Việc cần làm:**
  - [ ] Tạo CSDL staging; trỏ `web/.env` local sang staging
  - [ ] Kiểm tra đã xoay vòng GitHub token, mật khẩu MongoDB từng lộ trên VPS chưa
  - [ ] Đưa secret deploy vào GitHub Secrets
- **Hoàn thành khi:** có staging dùng được; không còn secret cũ còn hiệu lực.

### 10.3 Tài liệu và truy xuất — ⬜
- Phụ trách: · Bắt đầu: · Xong:
- **Mục đích:** mọi con số trong báo cáo NCKH, bài báo truy về được code, dữ liệu, phiên chạy.
- **Phương pháp:** gắn `run_id` và phiên bản mô hình; model card cho từng mô hình AI.
- **Công nghệ:** Markdown trong repo, DVC (tùy chọn).
- **Việc cần làm:**
  - [ ] Model card cho LSTM, RF, XGBoost (dữ liệu, chỉ số, giới hạn)
  - [ ] Đối chiếu hồ sơ NCKH, bài báo với code; chỉ ghi ARIMAX, SCE-UA khi đã có code
  - [ ] Cập nhật file này sau mỗi mốc
- **Hoàn thành khi:** mỗi mô hình đang chạy có model card; tài liệu khớp code.

---

## Dữ liệu đang chờ

Chi tiết nguồn và mức ưu tiên xem sheet `4_Thong_tin_can_cung_cap` trong file Excel.

| Dữ liệu | Cho hạng mục | Nguồn | Đã gửi yêu cầu | Đã nhận |
|---|---|---|---|---|
| **Mực nước, lưu lượng theo giờ** Nông Sơn, Giao Thủy, Câu Lâu, Hội An, Ái Nghĩa, Thành Mỹ, Cẩm Lệ – ít nhất 2 trận 26/10–02/11/2025 và 11–18/11/2023 | 1.1, 5.1, 6.1 | Đài KTTV Trung Trung Bộ | ⬜ | ⬜ |
| **Tọa độ chính xác** các trạm thủy văn trên | 1.4 | Đài KTTV | ⬜ | ⬜ |
| **Vị trí nhà máy, tuyến xả** (đường hầm) Đắk Mi 4, Đắk Mi 4C, A Vương, Za Hưng; tách Q tua-bin / Q xả tràn theo giờ | 1.4, 4.1 | Chủ hồ | ⬜ | ⬜ |
| Chuỗi mưa, mực nước, lưu lượng theo giờ các trạm (≥10 năm) | 3.2, 5.1 | Đài KTTV Trung Trung Bộ | ⬜ | ⬜ |
| Cao độ 0 trạm, mốc cao độ | 1.3 | Đài KTTV | ⬜ | ⬜ |
| DTM / bản đồ địa hình tỷ lệ lớn hạ du | 2.1, 6.2 | Sở NN&MT, Cục Đo đạc | ⬜ | ⬜ |
| Mặt cắt sông | 2.2, 5.2 | Sở NN&MT, Đài KTTV | ⬜ | ⬜ |
| Hồ sơ cầu, cống, đê; cao độ đường | 2.3 | Sở Xây dựng, Sở NN&MT | ⬜ | ⬜ |
| Quy trình liên hồ hiện hành | 4.3 | Sở Công Thương, Sở NN&MT | ✅ | ✅ QĐ 1865/QĐ-TTg ngày 23/12/2019 (`Documents/1865.signed.pdf`) |
| **Bảng quan hệ Z-V-F chính thức** | 4.1, 4.3 | QĐ 1865 Phụ lục II | ✅ | ✅ 5 hồ; còn thiếu 11 hồ nhỏ (dung tích nhỏ, ít ảnh hưởng) |
| Ngưỡng báo động I, II, III 11 trạm | 4.3 (Điều 6, 8, 9) | pctt.danang.gov.vn/so-lieu/thuy-van | ✅ | ✅ tự động (job pcttHydro, hàng giờ) |
| **Mực nước theo giờ** Hội Khách, Ái Nghĩa, Nông Sơn, Câu Lâu… | 4.3, 5.1, 6.3 | Người dùng thu thập (`Documents/Data_MucNuoc`): VNDMS 2025 + PCTT 2003–2019 + MIKE 2002–2011 → chuẩn hóa ở `17_station_levels.py`. **Còn thiếu 2020–2024** (trận 11/2023) và số liệu thời gian thực | ✅ | 🟡 2002–2019 mùa lũ, 2025 cả năm |
| Đường quan hệ H–Q Nông Sơn, Thành Mỹ, Giao Thủy | 5.1 | Đài KTTV | ⬜ | ⬜ |
| Độ sâu ngập theo giờ 79 tháp báo ngập/lũ | 6.3 | mucnuoc.vrain.vn (tài khoản Danang) | ✅ | ✅ tự động + lịch sử 2 trận lũ thử |
| Mực nước 13 trạm tự động (sông, hồ nhỏ) | 1.2, 8.3 | muangap.danang.gov.vn | ✅ | 🟡 chỉ giá trị hiện tại, 5 trạm chưa có số liệu, chưa có ngưỡng BĐ |
| Đường quan hệ xả tràn Q = f(H, độ mở cửa van) các hồ | 4.2, 4.3 | Quy trình vận hành đơn hồ | ⬜ | ⬜ |
| Đặc tính xả, số liệu vận hành theo giờ các hồ | 4.1, 4.2 | Chủ hồ | ⬜ | ⬜ |
| Mực nước triều Sơn Trà, Hội An | 5.3 | Đài KTTV | ⬜ | ⬜ |
| Vết lũ, bản đồ ngập 2020, 2022 | 6.3 | BCH PCTT, xã/phường | ⬜ | ⬜ |
| Ranh giới xã/phường mới, điểm sơ tán | 8.1, 8.2 | bando.danang.gov.vn (ranh giới); điểm sơ tán: xã/phường | ✅ | 🟡 94 xã/phường/đặc khu (`24_admin_boundaries.mjs`); chưa có điểm sơ tán |
| **Mực nước giờ thời gian thực** 6 trạm KTTV hạ du | 3.3, 5.1, 8.3 (chạy chuỗi dự báo hằng giờ) | Đài KTTV / VNDMS | ⬜ | ⬜ chặn vận hành chuỗi dự báo hạ du |

## Nhật ký

| Ngày | Việc | Kết quả | Commit / file |
|---|---|---|---|
| 26/10/2026 | "Dự báo 24 giờ" trên bản đồ 3D: Q đến LSTM (P50, P90) → Q xả giả định → diễn toán → mực nước trạm suy từ Q → ngập theo giờ, cùng giao diện mô phỏng (huy hiệu đã qua / +giờ / ngoài tầm LSTM). Lớp nhãn dự báo chỉ dùng LSTM (XGBoost chưa đưa vào vận hành). Tách mô-đun dùng chung `network_flows`, `sim_common`, `forecast_core` (đầu ra 14, 23, 25 không đổi) | Phát báo 11:00 26/10: không ngập (trời khô); LSTM phủ 8–11 giờ sau phát báo (chạy từ giờ đo cuối từng hồ), 11/15 hồ chỉ có 8–9 số đo/48 giờ; gói 2,1 MB/kịch bản | `26_forecast_package.py`, `map/simulation.js`, `SimulationHUD.jsx`, `FloodTimelinePanel.jsx` |
| 26/10/2026 | Bản đồ 3D: lớp trạm đo mưa, trạm thủy văn (biểu đồ hiện trạng), dự báo Q đến hồ (LSTM/XGBoost, ⚠ khi lệch > 3 lần), ranh giới 94 xã/phường sau sáp nhập. Sửa lỗi XGBoost production thiếu chuẩn hóa feature (cao gấp ~14 lần); RF cùng lỗi. Chuỗi dự báo hạ du hindcast. Khóa route xóa dữ liệu không cần đăng nhập | 33/33 kiểm thử; XGBoost MAE 224–508 → 10–32 m³/s; chuỗi hạ du +24 h MAE 0,35–0,83 m (giữ nguyên 0,93–2,90) trận kiểm định | `map/stations.js`, `map/forecast.js`, `24_admin_boundaries.mjs`, `25_forecast_chain.py`, `XGBoost_Py_Backend/main_api.py`, `tests/routeAuth.test.js` |
| 25/10/2026 | Mô phỏng diễn biến lũ theo giờ trên bản đồ 3D (thượng nguồn → sông → hạ du → nhà/đường) + "Dựng khu này" (OSM + Open Buildings + Nominatim trên trình duyệt) | Chạy được trên trình duyệt; Open Buildings khu 0,5 km² ≈ 2 MB/10 s; gói dữ liệu ~7 MB/trận | `map/simulation.js`, `components/SimulationHUD.jsx`, `builder/areaBuilder.js`, `23_sim_package.py` |
| 25/10/2026 | Trận lũ thử đổi sang 10/2025 (hiệu chỉnh) + 11/2025 (kiểm định); ngập theo mực nước trạm đo; kiểm chứng diễn toán bằng mực nước; chạy lại QĐ 1865; mô hình triều Sơn Trà; thư viện kịch bản + tần suất; nạp 69.826 giá trị giờ 2025 vào CSDL; biểu đồ trạm (trang chủ), lớp ngập 3 nhóm (/ban-do-so) | Sai số độ sâu tại tháp +2,37 → −0,40 m; NSE mực nước 0,70–0,87; giảm đỉnh hồ 36–59 % (11/2025); triều RMSE 0,13 m; 29/29 kiểm thử, build web đạt, thử trên trình duyệt không lỗi | `digital_twin/scripts/18–22`, `stage_map.py`, `src/script/importStationLevels.js`, `web/src/components/Map/StationLevelChart.jsx` |
| 25/10/2026 | Chuẩn hóa mực nước trạm KTTV từ `Documents/Data_MucNuoc` (51 file: VNDMS 2025, PCTT 2003–2019, MIKE dfs0, chuỗi liên tục, ngày 1976–2002); QC gắn cờ gai / điền sẵn / ngoài khoảng / trùng giờ; quy đổi mặt chuẩn Sơn Trà (−0,96 m) | 642.099 giá trị giờ dùng được, 10 trạm; đỉnh lũ khớp các trận 2007, 2009, 2013, 2017, 2025; trận 16–20/11/2025 đủ số liệu trạm + hồ → đề xuất thay trận kiểm định 2023 | `digital_twin/scripts/17_station_levels.py`, `Documents/Data_MucNuoc_ChuanHoa/` |
| 25/10/2026 | Nguồn tự động muangap (13 trạm mực nước sông/hồ, tọa độ đối chiếu OSM khớp) + VRain (79 tháp báo ngập/lũ, lịch sử giờ); job `autoStations` phút 25; lấy lại 2 trận lũ thử; sửa lỗi `-999` bị lưu thành độ sâu (đã xóa 18.808 bản ghi sai); kiểm định HAND bằng tháp | 29/29 kiểm thử; 23.931 số liệu tháp; HAND 2025: CSI 0,44, mô hình sâu hơn +2,3 m | `src/services/muangapWater.service.js`, `src/services/vrainFlood.service.js`, `src/jobs/autoStations.job.js`, `digital_twin/scripts/16_*` |
| 25/10/2026 | Lấy dữ liệu thủy văn pctt.danang.gov.vn: bảng WaterLevelStation (11 trạm + ngưỡng BĐ, mức quyết định QĐ 1865) và WaterLevelObservation; job hàng giờ; API /api/water-level/observations/:code; trạng thái trạm đưa vào khuyến nghị vận hành. Sửa lỗi Mongoose 9 ở hook tạo id (WaterLevelStation, FloodTower, FloodWarning) | 26/26 kiểm thử; trang PCTT không có số liệu giờ | `src/services/pcttHydro.service.js`, `src/jobs/pcttHydro.job.js` |
| 25/10/2026 | Đọc QĐ 1865/QĐ-TTg: cập nhật thông số 16 hồ (Phụ lục I), bảng Z-F-W 5 hồ (Phụ lục II), quy tắc vận hành mùa lũ/cạn (Điều 6–25, Phụ lục III); tuyến Đắk Mi 4 → 4b → 4c; gom thông số về một nguồn; khóa endpoint seed bằng adminAuth | 19/19 kiểm thử; RMSE mực nước 0,01–0,2 m; build web đạt | `src/api/config/qd1865.js`, `src/script/lakeSpecsData.js`, `src/services/lienHo1865.js`, `tests/` |
| 25/10/2026 | Sửa 3 lỗi dữ liệu: bảng Z-V (ước tính lại từ số liệu vận hành), DEM khoét trũng (dùng DEM gốc), số liệu hồ không cân bằng (tự loại) | RMSE mực nước 0,01–0,19 m; Nông Sơn đỉnh 2025 còn ≈ 10.950 m³/s; ngập 577 km² | `digital_twin/scripts/15_zv_estimate.py`, `src/script/seedLakeSpecs.js`, `13_routing.py` |
| 25/10/2026 | 9.1 lớp “Ngập theo trận lũ” + thanh thời gian | Chạy trên /ban-do-so (local), không lỗi trang; build đạt | `web/src/features/digitalTwin/map/floodHand.js`, `components/FloodTimelinePanel.jsx` |
| 25/10/2026 | 6.1 HAND + đường quan hệ tổng hợp | 2025: 613 km², 2023: 417 km² (mức cơ sở); sửa lỗi cao độ dem_breach | `digital_twin/scripts/14_hand.py`, `web/public/data/dt/flood_hand/` |
| 25/10/2026 | 5.1 diễn toán Muskingum-Cunge | NSE 0,86–0,98 tại hồ hạ lưu khu giữa nhỏ; mốc M1 đạt (chưa kiểm chứng trạm sông) | `digital_twin/scripts/11_event_series.py`, `13_routing.py` |
| 25/10/2026 | 2.4 tách dữ liệu hiển thị/tính toán | `purpose`/`accuracy` trong layers.json, nhãn “minh họa” | `web/public/data/dt/layers.json`, `LayerPanel.jsx` |
| 25/10/2026 | 4.1 cân bằng nước Qout(t) | 9/9 kiểm thử; Sông Bung 4 sai số mực nước 0,15–0,22 m; bảng Z-V 3 hồ sai | `src/services/reservoirSim.js`, `tests/reservoirSim.test.js`, `digital_twin/scripts/12_reservoir_check.mjs` |
| 25/10/2026 | 1.1 kiểm kê dữ liệu hồ; chốt trận lũ thử | 29/10/2025 (hiệu chỉnh), 14/11/2023 (kiểm định); chưa có số liệu trạm sông | `digital_twin/scripts/09_data_inventory.py`, `Documents/QC_Kiem_Ke_Du_Lieu.xlsx`, `data/compute/events.json` |
| 25/10/2026 | 1.4 mạng kết nối lưu vực – sông – hồ | 40 nút, 43 cạnh; bậc thang đúng; Thành Mỹ, Giao Thủy lệch diện tích 8–11% (tọa độ trạm gần đúng) | `digital_twin/scripts/10_network.py`, `data/compute/network.json` |
| 24/10/2026 | Lập lộ trình, file theo dõi; Excel và Word đề xuất theo CV 7349/SKHCN-CNTT | Có 10 hạng mục, 5 mốc, 7 đợt thực hiện | `LO_TRINH_BAN_SAO_SO.md`, `Documents/Lo_Trinh_Ban_Sao_So_DaNang_2027.xlsx`, `Documents/De_Xuat_Ban_Sao_So_DaNang_2027.docx` |
| 20/10/2026 | Đập 3D, HD sắc nét, giảm khựng khi di chuyển | Đã deploy production | `6676b7f` |
