import axios from "axios";

// Proxy cho OpenWeatherMap — API key chỉ sống ở server (.env), không bao giờ
// đi vào app mobile bundle. Trước đây key bị hard-code thẳng trong
// mobile/app/(tab)/weather.jsx và index.jsx (lộ trong APK + git history).
const OWM_BASE = "https://api.openweathermap.org/data/2.5";
const OWM_KEY = process.env.OPENWEATHER_API_KEY;

class WeatherProxyService {
    async current({ lat, lon, lang }) {
        const { data } = await axios.get(`${OWM_BASE}/weather`, {
            params: { lat, lon, units: "metric", appid: OWM_KEY, ...(lang ? { lang } : {}) },
        });
        return data;
    }

    async forecast({ lat, lon, cnt }) {
        const { data } = await axios.get(`${OWM_BASE}/forecast`, {
            params: { lat, lon, units: "metric", appid: OWM_KEY, ...(cnt ? { cnt } : {}) },
        });
        return data;
    }

    async uvi({ lat, lon }) {
        const { data } = await axios.get(`${OWM_BASE}/uvi`, {
            params: { lat, lon, appid: OWM_KEY },
        });
        return data;
    }
}

export const weatherProxyService = new WeatherProxyService();
