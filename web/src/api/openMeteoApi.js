/**
 * openMeteoApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetch rainfall forecast từ Open-Meteo API (miễn phí, không cần API key)
 * Endpoint: https://api.open-meteo.com/v1/forecast
 *
 * Các nguồn mưa (models) được hỗ trợ cho khu vực Việt Nam:
 *   - best_match   : Open-Meteo tự động chọn mô hình tốt nhất (dùng cho tab Vận hành)
 *   - ecmwf_ifs025 : ECMWF IFS 0.25° (châu Âu, dự báo tốt nhất toàn cầu)
 *   - gfs025       : NOAA GFS 0.25° (Mỹ)
 *   - jma_seamless : JMA (Nhật Bản, tốt cho Đông Nam Á)
 *
 * Tọa độ hồ chứa lấy từ config/reservoirs.py (đồng bộ):
 */

const BASE_URL = "https://api.open-meteo.com/v1/forecast";
const TZ = "Asia/Bangkok"; // UTC+7

// Danh sách nguồn mưa cho tab Dự báo (multi-source)
export const RAIN_SOURCES = [
    { key: "best_match",    label: "Best Match",  color: "#0ea5e9", isBest: true },
    { key: "ecmwf_ifs025",  label: "EU ECMWF",    color: "#8b5cf6" },
    { key: "gfs025",        label: "US GFS",       color: "#f59e0b" },
    { key: "jma_seamless",  label: "JMA (Nhật)",   color: "#10b981" },
];

// Tọa độ hồ chứa — khớp với reservoirs.py
export const RESERVOIR_COORDS = {
    1:  { lat: 15.815,   lon: 107.630   },  // A Vương
    2:  { lat: 15.452,   lon: 107.832   },  // Đắk Mi 4
    3:  { lat: 15.726,   lon: 107.637   },  // Sông Bung 4
    4:  { lat: 15.326,   lon: 108.125   },  // Sông Tranh 2
    7:  { lat: 15.765,   lon: 107.679   },  // Sông Bung 4A
    8:  { lat: 15.808,   lon: 107.747   },  // Sông Bung 5
    9:  { lat: 15.714,   lon: 107.397   },  // Sông Bung 2
    11: { lat: 15.820,   lon: 107.780   },  // Sông Bung 6
    12: { lat: 15.444,   lon: 108.143   },  // Sông Tranh 3
    13: { lat: 15.860,   lon: 107.654   },  // Za Hung
    14: { lat: 15.330,   lon: 107.810   },  // Đắk Mi 3
    15: { lat: 15.712,   lon: 107.928   },  // Khe Diên
    16: { lat: 15.905,   lon: 107.823   },  // Sông Côn 2
    17: { lat: 15.536,   lon: 108.152   },  // Sông Tranh 4
    18: { lat: 15.238,   lon: 107.810   },  // Đắk Mi 2
    19: { lat: 15.464,   lon: 107.928   },  // Đắk Mi 4C
};

// Cache để tránh gọi API lặp lại (key: `${lakeId}_${models.join(',')}`)
const _cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 phút

/**
 * Fetch mưa dự báo từ Open-Meteo cho 1 hồ.
 *
 * @param {number|string} lakeId  - ID hồ (khớp RESERVOIR_COORDS)
 * @param {string[]}      models  - Danh sách model: ['best_match', 'ecmwf_ifs025', ...]
 * @param {number}        days    - Số ngày dự báo (mặc định 3)
 * @returns {Promise<{
 *   times: string[],         // ISO timestamps (e.g. "2026-04-23T00:00")
 *   bySource: {              // key: model name, value: mm/h array
 *     best_match?: number[],
 *     ecmwf_ifs025?: number[],
 *     gfs025?: number[],
 *     jma_seamless?: number[],
 *   },
 *   bestMatch: number[],     // shortcut cho best_match (hoặc mean nếu không có)
 * }>}
 */
export async function fetchRainForecast(lakeId, models = ["best_match"], days = 3) {
    const coords = RESERVOIR_COORDS[Number(lakeId)];
    if (!coords) {
        console.warn(`[openMeteoApi] Không có tọa độ cho lakeId=${lakeId}`);
        return { times: [], bySource: {}, bestMatch: [] };
    }

    const cacheKey = `${lakeId}_${models.join(",")}_${days}`;
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.data;
    }

    const modelsParam = models.join(",");
    const url = `${BASE_URL}?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&hourly=precipitation` +
        `&models=${modelsParam}` +
        `&forecast_days=${days}` +
        `&timezone=${encodeURIComponent(TZ)}`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();

        const times = json.hourly?.time ?? [];

        // Parse từng model: Open-Meteo trả key `precipitation_<model>`
        // Ví dụ: precipitation_best_match, precipitation_ecmwf_ifs025
        const bySource = {};
        for (const model of models) {
            const key = models.length === 1 && model === "best_match"
                ? "precipitation"           // Khi chỉ gọi 1 model best_match
                : `precipitation_${model}`;
            const arr = json.hourly?.[key];
            if (arr) {
                // Thay null → 0 (GFS đôi khi trả null cho vùng không có dữ liệu)
                bySource[model] = arr.map(v => v ?? 0);
            }
        }

        // bestMatch: ưu tiên best_match, fallback tính mean các nguồn có dữ liệu
        let bestMatch;
        if (bySource["best_match"]) {
            bestMatch = bySource["best_match"];
        } else {
            const sources = Object.values(bySource);
            if (sources.length === 0) {
                bestMatch = times.map(() => 0);
            } else {
                bestMatch = times.map((_, i) => {
                    const vals = sources.map(s => s[i] ?? 0);
                    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
                });
            }
        }

        const result = { times, bySource, bestMatch };
        _cache.set(cacheKey, { ts: Date.now(), data: result });
        return result;

    } catch (err) {
        console.error("[openMeteoApi] Fetch error:", err);
        return { times: [], bySource: {}, bestMatch: [] };
    }
}

/**
 * Chuyển kết quả Open-Meteo thành Map<fullLabel → rainValues>
 * để merge vào unifiedData của chart.
 *
 * @param {{ times: string[], bySource: object, bestMatch: number[] }} rainData
 * @returns {Map<string, { bestMatch: number, bySource: object }>}
 */
export function buildRainLabelMap(rainData) {
    const map = new Map();
    const { times, bySource, bestMatch } = rainData;
    times.forEach((iso, i) => {
        // ISO "2026-04-23T14:00" → "23/04/2026 14:00"
        const dt = new Date(iso);
        const dd   = dt.getDate().toString().padStart(2, "0");
        const mm   = (dt.getMonth() + 1).toString().padStart(2, "0");
        const yyyy = dt.getFullYear();
        const hh   = dt.getHours().toString().padStart(2, "0");
        const label = `${dd}/${mm}/${yyyy} ${hh}:00`;

        const srcVals = {};
        for (const [src, arr] of Object.entries(bySource)) {
            srcVals[src] = arr[i] ?? 0;
        }
        map.set(label, { bestMatch: bestMatch[i] ?? 0, bySource: srcVals });
    });
    return map;
}
