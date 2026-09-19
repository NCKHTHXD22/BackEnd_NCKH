import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as SecureStore from "expo-secure-store";
import vi from "../i18n/locales/vi.json";
import en from "../i18n/locales/en.json";

const LANG_KEY = "app_language";

// Mặc định Tiếng Việt (thị trường chính của app) — lựa chọn đã lưu của
// người dùng (SecureStore, đổi trong Profile) được nạp đè lên ngay bên dưới.
// Trước đây dùng expo-localization để đoán theo ngôn ngữ hệ điều hành, nhưng
// đây là native module — cài qua npm không đủ, cần rebuild dev client mới
// dùng được, nếu chưa rebuild sẽ crash toàn bộ app ("Cannot find native
// module 'ExpoLocalization'") ngay từ khi import file này. Bỏ để không phụ
// thuộc bước rebuild; người dùng vẫn tự chọn ngôn ngữ được trong Profile.
i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
  },
  lng: "vi",
  fallbackLng: "vi",
  interpolation: { escapeValue: false },
  compatibilityJSON: "v4",
});

// Nạp lựa chọn ngôn ngữ đã lưu (bất đồng bộ — SecureStore không có API đồng bộ)
SecureStore.getItemAsync(LANG_KEY).then((saved) => {
  if (saved && saved !== i18n.language) i18n.changeLanguage(saved);
});

export async function setAppLanguage(lang) {
  await i18n.changeLanguage(lang);
  try {
    await SecureStore.setItemAsync(LANG_KEY, lang);
  } catch (e) {
    console.warn("Không lưu được lựa chọn ngôn ngữ:", e.message);
  }
}

export default i18n;
