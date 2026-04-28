const VI_MAP = {
  'à':'a','á':'a','â':'a','ã':'a','ả':'a','ạ':'a',
  'ă':'a','ắ':'a','ặ':'a','ằ':'a','ẳ':'a','ẵ':'a',
  'ấ':'a','ậ':'a','ầ':'a','ẩ':'a','ẫ':'a',
  'è':'e','é':'e','ê':'e','ẽ':'e','ẻ':'e','ẹ':'e',
  'ế':'e','ệ':'e','ề':'e','ể':'e','ễ':'e',
  'ì':'i','í':'i','î':'i','ĩ':'i','ỉ':'i','ị':'i',
  'ò':'o','ó':'o','ô':'o','õ':'o','ỏ':'o','ọ':'o',
  'ố':'o','ộ':'o','ồ':'o','ổ':'o','ỗ':'o',
  'ơ':'o','ớ':'o','ợ':'o','ờ':'o','ở':'o','ỡ':'o',
  'ù':'u','ú':'u','û':'u','ũ':'u','ủ':'u','ụ':'u',
  'ư':'u','ứ':'u','ự':'u','ừ':'u','ử':'u','ữ':'u',
  'ỳ':'y','ý':'y','ŷ':'y','ỹ':'y','ỷ':'y','ỵ':'y',
  'đ':'d',
  'À':'A','Á':'A','Â':'A','Ã':'A','Ả':'A','Ạ':'A',
  'Ă':'A','Ắ':'A','Ặ':'A','Ằ':'A','Ẳ':'A','Ẵ':'A',
  'Ấ':'A','Ậ':'A','Ầ':'A','Ẩ':'A','Ẫ':'A',
  'È':'E','É':'E','Ê':'E','Ẽ':'E','Ẻ':'E','Ẹ':'E',
  'Ế':'E','Ệ':'E','Ề':'E','Ể':'E','Ễ':'E',
  'Ì':'I','Í':'I','Î':'I','Ĩ':'I','Ỉ':'I','Ị':'I',
  'Ò':'O','Ó':'O','Ô':'O','Õ':'O','Ỏ':'O','Ọ':'O',
  'Ố':'O','Ộ':'O','Ồ':'O','Ổ':'O','Ỗ':'O',
  'Ơ':'O','Ớ':'O','Ợ':'O','Ờ':'O','Ở':'O','Ỡ':'O',
  'Ù':'U','Ú':'U','Û':'U','Ũ':'U','Ủ':'U','Ụ':'U',
  'Ư':'U','Ứ':'U','Ự':'U','Ừ':'U','Ử':'U','Ữ':'U',
  'Ỳ':'Y','Ý':'Y','Ŷ':'Y','Ỹ':'Y','Ỷ':'Y','Ỵ':'Y',
  'Đ':'D',
};

function stripDiacritics(str) {
  if (!str) return '';
  return str.split('').map(c => VI_MAP[c] || c).join('');
}

// Formats a Vietnamese reservoir name for English display:
// strips "Hồ"/"HỒ" prefix and removes all diacritics.
// In Vietnamese mode returns the name unchanged.
export function formatLakeName(rawName, lang) {
  if (!rawName) return rawName;
  if (lang !== 'en') return rawName;
  const withoutHo = rawName.replace(/^(H[ồỒ]|Ho)\s+/i, '');
  return stripDiacritics(withoutHo);
}
