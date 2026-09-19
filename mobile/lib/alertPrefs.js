import * as SecureStore from "expo-secure-store";

// Ngưỡng cảnh báo ngập cá nhân hoá — trước đây hard-code cố định 300m/30cm
// cho mọi người dùng trong app/(tab)/index.jsx. Người ở gần sông/hồ có thể
// muốn bán kính lớn hơn; người ở khu ít ngập có thể muốn ngưỡng thấp hơn để
// được báo sớm.
const RADIUS_KEY = "alert_radius_km";
const LEVEL_KEY = "alert_level_cm";

export const RADIUS_OPTIONS_KM = [0.2, 0.3, 0.5, 1];
export const LEVEL_OPTIONS_CM = [15, 20, 30, 50];

const DEFAULT_RADIUS_KM = 0.3;
const DEFAULT_LEVEL_CM = 30;

export async function getAlertRadiusKm() {
  try {
    const v = await SecureStore.getItemAsync(RADIUS_KEY);
    return v === null ? DEFAULT_RADIUS_KM : parseFloat(v);
  } catch {
    return DEFAULT_RADIUS_KM;
  }
}

export async function setAlertRadiusKm(km) {
  try {
    await SecureStore.setItemAsync(RADIUS_KEY, String(km));
  } catch (e) {
    console.warn("Không lưu được bán kính cảnh báo:", e.message);
  }
}

export async function getAlertLevelCm() {
  try {
    const v = await SecureStore.getItemAsync(LEVEL_KEY);
    return v === null ? DEFAULT_LEVEL_CM : parseFloat(v);
  } catch {
    return DEFAULT_LEVEL_CM;
  }
}

export async function setAlertLevelCm(cm) {
  try {
    await SecureStore.setItemAsync(LEVEL_KEY, String(cm));
  } catch (e) {
    console.warn("Không lưu được ngưỡng mức ngập cảnh báo:", e.message);
  }
}
