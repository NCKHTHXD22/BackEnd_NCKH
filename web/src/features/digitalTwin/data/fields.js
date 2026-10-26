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
  // Đơn vị 'enum': giá trị là mã, nhãn lấy từ `digitalTwin.enum.<khóa>.<mã>`
  admin: [['loai'], ['sap_nhap'], ['dtich_km2', 'km2'], ['dan_so'], ['matdo_km2', 'perkm2'], ['tru_so'], ['ma_xa']],
  rain_stations: [['rain_mm', 'mm'], ['rain_level'], ['area'], ['address'], ['last_update']],
  wl_stations: [
    ['station_kind', 'enum'], ['river'], ['level_m', 'm'], ['alarm', 'enum'], ['level_time'],
    ['level1', 'm'], ['level2', 'm'], ['level3', 'm'], ['decision_level', 'm'], ['location_note'],
  ],
};

export const fmt = (v, lang = 'vi') => {
  const locale = lang === 'en' ? 'en-GB' : 'vi-VN';
  if (typeof v === 'number') return v.toLocaleString(locale, { maximumFractionDigits: 2 });
  if (v instanceof Date) return v.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return v;
};

/** Lấy chuỗi theo ngôn ngữ từ mục danh mục lớp: `name` / `name_en`. */
export const pick = (obj, key, lang) => (lang === 'en' && obj?.[`${key}_en`]) || obj?.[key];
