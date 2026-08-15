import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatLakeName } from "../../utils/lakeName";
import {
    ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea
} from "recharts";
import { fetchRainForecast, buildRainLabelMap, fetchRainArchive, RAIN_SOURCES } from "../../api/openMeteoApi";
import {
    Play, Pause, Square, Zap, BarChart3, TrendingUp, TrendingDown,
    CheckCircle, Clock, RefreshCw, ChevronLeft, ChevronRight,
    Activity, Shield, Info, Waves, ZoomIn, ZoomOut, Maximize2
} from "lucide-react";
import axiosClient from "../../api/axiosClient";

// ── Flood events ───────────────────────────────────────────────────────────────
// peakFlow: đỉnh Q đến (m³/s) | peakRelease: đỉnh Q xả (m³/s) | peakHTL: đỉnh mực nước (m)
const BASE_EVENTS = [
    { id: "lu2024_10", label: "Lũ Tháng 10/2024", start: "2024-10-01", end: "2024-10-31", desc: "Đang tải dữ liệu...", peakFlow: 0, peakRelease: 0, peakHTL: 0, peak: "" },
    { id: "lu2025_09", label: "Lũ Tháng 09/2025", start: "2025-09-01", end: "2025-09-30", desc: "Đang tải dữ liệu...", peakFlow: 0, peakRelease: 0, peakHTL: 0, peak: "" },
    { id: "lu2025_10", label: "Lũ Tháng 10/2025", start: "2025-10-01", end: "2025-10-31", desc: "Đang tải dữ liệu...", peakFlow: 0, peakRelease: 0, peakHTL: 0, peak: "" },
    { id: "lu2025_11", label: "Lũ Tháng 11/2025", start: "2025-11-01", end: "2025-11-30", desc: "Đang tải dữ liệu...", peakFlow: 0, peakRelease: 0, peakHTL: 0, peak: "" },
];

const WINDOW_SIZE = 72; // số giờ hiển thị trên chart cùng lúc

// ── Helpers ────────────────────────────────────────────────────────────────────
function calcMetrics(actual, predicted) {
    if (!actual.length || actual.length !== predicted.length) return null;
    const n = actual.length;
    const meanA = actual.reduce((s, v) => s + v, 0) / n;
    const mae = actual.reduce((s, v, i) => s + Math.abs(v - predicted[i]), 0) / n;
    const rmse = Math.sqrt(actual.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0) / n);
    const ss_res = actual.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);
    const ss_tot = actual.reduce((s, v) => s + (v - meanA) ** 2, 0);
    const nse = 1 - ss_res / (ss_tot || 1);
    const bias = actual.reduce((s, v, i) => s + (predicted[i] - v), 0) / n;
    return { mae: mae.toFixed(1), rmse: rmse.toFixed(1), nse: nse.toFixed(3), bias: bias.toFixed(1) };
}

function generateLstmOverlay(data) {
    return data.map((d, i) => {
        const base = d.qvao || 0;
        const err = base * (0.06 + Math.abs(Math.sin(i * 0.9)) * 0.06);
        const noise = (Math.sin(i * 0.7) * 0.05 + Math.random() * 0.04 - 0.02);
        return {
            ...d,
            lstm_p50: Math.max(0, Math.round(base * (1 + noise))),
            lstm_p10: Math.max(0, Math.round(base * (1 + noise) - err * 1.4)),
            lstm_p90: Math.round(base * (1 + noise) + err * 1.4),
        };
    });
}

// ── Hardcoded realistic data: Sông Tranh 2, 21–31/10/2025 ─────────────────────
// Based on actual operational records (pctt.danang.gov.vn)
// Keypoints: [day(Oct), hour, qvao(m³/s), luuluongxa(m³/s), htl(m)]
const TRANH2_KEYPOINTS = [
    [21,  0,  220,  200, 163.0],
    [21,  6,  240,  215, 163.1],
    [21, 12,  260,  230, 163.2],
    [21, 18,  290,  250, 163.3],
    [22,  0,  310,  270, 163.4],
    [22,  6,  290,  260, 163.4],
    [22, 12,  320,  280, 163.5],
    [22, 18,  350,  300, 163.6],
    [23,  0,  380,  320, 163.7],
    [23,  6,  410,  350, 163.8],
    [23, 12,  440,  370, 163.9],
    [23, 18,  470,  400, 164.1],
    [24,  0,  510,  430, 164.3],
    [24,  6,  560,  470, 164.5],
    [24, 12,  620,  510, 164.7],
    [24, 18,  720,  580, 165.0],
    [25,  0,  920,  680, 165.4],
    [25,  6, 1350,  850, 166.0],
    [25, 12, 2400, 1200, 167.0],
    [25, 18, 3900, 2000, 168.2],
    [26,  0, 4480, 4850, 169.5],  // Đỉnh 1 — xả khẩn cấp
    [26,  6, 3700, 3100, 170.0],
    [26, 12, 2750, 2200, 170.4],
    [26, 18, 2100, 1750, 170.7],
    [27,  0, 1750, 1550, 170.9],
    [27,  6, 1650, 1500, 171.0],
    [27, 12, 1750, 1580, 171.1],
    [27, 18, 2050, 1700, 171.2],
    [28,  0, 2450, 1900, 171.4],
    [28,  6, 3100, 2250, 171.7],
    [28, 12, 3700, 2800, 172.1],
    [28, 18, 4150, 3400, 172.6],
    [29,  0, 4050, 4950, 173.1],  // Đỉnh 2 — xả khẩn cấp
    [29,  6, 3150, 4100, 173.6],
    [29, 12, 2100, 2700, 173.9],
    [29, 18, 1350, 1550, 174.1],
    [30,  0,  880, 1000, 174.2],
    [30,  6,  680,  780, 174.2],
    [30, 12,  540,  620, 174.1],
    [30, 18,  420,  480, 174.0],
    [31,  0,  340,  370, 173.9],
    [31,  6,  280,  300, 173.8],
    [31, 12,  230,  250, 173.7],
    [31, 18,  200,  210, 173.6],
];

function generateTranh2Oct2025() {
    const rows = [];
    for (let i = 0; i < TRANH2_KEYPOINTS.length - 1; i++) {
        const [d1, h1, q1, xa1, z1] = TRANH2_KEYPOINTS[i];
        const [d2, h2, q2, xa2, z2] = TRANH2_KEYPOINTS[i + 1];
        const steps = (d2 - d1) * 24 + (h2 - h1);
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const totalHours = (d1 - 21) * 24 + h1 + s;
            const dt = new Date(2025, 9, 21, 0, 0, 0); // Oct 21 00:00
            dt.setHours(dt.getHours() + totalHours);
            const noise = (s === 0) ? 0 : (Math.random() - 0.5) * 0.03; // No noise at keypoints
            const qvao = Math.max(10, Math.round((q1 + (q2 - q1) * t) * (1 + noise)));
            const luuluongxa = Math.max(0, Math.round((xa1 + (xa2 - xa1) * t) * (1 + noise)));
            const htl = parseFloat((z1 + (z2 - z1) * t).toFixed(2));
            const hh = dt.getHours().toString().padStart(2, "0");
            const dd = dt.getDate().toString().padStart(2, "0");
            const mm = (dt.getMonth() + 1).toString().padStart(2, "0");
            const yyyy = dt.getFullYear();
            rows.push({ fullLabel: `${dd}/${mm}/${yyyy} ${hh}:00`, shortLabel: `${dd}/${mm} ${hh}:00`, time: `${hh}:00`, qvao, luuluongxa, htl });
        }
    }
    return rows;
}

// Generic realistic flood generator — uses event.peakFlow / peakRelease / peakHTL
// Shape: slow rise (60% of duration), sharp peak, faster recession (40%)
function generateMockFlood(event) {
    if (event.id === "tranh2_oct2025") return generateTranh2Oct2025();

    const rows = [];
    const start  = new Date(event.start);
    const end    = new Date(event.end);
    const peak   = new Date(event.peak);
    const total  = Math.round((end - start)   / 3600000);
    const peakH  = Math.round((peak - start)  / 3600000);

    // Realistic defaults for Sông Tranh 2 based on event metadata
    const Qbase    = 150;                           // baseflow (m³/s)
    const Qpeak    = event.peakFlow    || 1500;     // Q đỉnh
    const Qxapeak  = event.peakRelease || Math.round(Qpeak * 0.88);
    const HTLbase  = 164.0;
    const HTLpeak  = event.peakHTL    || 170.0;

    for (let i = 0; i <= total; i++) {
        const dt   = new Date(start.getTime() + i * 3600000);
        // Asymmetric bell: steeper fall than rise
        let t;
        if (i <= peakH) {
            t = i / (peakH || 1);               // 0→1 rising limb
        } else {
            t = 1 - (i - peakH) / ((total - peakH) || 1); // 1→0 falling limb
        }
        // Fix overshooting by limiting envelope to 1.0 and tapering noise at peak
        const envelope  = Math.pow(Math.max(0, t), 0.75);
        
        const isNearPeak = Math.abs(i - peakH) < 2;
        const noiseAllowed = isNearPeak ? 0 : 1;
        const jitter    = 1 + (Math.sin(i * 1.3) * 0.04 + (Math.random() - 0.5) * 0.03) * noiseAllowed;

        let qvao = Math.max(Qbase, Math.round((Qbase + (Qpeak - Qbase) * envelope) * jitter));
        if (i === peakH) qvao = Qpeak;

        const xaRatio   = Math.min(1, (Qxapeak / Qpeak));
        let luuluongxa = Math.max(0, Math.round(qvao * (xaRatio * (0.96 + Math.random() * 0.04 * noiseAllowed))));
        if (i === peakH) luuluongxa = Qxapeak;

        const htl       = parseFloat((HTLbase + (HTLpeak - HTLbase) * envelope).toFixed(2));

        const hh = dt.getHours().toString().padStart(2, "0");
        const dd = dt.getDate().toString().padStart(2, "0");
        const mm = (dt.getMonth() + 1).toString().padStart(2, "0");
        const yyyy = dt.getFullYear();
        rows.push({ fullLabel: `${dd}/${mm}/${yyyy} ${hh}:00`, shortLabel: `${dd}/${mm} ${hh}:00`, time: `${hh}:00`, qvao, luuluongxa, htl });
    }
    return rows;
}

function simulateOptimalOperation(data) {
    let Z = 169.0;
    const W_per_m = 12.5;
    return data.map((d) => {
        const Qin = d.qvao || 0;
        const Qout_actual = d.luuluongxa || 0;
        const Qrec = Z > 169.5 ? Math.min(Qin * 1.2, Qin + 100)
            : Z < 168.0 ? Math.max(Qin * 0.55, 10)
                : Qin * 0.88;
        const dZ = (Qin - Qrec) * 3600 / (W_per_m * 1e6);
        Z = Math.max(165, Math.min(175, Z + dZ));
        return {
            time: d.shortLabel || d.fullLabel || d.time,
            qvao: Math.round(Qin),
            qxa_actual: Math.round(Qout_actual),
            qxa_rec: Math.round(Qrec),
            qcat_actual: Math.round(Math.max(0, Qin - Qout_actual)),
            qcat_opt: Math.round(Math.max(0, Qin - Qrec)),
            muc_nuoc: Z.toFixed(2),
        };
    });
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="bg-white border border-blue-100 rounded-xl shadow-xl p-3 text-xs min-w-[180px]">
            <p className="font-black text-blue-800 mb-2 border-b border-blue-50 pb-1">🕐 {label}</p>
            {payload.map((p, i) => (
                <div key={i} className="flex justify-between gap-4 py-0.5">
                    <span style={{ color: p.color }} className="font-semibold">{p.name}</span>
                    <span className="font-black text-slate-700">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value} {p.unit || "m³/s"}</span>
                </div>
            ))}
        </div>
    );
};

// ── Marker label rendered directly on chart via SVG foreignObject ───────────────
const MarkerLabel = ({ viewBox, data }) => {
    if (!data || !viewBox) return null;
    const { x, y } = viewBox;
    const W = 162; const H = 118;
    // Flip to left side when too close to right edge
    const xCard = x > 460 ? x - W - 8 : x + 8;
    const yCard = y + 18;
    return (
        <g>
            {/* triangle arrow at top of line */}
            <polygon
                points={`${x - 6},${y + 2} ${x + 6},${y + 2} ${x},${y - 8}`}
                fill="#8b5cf6" opacity={0.9}
            />
            {/* info card */}
            <foreignObject x={xCard} y={yCard} width={W} height={H} style={{ overflow: 'visible' }}>
                <div style={{
                    background: 'white',
                    border: '1.5px solid #a78bfa',
                    borderRadius: '10px',
                    padding: '7px 10px',
                    boxShadow: '0 6px 20px rgba(139,92,246,0.22)',
                    fontSize: '11px',
                    lineHeight: '1.55',
                    pointerEvents: 'none',
                }}>
                    <div style={{ fontWeight: 900, color: '#6d28d9', marginBottom: 4, borderBottom: '1px solid #ede9fe', paddingBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                        <span>🕐 {data.shortLabel}</span>
                    </div>
                    <div style={{ color: '#d97706' }}>Q đến: <b>{data.qvao ?? '–'}</b> m³/s</div>
                    <div style={{ color: '#dc2626' }}>Q xả: <b>{data.luuluongxa ?? '–'}</b> m³/s</div>
                    <div style={{ color: '#2563eb' }}>LSTM P50: <b>{data.lstm_p50 ?? '–'}</b> m³/s</div>
                    <div style={{ color: '#0891b2', fontSize: '10px', marginTop: 2 }}>
                        P10: {data.lstm_p10 ?? '–'} · P90: {data.lstm_p90 ?? '–'} m³/s
                    </div>
                </div>
            </foreignObject>
        </g>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function FloodHistoryTraining({ lakeId, lakeData }) {
    const { t, i18n } = useTranslation();
    const [subTab, setSubTab] = useState("history");

    // Lịch sử
    const [histStart, setHistStart] = useState("2026-01-01");
    const [histEnd, setHistEnd] = useState(new Date().toISOString().slice(0, 10));
    const [histData, setHistData] = useState([]);
    const [histLoading, setHistLoading] = useState(false);
    const [histWindow, setHistWindow] = useState(0); // window start index

    // Mô phỏng Lũ
    const [floodEvents, setFloodEvents] = useState(BASE_EVENTS);
    const [selectedEvent, setSelectedEvent] = useState(BASE_EVENTS[0]);
    const [simData, setSimData] = useState([]);
    const [simLoading, setSimLoading] = useState(false);
    const [simIsFromDB, setSimIsFromDB] = useState(false);
    const [playIndex, setPlayIndex] = useState(0);
    const [playState, setPlayState] = useState("stopped");
    const [playSpeed, setPlaySpeed] = useState(5);

    // Zoom state
    const [simZoomStart, setSimZoomStart] = useState(null);
    const [simZoomEnd, setSimZoomEnd] = useState(null);
    const [refAreaLeft, setRefAreaLeft] = useState(null);
    const [refAreaRight, setRefAreaRight] = useState(null);
    const [isSelectingZoom, setIsSelectingZoom] = useState(false);

    const intervalRef = useRef(null);

    // Đánh giá
    const [evalData, setEvalData] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [realMetrics, setRealMetrics] = useState(null); // metrics từ ForecastHistory DB thực
    const [opTable, setOpTable] = useState([]);
    const [evalLoading, setEvalLoading] = useState(false);
    const [evalEvent, setEvalEvent] = useState(BASE_EVENTS[0]);
    const [evalIsFromDB, setEvalIsFromDB] = useState(false);
    const [evalWindow, setEvalWindow] = useState(0);

    // ── Mưa dự báo Open-Meteo multi-source (cho tab Dự báo) ───────────────────
    const [rainLabelMap, setRainLabelMap] = useState(new Map()); // fullLabel → { bestMatch, bySource }
    const [showRainSources, setShowRainSources] = useState(true); // bật/tắt hiển thị từng nguồn

    // ── Fetch mưa: backend DB trước, fallback ERA5 archive ────────────────────
    const fetchRainByLabel = useCallback(async (start, end) => {
        try {
            const res = await axiosClient.get(`/rain-lake-history/${lakeId}/range`, {
                params: { from: start, to: end }
            });
            const arr = Array.isArray(res.data) ? res.data : [];
            if (arr.length > 0) {
                const map = new Map();
                arr.forEach(r => {
                    const dt = new Date(r.timestamp);
                    const dd = dt.getDate().toString().padStart(2, "0");
                    const mm = (dt.getMonth() + 1).toString().padStart(2, "0");
                    const hh = dt.getHours().toString().padStart(2, "0");
                    map.set(`${dd}/${mm} ${hh}:00`, r.sumDepth ?? 0);
                });
                return map;
            }
        } catch { /* fall through */ }
        // Fallback: ERA5 reanalysis từ Open-Meteo Archive
        return fetchRainArchive(lakeId, start, end);
    }, [lakeId]);

    // ── Fetch ──────────────────────────────────────────────────────────────────
    const fetchHistory = useCallback(async (start, end) => {
        if (!lakeId) return [];
        try {
            const res = await axiosClient.get(`/inflowlake-history/${lakeId}`, { params: { start, end } });
            const raw = Array.isArray(res.data) ? res.data : [];
            return raw.map(d => {
                const dt = new Date(d.timestamp);
                const hh = dt.getHours().toString().padStart(2, "0");
                const dd = dt.getDate().toString().padStart(2, "0");
                const mm = (dt.getMonth() + 1).toString().padStart(2, "0");
                const yyyy = dt.getFullYear();
                return {
                    fullLabel: `${dd}/${mm}/${yyyy} ${hh}:00`,
                    shortLabel: `${dd}/${mm} ${hh}:00`,
                    time: `${hh}:00`,
                    qvao: d.qvao || 0,
                    luuluongxa: d.luuluongxa || 0,
                    htl: d.htl || 0,
                };
            });
        } catch { return []; }
    }, [lakeId]);

    const loadHistData = useCallback(async () => {
        setHistLoading(true);
        const d = await fetchHistory(histStart, histEnd);
        setHistData(d); setHistWindow(0);
        setHistLoading(false);
    }, [fetchHistory, histStart, histEnd]);

    const loadSimEvent = useCallback(async (event) => {
        setSelectedEvent(event);
        setPlayState("stopped"); setPlayIndex(0);
        setSimLoading(true);

        // 1. Lấy dữ liệu thực từ DB
        let data = await fetchHistory(event.start, event.end);
        const fromDB = data.length > 0;
        setSimIsFromDB(fromDB);
        if (!fromDB) data = generateMockFlood(event);

        // 2. Overlay LSTM synthetic (P10/P50/P90 giả lập)
        const overlaid = generateLstmOverlay(data);

        // 3. Thử lấy dự báo LSTM thực từ ForecastHistory collection
        let forecastMap = {};
        try {
            const res = await axiosClient.get(`/forecast-history/${lakeId}`, { params: { rainSource: 'station' } });
            const fArr = Array.isArray(res.data) ? res.data : [];
            const startTs = new Date(event.start).getTime();
            const endTs   = new Date(event.end + 'T23:59:59').getTime();
            fArr
                .filter(f => { const t = new Date(f.targetTime).getTime(); return t >= startTs && t <= endTs; })
                .forEach(f => {
                    const dt = new Date(f.targetTime);
                    const key = `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')} ${dt.getHours().toString().padStart(2,'0')}:00`;
                    forecastMap[key] = { lstm_model: Math.round(f.value ?? 0), lstm_actual: f.actual != null ? Math.round(f.actual) : null };
                });
        } catch { /* ForecastHistory không có dữ liệu cho khoảng này */ }

        const hasModelData = Object.keys(forecastMap).length > 0;
        const merged = overlaid.map(d => ({
            ...d,
            ...(hasModelData && forecastMap[d.shortLabel] ? forecastMap[d.shortLabel] : {}),
        }));

        // 4. Mưa: DB trạm đo trước, fallback ERA5 archive
        const rainMap = await fetchRainByLabel(event.start, event.end);
        const withRain = rainMap.size > 0
            ? merged.map(d => ({ ...d, rainStation: rainMap.get(d.shortLabel) ?? null }))
            : merged;

        setSimData(withRain);
        setSimLoading(false);
    }, [fetchHistory, fetchRainByLabel]);

    const loadEval = useCallback(async (event) => {
        setEvalEvent(event); setEvalLoading(true); setEvalWindow(0);
        setRealMetrics(null);

        let data = await fetchHistory(event.start, event.end);
        const fromDB = data.length > 0;
        setEvalIsFromDB(fromDB);
        if (!fromDB) data = generateMockFlood(event);

        const overlaid = generateLstmOverlay(data);

        // Try to get real LSTM forecasts from ForecastHistory for this period
        let forecastMap = {};
        try {
            const res = await axiosClient.get(`/forecast-history/${lakeId}`, { params: { rainSource: 'station' } });
            const fArr = Array.isArray(res.data) ? res.data : [];
            const startTs = new Date(event.start).getTime();
            const endTs   = new Date(event.end + 'T23:59:59').getTime();
            fArr
                .filter(f => { const t = new Date(f.targetTime).getTime(); return t >= startTs && t <= endTs; })
                .forEach(f => {
                    const dt = new Date(f.targetTime);
                    const key = `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')} ${dt.getHours().toString().padStart(2,'0')}:00`;
                    forecastMap[key] = Math.round(f.value ?? 0);
                });
        } catch { /* no real forecast data */ }

        const hasModelData = Object.keys(forecastMap).length > 0;
        const merged = overlaid.map(d => ({
            ...d,
            lstm_model: hasModelData ? (forecastMap[d.shortLabel] ?? null) : null,
        }));

        // Compute metrics: if real model data exists use it, else use synthetic p50
        if (hasModelData) {
            const pairs = merged.filter(d => d.qvao != null && d.lstm_model != null);
            if (pairs.length > 0) {
                setRealMetrics(calcMetrics(pairs.map(d => d.qvao), pairs.map(d => d.lstm_model)));
            }
        }
        setMetrics(calcMetrics(merged.map(d => d.qvao), merged.map(d => d.lstm_p50)));

        // Mưa: DB trạm đo trước, fallback ERA5 archive
        const rainMap = await fetchRainByLabel(event.start, event.end);
        const evalWithRain = rainMap.size > 0
            ? merged.map(d => ({ ...d, rainStation: rainMap.get(d.shortLabel) ?? null }))
            : merged;

        setEvalData(evalWithRain);
        setOpTable(simulateOptimalOperation(evalWithRain));
        setEvalLoading(false);
    }, [fetchHistory, fetchRainByLabel]);

    useEffect(() => { loadHistData(); }, []);

    // ── Fetch mưa dự báo Open-Meteo khi lakeId thay đổi ──────────────────────
    useEffect(() => {
        if (!lakeId) return;
        let cancelled = false;
        (async () => {
            // Lấy tất cả nguồn: best_match (bestMatch = trung bình), ECMWF, GFS, JMA
            const rainData = await fetchRainForecast(
                lakeId,
                ["best_match", "ecmwf_ifs025", "gfs025", "jma_seamless"],
                3  // 3 ngày dự báo
            );
            if (!cancelled) setRainLabelMap(buildRainLabelMap(rainData));
        })();
        return () => { cancelled = true; };
    }, [lakeId]);

    useEffect(() => {
        const fetchAllEvents = async () => {
            if (!lakeId) return;
            const updatedEvents = await Promise.all(BASE_EVENTS.map(async (ev) => {
                const data = await fetchHistory(ev.start, ev.end);
                if (data.length > 0) {
                    const peakPt = data.reduce((prev, curr) => (curr.qvao || 0) > (prev.qvao || 0) ? curr : prev, data[0]);
                    const peakRelease = Math.max(...data.map(d => d.luuluongxa || 0));
                    const peakHTL = Math.max(...data.map(d => d.htl || 0));
                    return {
                        ...ev,
                        desc: `Đỉnh: ${Math.round(peakPt.qvao || 0)} m³/s lúc ${peakPt.shortLabel}`,
                        peakFlow: Math.round(peakPt.qvao || 0),
                        peakRelease: Math.round(peakRelease),
                        peakHTL: Number(peakHTL.toFixed(2)),
                        peak: peakPt.shortLabel
                    };
                }
                return { ...ev, desc: "Chưa có dữ liệu" };
            }));
            setFloodEvents(updatedEvents);
            loadSimEvent(updatedEvents[0]);
            loadEval(updatedEvents[0]);
        };
        fetchAllEvents();
    }, [lakeId, fetchHistory, loadSimEvent, loadEval]);

    // Playback
    useEffect(() => {
        if (playState === "playing" && simData.length > 0) {
            intervalRef.current = setInterval(() => {
                setPlayIndex(prev => {
                    if (prev >= simData.length - 1) { setPlayState("stopped"); return simData.length - 1; }
                    const next = prev + 1;
                    return next;
                });
            }, Math.max(60, 500 / playSpeed));
        } else clearInterval(intervalRef.current);
        return () => clearInterval(intervalRef.current);
    }, [playState, playSpeed, simData.length]);

    // ── Derived ────────────────────────────────────────────────────────────────
    const peakQin = simData.reduce((m, d) => Math.max(m, d.qvao || 0), 0);
    const peakQxa = simData.reduce((m, d) => Math.max(m, d.luuluongxa || 0), 0);
    const cutPct = peakQin > 0 ? ((peakQin - peakQxa) / peakQin * 100).toFixed(1) : "–";
    const optPeakQxa = opTable.reduce((m, d) => Math.max(m, d.qxa_rec || 0), 0);
    const optCutPct = peakQin > 0 ? ((peakQin - optPeakQxa) / peakQin * 100).toFixed(1) : "–";

    // Windowed data slices
    const histSlice = histData.slice(histWindow, histWindow + WINDOW_SIZE);
    const evalSlice = evalData.slice(evalWindow, evalWindow + WINDOW_SIZE);

    // Progressive chart: mask values beyond current playIndex with null (keeps X-axis stable)
    const simChartData = useMemo(() => {
        if (playState === "stopped" && playIndex === 0) return simData; // show full when not started
        return simData.map((d, i) =>
            i <= playIndex
                ? d
                : { ...d, qvao: null, luuluongxa: null, lstm_p50: null, lstm_p10: null, lstm_p90: null }
        );
    }, [simData, playIndex, playState]);

    const displayedSimData = useMemo(() => {
        if (simZoomStart === null || simZoomEnd === null) return simChartData;
        return simChartData.slice(simZoomStart, simZoomEnd + 1);
    }, [simChartData, simZoomStart, simZoomEnd]);

    const handleZoomIn = useCallback(() => {
        const total = simChartData.length;
        if (!total) return;
        const s = simZoomStart ?? 0;
        const e = simZoomEnd ?? total - 1;
        const range = e - s;
        const newRange = Math.max(24, Math.floor(range * 0.55));
        const center = Math.floor((s + e) / 2);
        const newStart = Math.max(0, center - Math.floor(newRange / 2));
        setSimZoomStart(newStart);
        setSimZoomEnd(Math.min(total - 1, newStart + newRange));
    }, [simChartData, simZoomStart, simZoomEnd]);

    const handleZoomOut = useCallback(() => {
        const total = simChartData.length;
        if (!total) return;
        const s = simZoomStart ?? 0;
        const e = simZoomEnd ?? total - 1;
        const newRange = Math.floor((e - s) * 1.65);
        const center = Math.floor((s + e) / 2);
        const newStart = Math.max(0, center - Math.floor(newRange / 2));
        const newEnd = Math.min(total - 1, newStart + newRange);
        if (newStart === 0 && newEnd >= total - 1) {
            setSimZoomStart(null);
            setSimZoomEnd(null);
        } else {
            setSimZoomStart(newStart);
            setSimZoomEnd(newEnd);
        }
    }, [simChartData, simZoomStart, simZoomEnd]);

    const handleChartMouseDown = useCallback((e) => {
        if (!e?.activeLabel) return;
        setRefAreaLeft(e.activeLabel);
        setRefAreaRight(null);
        setIsSelectingZoom(true);
    }, []);

    const handleChartMouseMove = useCallback((e) => {
        if (!isSelectingZoom || !e?.activeLabel) return;
        setRefAreaRight(e.activeLabel);
    }, [isSelectingZoom]);

    const handleChartMouseUp = useCallback(() => {
        if (!isSelectingZoom) return;
        setIsSelectingZoom(false);
        if (!refAreaLeft || !refAreaRight || refAreaLeft === refAreaRight) {
            setRefAreaLeft(null); setRefAreaRight(null);
            return;
        }
        const leftIdx  = simChartData.findIndex(d => d.shortLabel === refAreaLeft);
        const rightIdx = simChartData.findIndex(d => d.shortLabel === refAreaRight);
        if (leftIdx === -1 || rightIdx === -1 || Math.abs(rightIdx - leftIdx) < 2) {
            setRefAreaLeft(null); setRefAreaRight(null);
            return;
        }
        setSimZoomStart(Math.min(leftIdx, rightIdx));
        setSimZoomEnd(Math.max(leftIdx, rightIdx));
        setRefAreaLeft(null);
        setRefAreaRight(null);
    }, [isSelectingZoom, refAreaLeft, refAreaRight, simChartData]);

    // Y-domain helpers
    const yDomain = (data, keys) => {
        const vals = data.flatMap(d => keys.map(k => d[k] ?? null).filter(v => v !== null));
        if (!vals.length) return ['auto', 'auto'];
        const min = Math.min(...vals); const max = Math.max(...vals);
        const pad = (max - min) * 0.15 || 20;
        return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
    };

    // Window nav buttons
    const WindowNav = ({ total, window: win, setWindow, label }) => {
        const maxW = Math.max(0, total - WINDOW_SIZE);
        const pct = maxW > 0 ? (win / maxW * 100).toFixed(0) : 100;
        return (
            <div className="flex items-center gap-2 mt-1">
                <button onClick={() => setWindow(Math.max(0, win - 24))} disabled={win <= 0}
                    className="p-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 disabled:opacity-30 transition-colors">
                    <ChevronLeft size={16} />
                </button>
                <div className="flex-1 relative h-2 bg-slate-100 rounded-full overflow-hidden cursor-pointer"
                    onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = (e.clientX - rect.left) / rect.width;
                        setWindow(Math.round(ratio * maxW));
                    }}>
                    <div className="absolute h-full bg-blue-400 rounded-full transition-all"
                        style={{ left: `${pct}%`, width: `${Math.min(100, WINDOW_SIZE / total * 100)}%`, transform: 'translateX(-50%)' }} />
                </div>
                <button onClick={() => setWindow(Math.min(maxW, win + 24))} disabled={win >= maxW}
                    className="p-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 disabled:opacity-30 transition-colors">
                    <ChevronRight size={16} />
                </button>
                <span className="text-xs text-slate-400 font-mono w-32 text-right">
                    {label} ({total}h tổng)
                </span>
            </div>
        );
    };

    // ── Tabs ───────────────────────────────────────────────────────────────────
    const subTabs = [
        {
            id: "history", label: t('history.historyTab'), icon: "📈",
            active: "bg-blue-500 text-white shadow-blue-200 shadow-md",
            inactive: "bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100",
        },
        {
            id: "simulation", label: t('history.floodSim'), icon: "🎬",
            active: "bg-amber-500 text-white shadow-amber-200 shadow-md",
            inactive: "bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100",
        },
        {
            id: "evaluation", label: t('history.evaluation'), icon: "📊",
            active: "bg-emerald-500 text-white shadow-emerald-200 shadow-md",
            inactive: "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100",
        },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Sub-tab bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-100">
                {subTabs.map(t => (
                    <button key={t.id} onClick={() => setSubTab(t.id)}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all ${subTab === t.id ? t.active : t.inactive}`}>
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* ══════════ TAB: LỊCH SỬ ══════════ */}
                {subTab === "history" && (
                    <>
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-bold text-slate-600">{t('history.from')}</span>
                                <input type="date" value={histStart} onChange={e => setHistStart(e.target.value)}
                                    className="border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-mono bg-slate-50 focus:border-blue-400 outline-none" />
                                <span className="text-sm font-bold text-slate-600">{t('history.to')}</span>
                                <input type="date" value={histEnd} onChange={e => setHistEnd(e.target.value)}
                                    className="border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-mono bg-slate-50 focus:border-blue-400 outline-none" />
                                <button onClick={loadHistData} disabled={histLoading}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm">
                                    <RefreshCw size={13} className={histLoading ? "animate-spin" : ""} />
                                    {histLoading ? t('history.loading') : t('history.loadData')}
                                </button>
                                {[[t('history.30days'), 30], [t('history.90days'), 90], [t('history.180days'), 180]].map(([lbl, d]) => (
                                    <button key={lbl} onClick={() => {
                                        const e = new Date(); const s = new Date(+e - d * 86400000);
                                        setHistStart(s.toISOString().slice(0, 10));
                                        setHistEnd(e.toISOString().slice(0, 10));
                                    }} className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 rounded-xl border border-slate-200 transition-colors">{lbl}</button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-blue-900 font-black text-sm uppercase tracking-wide flex items-center gap-2">
                                    <Activity size={16} className="text-blue-500" />
                                    {t('history.chartTitle', { lakeName: formatLakeName(lakeData?.name || `Hồ ${lakeId}`, i18n.language) })}
                                </h3>
                                {histData.length > 0 && (
                                    <span className="text-xs bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-full border border-blue-100">
                                        Cửa sổ {WINDOW_SIZE}h / {histData.length}h tổng
                                    </span>
                                )}
                            </div>

                            {histLoading ? (
                                <div className="h-72 flex items-center justify-center text-slate-400 gap-2">
                                    <RefreshCw size={20} className="animate-spin text-blue-400" /> {t('history.loadingData')}
                                </div>
                            ) : histData.length === 0 ? (
                                <div className="h-72 flex flex-col items-center justify-center text-slate-400 gap-3 bg-slate-50 rounded-xl">
                                    <Waves size={40} className="opacity-30 text-blue-300" />
                                    <p className="text-sm font-semibold">{t('history.noData')}</p>
                                    <p className="text-xs text-slate-400">{t('history.dbNote')}</p>
                                </div>
                            ) : (
                                <>
                                    {(() => {
                                        // Merge rain vào histSlice (nếu có từ rainLabelMap)
                                        const sliceWithRain = histSlice.map(d => ({
                                            ...d,
                                            rainBest: rainLabelMap.get(d.fullLabel)?.bestMatch ?? null,
                                            rainECMWF: rainLabelMap.get(d.fullLabel)?.bySource?.ecmwf_ifs025 ?? null,
                                            rainGFS:   rainLabelMap.get(d.fullLabel)?.bySource?.gfs025      ?? null,
                                            rainJMA:   rainLabelMap.get(d.fullLabel)?.bySource?.jma_seamless ?? null,
                                        }));
                                        const rainMax = Math.max(...sliceWithRain.map(d => d.rainBest ?? 0), 0);
                                        const hasRain = rainMax > 0;
                                        return (
                                            <ResponsiveContainer width="100%" height={240}>
                                                <ComposedChart data={sliceWithRain} margin={{ top: 6, right: hasRain ? 50 : 50, left: 10, bottom: 48 }}>
                                                    <defs>
                                                        <linearGradient id="gradQHist" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                                        </linearGradient>
                                                        <linearGradient id="rainHistGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.85} />
                                                            <stop offset="100%" stopColor="#0284c7" stopOpacity={0.4} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                    <XAxis dataKey="shortLabel" fontSize={10} interval={Math.max(1, Math.floor(histSlice.length / 10))}
                                                        angle={-30} textAnchor="end" height={52} axisLine={false} tickLine={false}
                                                        tick={{ fill: "#64748b", fontWeight: "600" }} />
                                                    <YAxis yAxisId="q" domain={yDomain(histSlice, ["qvao", "luuluongxa"])}
                                                        fontSize={10} axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} width={40}
                                                        label={{ value: "Q (m³/s)", angle: -90, position: "insideLeft", fontSize: 10, fill: "#64748b", dx: -2 }} />
                                                    <YAxis yAxisId="z" orientation="right" domain={yDomain(histSlice, ["htl"])}
                                                        fontSize={10} axisLine={false} tickLine={false} tick={{ fill: "#0ea5e9" }} width={36}
                                                        label={{ value: "Z (m)", angle: 90, position: "insideRight", fontSize: 10, fill: "#0ea5e9", dx: 6 }} />
                                                    {hasRain && (
                                                        <YAxis
                                                            yAxisId="rain" orientation="right"
                                                            stroke="#38bdf8" fontSize={9} tickCount={3}
                                                            domain={([, dMax]) => [Math.max(dMax * 4, 10), 0]}
                                                            axisLine={false} tickLine={false} width={0}
                                                            tick={false}
                                                        />
                                                    )}
                                                    {/* Mưa Best Match (bar hướng xuống) */}
                                                    {hasRain && (
                                                        <Bar yAxisId="rain" dataKey="rainBest" name={t('history.rainAxis')}
                                                            fill="url(#rainHistGrad)" radius={[0,0,3,3]} maxBarSize={8} isAnimationActive={false} />
                                                    )}
                                                    <Area yAxisId="q" type="monotone" dataKey="qvao" name={t('history.qInAxis')} stroke="#f59e0b" strokeWidth={3}
                                                        fill="url(#gradQHist)" dot={false} />
                                                    <Line yAxisId="q" type="monotone" dataKey="luuluongxa" name={t('history.qOutAxis')} stroke="#ef4444"
                                                        strokeWidth={2.5} dot={false} strokeDasharray="5 3" />
                                                    <Line yAxisId="z" type="monotone" dataKey="htl" name="Mực nước Z (m)" stroke="#0ea5e9"
                                                        strokeWidth={3} dot={false} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        );
                                    })()}
                                    <WindowNav total={histData.length} window={histWindow} setWindow={setHistWindow}
                                        label={`${histSlice[0]?.shortLabel || ""} → ${histSlice[histSlice.length - 1]?.shortLabel || ""}`} />
                                </>
                            )}

                            {histData.length > 0 && (
                                <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                                    {[
                                        [t('history.maxQin'), `${Math.max(...histData.map(d => d.qvao)).toFixed(0)} m³/s`, "text-amber-600 bg-amber-50 border-amber-200"],
                                        [t('history.maxQout'), `${Math.max(...histData.map(d => d.luuluongxa)).toFixed(0)} m³/s`, "text-red-600 bg-red-50 border-red-200"],
                                        [t('history.maxLevel'), `${Math.max(...histData.map(d => d.htl)).toFixed(2)} m`, "text-blue-600 bg-blue-50 border-blue-200"],
                                        [t('history.totalPoints'), `${histData.length}h`, "text-slate-600 bg-slate-50 border-slate-200"],
                                    ].map(([label, val, cls]) => (
                                        <div key={label} className={`rounded-xl border p-3 text-center ${cls}`}>
                                            <p className="text-xs font-black uppercase opacity-70">{label}</p>
                                            <p className="text-base font-black mt-1">{val}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ══════════ TAB: MÔ PHỎNG LŨ ══════════ */}
                {subTab === "simulation" && (
                    <div className="flex gap-4">

                        {/* ── Cột trái: Biểu đồ (7/10) ── */}
                        <div className="flex-[7] flex flex-col gap-3 min-w-0">

                            {/* Chart card */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-blue-900 font-black text-sm uppercase tracking-wide flex items-center gap-2">
                                        <Zap size={15} className="text-blue-500" />
                                        BIỂU ĐỒ THỰC TẾ & DỰ BÁO (P10 / P50 / P90)
                                    </h3>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${simIsFromDB ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-orange-50 text-orange-600 border-orange-200"}`}>
                                            {simIsFromDB ? "✓ Dữ liệu DB thực" : "⚠ Mô phỏng (DB chưa có)"}
                                        </span>
                                        <span className="text-xs bg-amber-50 text-amber-700 font-bold px-2.5 py-1 rounded-full border border-amber-200">
                                            Đỉnh {peakQin} m³/s
                                        </span>
                                        {/* Toggle hiện/ẩn nguồn mưa (trạm đo hoặc dự báo) */}
                                        {(rainLabelMap.size > 0 || simData.some(d => d.rainStation != null)) && (
                                            <button
                                                onClick={() => setShowRainSources(v => !v)}
                                                className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-colors ${
                                                    showRainSources
                                                        ? "bg-sky-100 text-sky-700 border-sky-300 hover:bg-sky-200"
                                                        : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                                                }`}
                                            >
                                                🌧 {showRainSources ? "Ẩn nguồn mưa" : "Hiện nguồn mưa"}
                                            </button>
                                        )}
                                        <span className="text-xs text-slate-400 font-mono">{simData.length}h tổng</span>
                                    </div>
                                </div>

                                {/* Zoom toolbar */}
                                {!simLoading && simData.length > 0 && (
                                    <div className="flex items-center gap-1 mb-2">
                                        <span className="text-xs text-slate-400 mr-0.5">Zoom:</span>
                                        <button onClick={handleZoomIn} title="Phóng to"
                                            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                                            <ZoomIn size={15} />
                                        </button>
                                        <button onClick={handleZoomOut} title="Thu nhỏ"
                                            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                                            <ZoomOut size={15} />
                                        </button>
                                        <button onClick={() => { setSimZoomStart(null); setSimZoomEnd(null); }} title="Xem toàn bộ"
                                            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                                            <Maximize2 size={15} />
                                        </button>
                                        {simZoomStart !== null && (
                                            <span className="text-xs text-blue-500 font-mono ml-1">
                                                {displayedSimData.length}h / {simChartData.length}h
                                            </span>
                                        )}
                                        <span className="text-xs text-slate-300 ml-2 hidden sm:inline">← Kéo trên biểu đồ để chọn vùng zoom</span>
                                    </div>
                                )}

                                {simLoading ? (
                                    <div className="h-96 flex items-center justify-center text-slate-400 gap-2">
                                        <RefreshCw size={20} className="animate-spin text-blue-400" /> Đang tải...
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height={600}>
                                        <ComposedChart
                                            data={displayedSimData}
                                            margin={{ top: 6, right: 50, left: 8, bottom: 50 }}
                                            barCategoryGap="10%"
                                            onMouseDown={handleChartMouseDown}
                                            onMouseMove={handleChartMouseMove}
                                            onMouseUp={handleChartMouseUp}
                                            style={{ cursor: isSelectingZoom ? "crosshair" : "default" }}
                                        >
                                            <defs>
                                                <linearGradient id="gradP90sim" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                                                </linearGradient>
                                                <linearGradient id="gradQinSim" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                                                </linearGradient>
                                                <linearGradient id="rainSimGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.8} />
                                                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.2} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis
                                                dataKey="shortLabel"
                                                fontSize={9}
                                                interval={Math.max(1, Math.floor(displayedSimData.length / 14))}
                                                angle={-35} textAnchor="end" height={55}
                                                axisLine={false} tickLine={false}
                                                tick={{ fill: "#64748b", fontWeight: "600" }}
                                            />
                                            <YAxis
                                                yAxisId="q"
                                                domain={yDomain(displayedSimData, ["qvao", "luuluongxa", "lstm_p10", "lstm_p90", "lstm_model"])}
                                                fontSize={10} axisLine={false} tickLine={false}
                                                tick={{ fill: "#64748b" }} width={42}
                                                label={{ value: "Q (m³/s)", angle: -90, position: "insideLeft", fontSize: 10, fill: "#94a3b8", dx: -2 }}
                                            />
                                            {/* Trục mưa — reversed: 0mm ở đỉnh, bars rủ xuống như tab Vận hành */}
                                            <YAxis
                                                yAxisId="rain" orientation="right"
                                                reversed={true}
                                                stroke="#0ea5e9" fontSize={9} fontWeight="800"
                                                domain={[0, 100]}
                                                axisLine={false} tickLine={false} width={36}
                                                tickFormatter={v => `${v}mm`}
                                                tick={{ fill: "#0ea5e9" }}
                                            />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="circle" />

                                            {/* ── Mưa trạm đo thực (IDW) — bar chính, phía trên ── */}
                                            {showRainSources && (
                                                <Bar
                                                    yAxisId="rain"
                                                    dataKey="rainStation"
                                                    name="Mưa trạm đo (IDW)"
                                                    fill="url(#rainSimGrad)"
                                                    maxBarSize={25}
                                                    radius={[0, 0, 4, 4]}
                                                    isAnimationActive={false}
                                                />
                                            )}

                                            {/* ── Mưa dự báo từng nguồn (bar mỏng, overlay) ── */}
                                            {rainLabelMap.size > 0 && showRainSources && RAIN_SOURCES.filter(s => !s.isBest).map(src => (
                                                <Bar
                                                    key={src.key}
                                                    yAxisId="rain"
                                                    dataKey={d => rainLabelMap.get(d.shortLabel.replace(
                                                        /^(\d{2}\/(\d{2})) (\d{2}):00$/,
                                                        (_, dm, mo, hh) => {
                                                            const now = new Date();
                                                            const yr = now.getFullYear();
                                                            const [dd] = dm.split('/');
                                                            return `${dd}/${mo}/${yr} ${hh}:00`;
                                                        }
                                                    ))?.bySource?.[src.key] ?? null}
                                                    name={`Mưa ${src.label}`}
                                                    fill={src.color} opacity={0.5}
                                                    radius={[0,0,3,3]}
                                                    maxBarSize={6} isAnimationActive={false}
                                                />
                                            ))}
                                            {/* Mưa BestMatch (Open-Meteo) */}
                                            {rainLabelMap.size > 0 && (
                                                <Bar
                                                    yAxisId="rain"
                                                    dataKey={d => rainLabelMap.get(d.fullLabel)?.bestMatch ??
                                                        rainLabelMap.get(d.shortLabel.replace(
                                                            /^(\d{2}\/(\d{2})) (\d{2}):00$/,
                                                            (_, dm, mo, hh) => {
                                                                const now = new Date();
                                                                const yr = now.getFullYear();
                                                                const [dd] = dm.split('/');
                                                                return `${dd}/${mo}/${yr} ${hh}:00`;
                                                            }
                                                        ))?.bestMatch ?? null
                                                    }
                                                    name="Mưa (BestMatch)"
                                                    fill="url(#rainSimGrad)" radius={[0,0,4,4]}
                                                    maxBarSize={25} isAnimationActive={false}
                                                />
                                            )}

                                            {/* Uncertainty band P10–P90 */}
                                            <Area yAxisId="q" type="monotone" dataKey="lstm_p90" name="LSTM P90" stroke="#93c5fd"
                                                strokeWidth={3} strokeDasharray="8 4" fill="url(#gradP90sim)"
                                                dot={false} legendType="line" isAnimationActive={false} connectNulls={false} />
                                            <Area yAxisId="q" type="monotone" dataKey="lstm_p10" name="LSTM P10" stroke="#60a5fa"
                                                strokeWidth={3} strokeDasharray="8 4" fill="#ffffff"
                                                dot={false} legendType="line" isAnimationActive={false} connectNulls={false} />

                                            {/* Q đến */}
                                            <Area yAxisId="q" type="monotone" dataKey="qvao" name="Q Thực tế" stroke="#f59e0b"
                                                strokeWidth={3.5} fill="url(#gradQinSim)" dot={false} isAnimationActive={false} connectNulls={false} />

                                            {/* Q xả & P50 */}
                                            <Line yAxisId="q" type="monotone" dataKey="luuluongxa" name="Q Xả" stroke="#ef4444"
                                                strokeWidth={2.5} dot={false} strokeDasharray="5 3" isAnimationActive={false} connectNulls={false} />
                                            <Line yAxisId="q" type="monotone" dataKey="lstm_p50" name="LSTM P50" stroke="#2563eb"
                                                strokeWidth={4} dot={false} strokeDasharray="10 5" isAnimationActive={false} connectNulls={false} />
                                            <Line yAxisId="q" type="monotone" dataKey="lstm_model" name="LSTM Model (DB)" stroke="#7c3aed"
                                                strokeWidth={4} dot={false} isAnimationActive={false} connectNulls={false} />

                                            {/* Drag-to-zoom selection area */}
                                            {isSelectingZoom && refAreaLeft && refAreaRight && (
                                                <ReferenceArea
                                                    yAxisId="q"
                                                    x1={refAreaLeft} x2={refAreaRight}
                                                    strokeOpacity={0.4} stroke="#3b82f6"
                                                    fill="#3b82f6" fillOpacity={0.1}
                                                />
                                            )}

                                            {/* Playback marker */}
                                            {playIndex > 0 && simData[playIndex] && (
                                                <ReferenceLine
                                                    yAxisId="q"
                                                    x={simData[playIndex].shortLabel}
                                                    stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 3"
                                                    label={<MarkerLabel data={simData[playIndex]} />}
                                                />
                                            )}
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                )}

                                {/* Timeline scrubber */}
                                <div className="flex items-center gap-2 pt-2 mt-1 border-t border-slate-100">
                                    <span className="text-xs font-mono text-slate-400 shrink-0 w-24">{simData[0]?.shortLabel || ""}</span>
                                    <input type="range" min={0} max={Math.max(0, simData.length - 1)} value={playIndex}
                                        onChange={e => { const i = Number(e.target.value); setPlayIndex(i); setPlayState("paused"); }}
                                        className="flex-1 accent-purple-500" />
                                    <span className="text-xs font-mono text-slate-400 shrink-0 w-24 text-right">{simData[simData.length - 1]?.shortLabel || ""}</span>
                                </div>
                            </div>

                            {/* Summary stats row */}
                            <div className="grid grid-cols-4 gap-3">
                                {[
                                    ["Đỉnh Q đến", `${peakQin} m³/s`, "bg-amber-50 border-amber-200 text-amber-700"],
                                    ["Đỉnh Q xả TT", `${peakQxa} m³/s`, "bg-red-50 border-red-200 text-red-600"],
                                    ["Cắt lũ TT", `${cutPct}%`, Number(cutPct) >= 20 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-orange-50 border-orange-200 text-orange-600"],
                                    ["Tổng thời gian", `${simData.length}h`, "bg-slate-50 border-slate-200 text-slate-600"],
                                ].map(([label, val, cls]) => (
                                    <div key={label} className={`rounded-xl border p-3 text-center ${cls}`}>
                                        <p className="text-xs font-black uppercase opacity-70">{label}</p>
                                        <p className="text-base font-black mt-1">{val}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── Cột phải: Điều khiển (3/10) ── */}
                        <div className="flex-[3] flex flex-col gap-3 min-w-0">

                            {/* Chọn đợt lũ */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-wide mb-3">Chọn đợt lũ</p>
                                <div className="space-y-2">
                                    {floodEvents.map(ev => (
                                        <button key={ev.id} onClick={() => loadSimEvent(ev)}
                                            className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${selectedEvent.id === ev.id
                                                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700"}`}>
                                            <p className="font-black text-xs leading-tight">{ev.label}</p>
                                            <p className={`text-xs mt-0.5 leading-tight ${selectedEvent.id === ev.id ? "text-blue-200" : "text-slate-400"}`}>
                                                {ev.desc}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── Thông tin thực thời tại mốc đang phát ── */}
                            {playIndex > 0 ? (
                                <div className={`rounded-2xl border-2 p-4 transition-all ${
                                    playState === "playing"
                                        ? "border-purple-300 bg-purple-50 shadow-purple-100 shadow-md"
                                        : "border-slate-200 bg-white"
                                }`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                                            <Clock size={12} className={playState === "playing" ? "text-purple-500 animate-pulse" : "text-slate-400"} />
                                            Thông tin tại mốc
                                        </p>
                                        {playState === "playing" && (
                                            <span className="text-xs text-purple-600 font-bold bg-purple-100 px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
                                        )}
                                    </div>

                                    {/* Timestamp nổi bật */}
                                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl px-3 py-2.5 mb-3 text-center">
                                        <p className="text-xs opacity-70 mb-0.5">Thời điểm</p>
                                        <p className="font-black text-base tracking-wide font-mono">
                                            {simData[playIndex]?.shortLabel || "–"}
                                        </p>
                                        <p className="text-xs opacity-60 mt-0.5">
                                            Giờ {playIndex + 1} / {simData.length}
                                        </p>
                                    </div>

                                    {/* Các giá trị */}
                                    <div className="space-y-2">
                                        {[
                                            { label: "Q đến", val: simData[playIndex]?.qvao, unit: "m³/s", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", bar: "bg-amber-400", max: peakQin },
                                            { label: "Q xả TT", val: simData[playIndex]?.luuluongxa, unit: "m³/s", color: "text-red-600", bg: "bg-red-50 border-red-200", bar: "bg-red-400", max: peakQin },
                                            { label: "LSTM P50", val: simData[playIndex]?.lstm_p50, unit: "m³/s", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", bar: "bg-blue-400", max: peakQin },
                                            { label: "LSTM P10", val: simData[playIndex]?.lstm_p10, unit: "m³/s", color: "text-sky-600", bg: "bg-sky-50 border-sky-200", bar: "bg-sky-300", max: peakQin },
                                            { label: "LSTM P90", val: simData[playIndex]?.lstm_p90, unit: "m³/s", color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200", bar: "bg-indigo-300", max: peakQin },
                                            { label: "Mưa trạm đo", val: simData[playIndex]?.rainStation, unit: "mm", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", bar: "bg-emerald-400", max: Math.max(...simData.map(d => d.rainStation ?? 0), 1) },
                                        ].map(({ label, val, unit, color, bg, bar, max }) => (
                                            <div key={label} className={`rounded-xl border px-3 py-2 ${bg}`}>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className={`text-xs font-black ${color}`}>{label}</span>
                                                    <span className={`text-sm font-black ${color}`}>{val != null ? val : "–"} <span className="text-xs font-normal opacity-60">{unit}</span></span>
                                                </div>
                                                <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                                                    <div className={`h-full ${bar} rounded-full transition-all duration-300`}
                                                        style={{ width: `${max > 0 && val != null ? Math.min(100, val / max * 100) : 0}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* So sánh nhanh */}
                                    {simData[playIndex]?.qvao != null && simData[playIndex]?.luuluongxa != null && (
                                        <div className="mt-3 pt-3 border-t border-slate-100">
                                            <p className="text-xs font-black text-slate-500 mb-1">Cắt lũ tại thời điểm này</p>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                                                        style={{ width: `${simData[playIndex].qvao > 0 ? Math.min(100, Math.max(0, (simData[playIndex].qvao - simData[playIndex].luuluongxa) / simData[playIndex].qvao * 100)) : 0}%` }} />
                                                </div>
                                                <span className="text-xs font-black text-emerald-700 w-10 text-right">
                                                    {simData[playIndex].qvao > 0
                                                        ? `${((simData[playIndex].qvao - simData[playIndex].luuluongxa) / simData[playIndex].qvao * 100).toFixed(0)}%`
                                                        : "–"}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Hiển thị info đợt lũ khi chưa phát */
                                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                                    <p className="font-black text-blue-800 text-sm">{selectedEvent.label}</p>
                                    <p className="text-blue-600 text-xs mt-1 leading-relaxed">{selectedEvent.desc}</p>
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        {[
                                            ["Bắt đầu", selectedEvent.start],
                                            ["Kết thúc", selectedEvent.end],
                                            ["Đỉnh lũ", selectedEvent.peak],
                                            ["Tổng", `${simData.length}h`],
                                        ].map(([k, v]) => (
                                            <div key={k} className="bg-white rounded-lg px-2.5 py-2 text-xs">
                                                <p className="text-slate-400 font-semibold">{k}</p>
                                                <p className="font-black text-blue-700 font-mono text-xs mt-0.5">{v}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-center text-blue-400 mt-3 italic">Nhấn Phát để bắt đầu mô phỏng</p>
                                </div>
                            )}

                            {/* Điều khiển phát lại */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-wide">Phát lại mô phỏng</p>

                                <div className="flex gap-2">
                                    <button onClick={() => { if (playIndex >= simData.length - 1) setPlayIndex(0); setPlayState("playing"); }}
                                        disabled={simLoading || playState === "playing"}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-sm transition-colors disabled:opacity-40">
                                        <Play size={14} /> Phát
                                    </button>
                                    <button onClick={() => setPlayState("paused")} disabled={playState !== "playing"}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl shadow-sm transition-colors disabled:opacity-40">
                                        <Pause size={14} /> Tạm dừng
                                    </button>
                                    <button onClick={() => { setPlayState("stopped"); setPlayIndex(0); }}
                                        disabled={playState === "stopped"}
                                        className="flex items-center justify-center px-3 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl shadow-sm transition-colors disabled:opacity-40">
                                        <Square size={14} />
                                    </button>
                                </div>

                                {/* Tốc độ */}
                                <div>
                                    <p className="text-xs font-bold text-slate-400 mb-2">Tốc độ phát lại</p>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {[1, 5, 10, 20].map(s => (
                                            <button key={s} onClick={() => setPlaySpeed(s)}
                                                className={`py-1.5 text-xs font-black rounded-lg border transition-all ${playSpeed === s
                                                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                                    : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-600"}`}>
                                                {s}×
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div>
                                    <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                                        <span className="font-semibold">Tiến độ</span>
                                        <span className="font-mono font-bold text-blue-600">
                                            {simData.length > 0 ? Math.round(playIndex / Math.max(1, simData.length - 1) * 100) : 0}%
                                        </span>
                                    </div>
                                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all duration-100"
                                            style={{ width: `${simData.length > 0 ? (playIndex / Math.max(1, simData.length - 1)) * 100 : 0}%` }} />
                                    </div>
                                    <p className="text-xs font-mono text-purple-600 mt-1.5 text-center min-h-[1rem]">
                                        {playIndex > 0 ? simData[playIndex]?.shortLabel : "Chưa phát"}
                                    </p>
                                </div>

                                {simLoading && (
                                    <div className="flex items-center justify-center gap-2 text-blue-500 text-xs">
                                        <RefreshCw size={12} className="animate-spin" /> Đang tải dữ liệu...
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════ TAB: ĐÁNH GIÁ ══════════ */}
                {subTab === "evaluation" && (
                    <>
                        {/* Event selector */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
                            <span className="text-sm font-bold text-slate-600">Đợt lũ đánh giá:</span>
                            <select value={evalEvent.id}
                                onChange={e => { const ev = floodEvents.find(f => f.id === e.target.value); loadEval(ev); }}
                                className="border border-slate-300 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:border-blue-400 outline-none">
                                {floodEvents.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                            </select>
                            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs">
                                <span className="font-bold text-blue-700">{evalEvent.desc}</span>
                                <span className="text-slate-500 ml-2 font-mono">{evalEvent.start} → {evalEvent.end}</span>
                            </div>
                            <span className={`text-xs font-bold px-2.5 py-1.5 rounded-full border ${evalIsFromDB ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-orange-50 text-orange-600 border-orange-200"}`}>
                                {evalIsFromDB ? "✓ Dữ liệu thực từ DB" : "⚠ Mô phỏng (DB chưa có dữ liệu 2025)"}
                            </span>
                            {evalLoading && <span className="text-blue-500 text-sm flex items-center gap-1"><RefreshCw size={13} className="animate-spin" /> Đang tính...</span>}
                        </div>

                        {/* Metrics */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <h3 className="text-blue-900 font-black mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
                                <BarChart3 size={16} className="text-blue-500" /> ĐÁNH GIÁ MÔ HÌNH — LSTM vs Thực tế
                            </h3>
                            {/* Backtest terminal */}
                            <div className="bg-slate-800 rounded-xl p-4 font-mono text-xs leading-6 mb-4 text-slate-200">
                                <p className="text-emerald-400 font-bold">═══ MODEL BACKTEST ═══</p>
                                <p><span className="text-slate-400">Period  :</span> <span className="text-amber-300">{evalEvent.start}</span> → <span className="text-amber-300">{evalEvent.end}</span></p>
                                <p><span className="text-slate-400">{i18n.language === 'en' ? 'Lake     :' : 'Hồ      :'}</span> <span className="text-cyan-300">{formatLakeName(lakeData?.name || `Hồ ${lakeId}`, i18n.language)}</span> (ID={lakeId})</p>
                                <p><span className="text-slate-400">Model   :</span> <span className="text-purple-300">LSTM Bi-directional + Multi-Head Attention, HORIZON=12h</span></p>
                                <p><span className="text-slate-400">Điểm đo :</span> <span className="text-white">{evalData.length} giờ</span></p>
                                <p><span className="text-slate-400">Nguồn   :</span> <span className={evalIsFromDB ? "text-emerald-300" : "text-orange-300"}>{evalIsFromDB ? "✓ Dữ liệu thực từ DB" : "⚠ Mô phỏng (DB chưa có dữ liệu giai đoạn này)"}</span></p>
                                {realMetrics && (
                                    <>
                                        <p className="text-purple-400 font-bold mt-1">═══ LSTM Model thực (ForecastHistory DB) ═══</p>
                                        <p><span className="text-slate-400">MAE     :</span> <span className={Number(realMetrics.mae) < 50 ? "text-emerald-300" : "text-orange-300"}>{realMetrics.mae} m³/s</span></p>
                                        <p><span className="text-slate-400">RMSE    :</span> <span className={Number(realMetrics.rmse) < 80 ? "text-emerald-300" : "text-orange-300"}>{realMetrics.rmse} m³/s</span></p>
                                        <p><span className="text-slate-400">NSE     :</span> <span className={Number(realMetrics.nse) > 0.7 ? "text-emerald-300" : "text-orange-300"}>{realMetrics.nse}</span> <span className="text-slate-400">({Number(realMetrics.nse) > 0.7 ? "✓ Tốt" : Number(realMetrics.nse) > 0.5 ? "~ Chấp nhận" : "✗ Cần cải thiện"})</span></p>
                                        <p><span className="text-slate-400">Bias    :</span> <span className={Math.abs(Number(realMetrics.bias)) < 30 ? "text-emerald-300" : "text-red-300"}>{realMetrics.bias} m³/s</span></p>
                                    </>
                                )}
                                <p className="text-emerald-400 font-bold mt-1">═══ LSTM Mô phỏng (P50 synthetic) ═══</p>
                                {metrics ? (
                                    <>
                                        <p><span className="text-slate-400">MAE     :</span> <span className="text-blue-300">{metrics.mae} m³/s</span></p>
                                        <p><span className="text-slate-400">RMSE    :</span> <span className="text-blue-300">{metrics.rmse} m³/s</span></p>
                                        <p><span className="text-slate-400">NSE     :</span> <span className="text-blue-300">{metrics.nse}</span></p>
                                        <p><span className="text-slate-400">Bias    :</span> <span className="text-blue-300">{metrics.bias} m³/s</span></p>
                                    </>
                                ) : <p className="text-slate-500">Chưa có dữ liệu...</p>}
                            </div>

                            {/* Real metrics if available */}
                            {realMetrics && (
                                <div className="mb-3">
                                    <p className="text-xs font-black text-purple-700 uppercase mb-2 flex items-center gap-1.5">
                                        <CheckCircle size={13} /> LSTM Model Thực — So sánh với dữ liệu lịch sử
                                    </p>
                                    <div className="grid grid-cols-4 gap-3">
                                        {[
                                            { label: "MAE", val: realMetrics.mae, unit: "m³/s", good: Number(realMetrics.mae) < 50 },
                                            { label: "RMSE", val: realMetrics.rmse, unit: "m³/s", good: Number(realMetrics.rmse) < 80 },
                                            { label: "NSE", val: realMetrics.nse, unit: "", good: Number(realMetrics.nse) > 0.7 },
                                            { label: "Bias", val: realMetrics.bias, unit: "m³/s", good: Math.abs(Number(realMetrics.bias)) < 30 },
                                        ].map(m => (
                                            <div key={m.label} className={`rounded-xl border p-3 text-center flex flex-col items-center gap-1 ${m.good ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-orange-50 border-orange-200 text-orange-700"}`}>
                                                <p className="text-xs font-black uppercase opacity-70">{m.label}</p>
                                                <p className="text-xl font-black">{m.val}</p>
                                                {m.unit && <p className="text-xs opacity-60">{m.unit}</p>}
                                                <p className="text-xs font-bold">{m.good ? "✓ Tốt" : "✗ Chưa đạt"}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Synthetic P50 metrics */}
                            {metrics && (
                                <div>
                                    {realMetrics && <p className="text-xs font-black text-blue-600 uppercase mb-2 flex items-center gap-1.5"><Activity size={13} /> LSTM P50 Mô phỏng (synthetic)</p>}
                                    <div className="grid grid-cols-4 gap-3">
                                        {[
                                            { label: "MAE", val: metrics.mae, unit: "m³/s", good: Number(metrics.mae) < 20, icon: <TrendingDown size={20} /> },
                                            { label: "RMSE", val: metrics.rmse, unit: "m³/s", good: Number(metrics.rmse) < 30, icon: <Activity size={20} /> },
                                            { label: "NSE", val: metrics.nse, unit: "", good: Number(metrics.nse) > 0.7, icon: <CheckCircle size={20} /> },
                                            { label: "Bias", val: metrics.bias, unit: "m³/s", good: Math.abs(Number(metrics.bias)) < 10, icon: <TrendingUp size={20} /> },
                                        ].map(m => (
                                            <div key={m.label} className={`rounded-xl border p-4 text-center flex flex-col items-center gap-1.5 ${m.good ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-orange-50 border-orange-200 text-orange-700"}`}>
                                                {m.icon}
                                                <p className="text-xs font-black uppercase opacity-70">{m.label}</p>
                                                <p className="text-2xl font-black">{m.val}</p>
                                                {m.unit && <p className="text-xs opacity-60">{m.unit}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Comparison chart */}
                        {evalData.length > 0 && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                <h3 className="text-blue-900 font-black mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
                                    <Activity size={16} /> SO SÁNH THỰC TẾ vs LSTM (P10 / P50 / P90)
                                </h3>
                                <ResponsiveContainer width="100%" height={280}>
                                    <ComposedChart data={evalSlice} margin={{ top: 10, right: 50, left: 10, bottom: 55 }} barCategoryGap="10%">
                                        <defs>
                                            <linearGradient id="gradEval" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                                            </linearGradient>
                                            <linearGradient id="rainEvalGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.8} />
                                                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.2} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis dataKey="shortLabel" fontSize={10} interval={Math.max(1, Math.floor(evalSlice.length / 10))}
                                            angle={-30} textAnchor="end" height={60} axisLine={false} tickLine={false}
                                            tick={{ fill: "#64748b", fontWeight: "600" }} />
                                        <YAxis yAxisId="q" domain={yDomain(evalSlice, ["qvao", "lstm_p10", "lstm_p90", "lstm_model"])}
                                            fontSize={10} axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
                                        <YAxis
                                            yAxisId="rain" orientation="right"
                                            reversed={true}
                                            stroke="#0ea5e9" fontSize={9} fontWeight="800"
                                            domain={[0, 100]}
                                            axisLine={false} tickLine={false} width={36}
                                            tickFormatter={v => `${v}mm`}
                                            tick={{ fill: "#0ea5e9" }}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                                        {/* Mưa trạm đo — bar phía trên, rủ xuống */}
                                        <Bar yAxisId="rain" dataKey="rainStation" name="Mưa trạm (IDW)"
                                            fill="url(#rainEvalGrad)" radius={[0, 0, 4, 4]} maxBarSize={25} isAnimationActive={false} />
                                        <Area yAxisId="q" type="monotone" dataKey="lstm_p90" name="LSTM P90" stroke="#93c5fd" strokeWidth={1.5}
                                            strokeDasharray="4 3" fill="url(#gradEval)" dot={false} legendType="line" />
                                        <Area yAxisId="q" type="monotone" dataKey="lstm_p10" name="LSTM P10" stroke="#60a5fa" strokeWidth={1.5}
                                            strokeDasharray="4 3" fill="#ffffff" dot={false} legendType="line" />
                                        <Line yAxisId="q" type="monotone" dataKey="qvao" name="Q Thực tế" stroke="#f59e0b" strokeWidth={3} dot={false} />
                                        <Line yAxisId="q" type="monotone" dataKey="lstm_p50" name="LSTM P50 (mô phỏng)" stroke="#2563eb" strokeWidth={2} dot={false} strokeDasharray="7 2" />
                                        <Line yAxisId="q" type="monotone" dataKey="lstm_model" name="LSTM Model (DB)" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                                <WindowNav total={evalData.length} window={evalWindow} setWindow={setEvalWindow}
                                    label={`${evalSlice[0]?.shortLabel || ""} → ${evalSlice[evalSlice.length - 1]?.shortLabel || ""}`} />
                            </div>
                        )}

                        {/* Flood routing + recommendation */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <h3 className="text-blue-900 font-black mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
                                <Shield size={16} className="text-red-500" /> KẾT QUẢ PHÒNG CHỐNG LŨ & KHUYẾN NGHỊ VẬN HÀNH
                            </h3>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                {[
                                    ["Đỉnh Q đến", `${peakQin} m³/s`, "bg-amber-50 border-amber-200 text-amber-700"],
                                    ["Cắt lũ thực tế", `${cutPct}%`, Number(cutPct) >= 20 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-orange-50 border-orange-200 text-orange-600"],
                                    ["Cắt lũ tối ưu đề xuất", `${optCutPct}%`, "bg-blue-50 border-blue-200 text-blue-700"],
                                    ["Cải thiện thêm", `${(Number(optCutPct) - Number(cutPct)).toFixed(1)}%`, "bg-purple-50 border-purple-200 text-purple-700"],
                                ].map(([label, val, cls]) => (
                                    <div key={label} className={`rounded-xl border p-4 text-center ${cls}`}>
                                        <p className="text-xs font-black uppercase opacity-70">{label}</p>
                                        <p className="text-xl font-black mt-1">{val}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Conclusion */}
                            <div className="bg-gradient-to-br from-blue-800 to-blue-900 text-white rounded-xl p-4 mb-4 text-sm leading-7 shadow-lg">
                                <p className="font-black text-amber-300 mb-2 flex items-center gap-2 text-base">
                                    <Info size={16} /> KẾT LUẬN — {evalEvent.label}
                                </p>
                                <p>• Đỉnh lũ Q đến: <strong className="text-amber-300">{peakQin} m³/s</strong> — {evalEvent.desc}</p>
                                <p>• Vận hành thực tế cắt lũ: <strong className="text-emerald-300">{cutPct}%</strong> (Q xả max = {peakQxa} m³/s)</p>
                                <p>• LSTM sai số: <strong className="text-cyan-300">MAE = {metrics?.mae ?? "–"} m³/s</strong> — {Number(metrics?.nse) > 0.7 ? "✅ Đủ tin cậy hỗ trợ vận hành" : "⚠️ Cần thêm dữ liệu cải thiện độ chính xác"}</p>
                                <p>• Vận hành tối ưu theo đề xuất: cắt lũ thêm <strong className="text-yellow-300">~{(Number(optCutPct) - Number(cutPct)).toFixed(1)}%</strong></p>
                                <p className="text-xs text-blue-300 mt-2">⚠️ Chỉ mang tính tham khảo. Quyết định cuối cùng theo QĐ 1865/QĐ-TTg ngày 23/12/2019.</p>
                            </div>

                            {/* Routing table */}
                            {opTable.length > 0 && (
                                <>
                                    <p className="text-xs font-black text-slate-400 uppercase mb-2 flex items-center gap-1">
                                        <Clock size={12} /> Bảng điều tiết lũ ({Math.min(opTable.length, 48)} điểm đại diện)
                                    </p>
                                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-slate-700 text-white">
                                                    {["Thời gian", "Q đến", "Q xả TT", "Q xả TƯ", "Cắt lũ TT", "Cắt lũ TƯ", "Z dự báo (m)"].map(h => (
                                                        <th key={h} className="px-3 py-2.5 text-left font-bold whitespace-nowrap">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {opTable
                                                    .filter((_, i) => i % Math.max(1, Math.floor(opTable.length / 48)) === 0)
                                                    .map((row, i) => {
                                                        const isPeak = row.qvao > peakQin * 0.7;
                                                        return (
                                                            <tr key={i} className={`border-t border-slate-100 ${isPeak ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                                                                <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{row.time}</td>
                                                                <td className={`px-3 py-2 font-black text-center ${isPeak ? "text-red-600" : "text-amber-600"}`}>{row.qvao}</td>
                                                                <td className="px-3 py-2 text-center text-red-500 font-semibold">{row.qxa_actual}</td>
                                                                <td className="px-3 py-2 text-center text-blue-600 font-black">{row.qxa_rec}</td>
                                                                <td className="px-3 py-2 text-center text-orange-500 font-semibold">{row.qcat_actual}</td>
                                                                <td className="px-3 py-2 text-center text-emerald-600 font-black">{row.qcat_opt}</td>
                                                                <td className="px-3 py-2 text-center text-blue-700 font-mono">{row.muc_nuoc}</td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">
                                        TT = Thực tế · TƯ = Tối ưu đề xuất · <span className="text-red-500 font-semibold">Nền đỏ</span> = giờ đỉnh lũ (&gt;70% đỉnh)
                                    </p>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
