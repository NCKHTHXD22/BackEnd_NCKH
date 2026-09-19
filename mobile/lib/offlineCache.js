import AsyncStorage from "@react-native-async-storage/async-storage";

// Cache tối giản cho chế độ offline: lưu lần fetch thành công gần nhất để
// vẫn hiển thị được dữ liệu (dù cũ) khi mất mạng, thay vì màn hình trắng.
const PREFIX = "offline_cache:";

export async function saveCache(key, data) {
  try {
    await AsyncStorage.setItem(
      PREFIX + key,
      JSON.stringify({ data, savedAt: Date.now() })
    );
  } catch (e) {
    console.warn(`Không lưu được cache "${key}":`, e.message);
  }
}

// Trả về { data, savedAt } hoặc null nếu chưa có cache.
export async function loadCache(key) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Không đọc được cache "${key}":`, e.message);
    return null;
  }
}
