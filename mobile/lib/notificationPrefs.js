import * as SecureStore from "expo-secure-store";

// Lưu lựa chọn bật/tắt Push Notification của người dùng — trước đây switch
// trong Profile chỉ là state cục bộ, không lưu gì nên PushTokenSync
// (app/_layout.jsx) luôn tự đăng ký lại token mỗi lần mở app bất kể người
// dùng đã tắt hay chưa. Mặc định bật (true) nếu chưa từng đặt.
const KEY = "push_notifications_enabled";

export async function getPushEnabled() {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

export async function setPushEnabled(enabled) {
  try {
    await SecureStore.setItemAsync(KEY, enabled ? "true" : "false");
  } catch (e) {
    console.warn("Không lưu được tuỳ chọn push notification:", e.message);
  }
}
