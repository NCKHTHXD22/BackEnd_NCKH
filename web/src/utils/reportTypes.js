// Nguồn duy nhất cho các loại báo cáo ngập lụt cộng đồng — dùng chung giữa
// modal gửi báo cáo, admin panel (PostDetailModal, DataTable*), và popup marker trên bản đồ.
// Giá trị enum phải khớp CHÍNH XÁC với backend (src/core/entities/FloodPost.js).

export const REPORT_TYPES = [
  { value: "flood_point", label: "Điểm ngập" },
  { value: "flood_road", label: "Đường ngập" },
  { value: "fallen_tree", label: "Cây ngã đổ" },
  { value: "landslide", label: "Khu vực sạt lở" },
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

export function getReportTypeLabel(reportType) {
  return REPORT_TYPE_LABELS[reportType] || REPORT_TYPE_LABELS.flood_point;
}
