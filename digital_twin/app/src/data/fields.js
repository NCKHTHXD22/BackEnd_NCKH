// Nhãn tiếng Việt và đơn vị cho thuộc tính hiển thị trong bảng thông tin, theo từng lớp.
// Thuộc tính không có trong danh sách thì không hiển thị.
export const FIELDS = {
  reservoirs: [
    ['branch', 'Nhánh sông'], ['river', 'Sông'], ['address', 'Địa điểm'],
    ['MNDBT', 'Mực nước dâng bình thường', 'm'], ['MNC', 'Mực nước chết', 'm'],
    ['MNGC', 'Mực nước gia cường', 'm'], ['crest', 'Cao trình đỉnh đập', 'm'],
    ['total_volume', 'Tổng dung tích', 'triệu m³'], ['dead_volume', 'Dung tích chết', 'triệu m³'],
    ['flood_volume', 'Dung tích phòng lũ', 'triệu m³'],
    ['capacity_mw', 'Công suất lắp máy', 'MW'], ['turbines', 'Số tổ máy'], ['design_head', 'Cột nước thiết kế', 'm'],
    ['spillway_crest_elev', 'Cao trình ngưỡng tràn', 'm'], ['spillway_width', 'Tổng bề rộng tràn', 'm'],
    ['regulation_doc', 'Quy trình vận hành'],
  ],
  catchments: [
    ['branch', 'Nhánh sông'], ['area_km2', 'Diện tích bộ phận', 'km²'],
    ['catch_total_km2', 'Tổng diện tích lưu vực đến tuyến đập', 'km²'],
  ],
  basin: [['area_km2', 'Diện tích (tính từ DEM)', 'km²']],
  streams: [['strahler', 'Cấp sông (Strahler)'], ['length_km', 'Chiều dài đoạn', 'km']],
  osm_rivers: [['name_en', 'Tên khác'], ['length_km', 'Chiều dài trong lưu vực', 'km']],
  lakes: [['area_km2', 'Diện tích mặt nước', 'km²']],
  hoian_buildings: [
    ['type', 'Loại công trình'], ['levels', 'Số tầng (ước tính)'], ['height_m', 'Chiều cao', 'm'],
    ['area_m2', 'Diện tích nền', 'm²'], ['ground_m', 'Cao độ nền', 'm'],
    ['flood_from_m', 'Bắt đầu ngập khi mực nước đạt', 'm'], ['depth_now_m', 'Độ sâu ngập theo kịch bản', 'm'],
  ],
  hoian_roads: [
    ['highway', 'Loại đường (OSM)'], ['length_km', 'Chiều dài đoạn', 'km'],
    ['flood_from_m', 'Bắt đầu ngập khi mực nước đạt', 'm'],
  ],
};

export const fmt = v => (typeof v === 'number' ? v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : v);
