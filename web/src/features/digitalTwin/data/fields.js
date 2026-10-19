// Thuộc tính hiển thị trong bảng thông tin, theo từng lớp: [khóa thuộc tính, khóa đơn vị].
// Nhãn lấy từ i18n `digitalTwin.field.<khóa>`, đơn vị từ `digitalTwin.unit.<khóa đơn vị>`.
// Thuộc tính không có trong danh sách thì không hiển thị.
export const FIELDS = {
  reservoirs: [
    ['branch'], ['river'], ['address'],
    ['MNDBT', 'm'], ['MNC', 'm'], ['MNGC', 'm'], ['crest', 'm'],
    ['total_volume', 'mcm'], ['dead_volume', 'mcm'], ['flood_volume', 'mcm'],
    ['capacity_mw', 'mw'], ['turbines'], ['design_head', 'm'],
    ['spillway_crest_elev', 'm'], ['spillway_width', 'm'], ['regulation_doc'],
  ],
  catchments: [['branch'], ['area_km2', 'km2'], ['catch_total_km2', 'km2'], ['warning']],
  basin: [['area_km2', 'km2']],
  streams: [['strahler'], ['length_km', 'km']],
  osm_rivers: [['name_en'], ['length_km', 'km']],
  lakes: [['area_km2', 'km2']],
  hoian_buildings: [
    ['type'], ['levels'], ['height_m', 'm'], ['area_m2', 'm2'], ['ground_m', 'm'],
    ['flood_from_m', 'm'], ['depth_now_m', 'm'],
  ],
  hoian_roads: [['highway'], ['length_km', 'km'], ['flood_from_m', 'm']],
};

export const fmt = (v, lang = 'vi') =>
  (typeof v === 'number' ? v.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: 2 }) : v);

/** Lấy chuỗi theo ngôn ngữ từ mục danh mục lớp: `name` / `name_en`. */
export const pick = (obj, key, lang) => (lang === 'en' && obj?.[`${key}_en`]) || obj?.[key];
