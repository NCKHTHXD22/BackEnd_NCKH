// Nguồn duy nhất cho các loại báo cáo ngập lụt cộng đồng — dùng chung giữa
// modal gửi báo cáo, admin panel (PostDetailModal, DataTable*), và popup marker trên bản đồ.
// Giá trị enum phải khớp CHÍNH XÁC với backend (src/core/entities/FloodPost.js).

export const REPORT_TYPES = [
  { value: "flood_point", label: "Điểm ngập", i18nKey: "reportType.floodPoint" },
  { value: "flood_road", label: "Đường ngập", i18nKey: "reportType.floodRoad" },
  { value: "fallen_tree", label: "Cây ngã đổ", i18nKey: "reportType.fallenTree" },
  { value: "landslide", label: "Khu vực sạt lở", i18nKey: "reportType.landslide" },
];

export const REPORT_TYPE_LABELS = REPORT_TYPES.reduce((acc, t) => {
  acc[t.value] = t.label;
  return acc;
}, {});

// Loại có khối "Mức ngập" (floodLevel + areaType)
export const FLOOD_LEVEL_TYPES = ["flood_point", "flood_road"];
// Loại cần ghim 1 điểm duy nhất trên bản đồ (location.latitude/longitude)
export const POINT_TYPES = ["flood_point", "fallen_tree"];
// Loại cần cặp địa chỉ từ/đến (fromAddress/toAddress)
export const RANGE_TYPES = ["flood_road", "landslide"];

export const AREA_TYPES = ["Trong nhà", "Ngoài đường", "Khu vực khác"];

export const LANDSLIDE_STATUS = ["Có nguy cơ", "Đã sạt lở"];

// t (i18next's translate fn) is optional — pass it to get a localized label
// (VI/EN), omit it for the plain Vietnamese fallback (used by admin-only views
// that don't have a language toggle).
export function getReportTypeLabel(reportType, t) {
  const type = REPORT_TYPES.find((r) => r.value === reportType) || REPORT_TYPES[0];
  return t ? t(type.i18nKey) : type.label;
}
