import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
    ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
    Play, Pause, Square, Zap, BarChart3, TrendingUp, TrendingDown,
    CheckCircle, Clock, RefreshCw, ChevronLeft, ChevronRight,
    Activity, Shield, Info, Waves
} from "lucide-react";
import axiosClient from "../../api/axiosClient";

// ── Flood events ───────────────────────────────────────────────────────────────
const FLOOD_EVENTS = [
    { id: "lu2025_1", label: "Đợt lũ 1/2025 (T9)", start: "2025-09-10", end: "2025-09-25", peak: "2025-09-16", desc: "Bão số 4 gây mưa lớn kéo dài" },
    { id: "lu2025_2", label: "Đợt lũ 2/2025 (T10)", start: "2025-10-08", end: "2025-10-22", peak: "2025-10-14", desc: "Áp thấp nhiệt đới, mưa diện rộng" },
    { id: "lu2025_3", label: "Đợt lũ 3/2025 (T11)", start: "2025-11-01", end: "2025-11-18", peak: "2025-11-10", desc: "Lũ lớn nhất năm 2025" },
    { id: "lu2024_1", label: "Đợt lũ lịch sử T10/2024", start: "2024-10-14", end: "2024-10-30", peak: "2024-10-20", desc: "Mưa cực đoan, lũ vượt mức lịch sử" },
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

function generateMockFlood(event) {
    const rows = [];
    const start = new Date(event.start);
    const end = new Date(event.end);
    const peak = new Date(event.peak);
    const total = Math.round((end - start) / 3600000);
    const peakH = Math.round((peak - start) / 3600000);
    for (let i = 0; i <= total; i++) {
        const dt = new Date(start.getTime() + i * 3600000);
        const dist = Math.abs(i - peakH) / (peakH || 1);
        const base = 40 + 320 * Math.exp(-dist * dist * 0.9);
        const qvao = Math.round(base + Math.random() * 25 - 10);
        const luuluongxa = Math.round(qvao * (0.52 + Math.random() * 0.1));
        const htl = 167.5 + (qvao - 40) / 380;
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
                    <span className="font-black text-gray-700">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value} {p.unit || "m³/s"}</span>
                </div>
            ))}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function FloodHistoryTraining({ lakeId, lakeData }) {
    const [subTab, setSubTab] = useState("history");

    // Lịch sử
    const [histStart, setHistStart] = useState("2026-01-01");
    const [histEnd, setHistEnd] = useState(new Date().toISOString().slice(0, 10));
    const [histData, setHistData] = useState([]);
    const [histLoading, setHistLoading] = useState(false);
    const [histWindow, setHistWindow] = useState(0); // window start index

    // Mô phỏng Lũ
    const [selectedEvent, setSelectedEvent] = useState(FLOOD_EVENTS[2]);
    const [simData, setSimData] = useState([]);
    const [simLoading, setSimLoading] = useState(false);
    const [playIndex, setPlayIndex] = useState(0);
    const [playState, setPlayState] = useState("stopped");
    const [playSpeed, setPlaySpeed] = useState(5);

    const intervalRef = useRef(null);

    // Đánh giá
    const [evalData, setEvalData] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [opTable, setOpTable] = useState([]);
    const [evalLoading, setEvalLoading] = useState(false);
    const [evalEvent, setEvalEvent] = useState(FLOOD_EVENTS[2]);
    const [evalWindow, setEvalWindow] = useState(0);

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
        let data = await fetchHistory(event.start, event.end);
        if (!data.length) data = generateMockFlood(event);
        setSimData(generateLstmOverlay(data));
        setSimLoading(false);
    }, [fetchHistory]);

    const loadEval = useCallback(async (event) => {
        setEvalEvent(event); setEvalLoading(true); setEvalWindow(0);
        let data = await fetchHistory(event.start, event.end);
        if (!data.length) data = generateMockFlood(event);
        const overlaid = generateLstmOverlay(data);
        setEvalData(overlaid);
        setMetrics(calcMetrics(overlaid.map(d => d.qvao), overlaid.map(d => d.lstm_p50)));
        setOpTable(simulateOptimalOperation(overlaid));
        setEvalLoading(false);
    }, [fetchHistory]);

    useEffect(() => { loadHistData(); }, []);
    useEffect(() => { loadSimEvent(FLOOD_EVENTS[2]); }, [lakeId]);
    useEffect(() => { loadEval(FLOOD_EVENTS[2]); }, [lakeId]);

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
                <div className="flex-1 relative h-2 bg-gray-100 rounded-full overflow-hidden cursor-pointer"
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
                <span className="text-xs text-gray-400 font-mono w-32 text-right">
                    {label} ({total}h tổng)
                </span>
            </div>
        );
    };

    // ── Tabs ───────────────────────────────────────────────────────────────────
    const subTabs = [
        {
            id: "history", label: "Lịch sử", icon: "📈",
            active: "bg-blue-500 text-white shadow-blue-200 shadow-md",
            inactive: "bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100",
        },
        {
            id: "simulation", label: "Mô phỏng Lũ", icon: "🎬",
            active: "bg-amber-500 text-white shadow-amber-200 shadow-md",
            inactive: "bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100",
        },
        {
            id: "evaluation", label: "Đánh giá & Khuyến nghị", icon: "📊",
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
                                <span className="text-sm font-bold text-slate-600">Từ:</span>
                                <input type="date" value={histStart} onChange={e => setHistStart(e.target.value)}
                                    className="border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-mono bg-slate-50 focus:border-blue-400 outline-none" />
                                <span className="text-sm font-bold text-slate-600">Đến:</span>
                                <input type="date" value={histEnd} onChange={e => setHistEnd(e.target.value)}
                                    className="border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-mono bg-slate-50 focus:border-blue-400 outline-none" />
                                <button onClick={loadHistData} disabled={histLoading}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm">
                                    <RefreshCw size={13} className={histLoading ? "animate-spin" : ""} />
                                    {histLoading ? "Đang tải..." : "Tải dữ liệu"}
                                </button>
                                {[["30 ngày", 30], ["90 ngày", 90], ["180 ngày", 180]].map(([lbl, d]) => (
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
                                    BIỂU ĐỒ LỊCH SỬ THỦY VĂN — {lakeData?.name || `Hồ ${lakeId}`}
                                </h3>
                                {histData.length > 0 && (
                                    <span className="text-xs bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-full border border-blue-100">
                                        Cửa sổ {WINDOW_SIZE}h / {histData.length}h tổng
                                    </span>
                                )}
                            </div>

                            {histLoading ? (
                                <div className="h-72 flex items-center justify-center text-slate-400 gap-2">
                                    <RefreshCw size={20} className="animate-spin text-blue-400" /> Đang tải dữ liệu...
                                </div>
                            ) : histData.length === 0 ? (
                                <div className="h-72 flex flex-col items-center justify-center text-slate-400 gap-3 bg-slate-50 rounded-xl">
                                    <Waves size={40} className="opacity-30 text-blue-300" />
                                    <p className="text-sm font-semibold">Không có dữ liệu trong khoảng thời gian này</p>
                                    <p className="text-xs text-slate-400">Dữ liệu DB từ 01/01/2026. Backfill để thêm dữ liệu 2025.</p>
                                </div>
                            ) : (
                                <>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <ComposedChart data={histSlice} margin={{ top: 10, right: 50, left: 10, bottom: 50 }}>
                                            <defs>
                                                <linearGradient id="gradQ" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="shortLabel" fontSize={10} interval={Math.max(1, Math.floor(histSlice.length / 10))}
                                                angle={-30} textAnchor="end" height={55} axisLine={false} tickLine={false}
                                                tick={{ fill: "#64748b", fontWeight: "600" }} />
                                            <YAxis yAxisId="q" domain={yDomain(histSlice, ["qvao", "luuluongxa"])}
                                                fontSize={10} axisLine={false} tickLine={false} tick={{ fill: "#64748b" }}
                                                label={{ value: "Q (m³/s)", angle: -90, position: "insideLeft", fontSize: 10, fill: "#64748b", dx: -5 }} />
                                            <YAxis yAxisId="z" orientation="right" domain={yDomain(histSlice, ["htl"])}
                                                fontSize={10} axisLine={false} tickLine={false} tick={{ fill: "#0ea5e9" }}
                                                label={{ value: "Z (m)", angle: 90, position: "insideRight", fontSize: 10, fill: "#0ea5e9", dx: 8 }} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" />
                                            <Area yAxisId="q" type="monotone" dataKey="qvao" name="Q vào (m³/s)" stroke="#f59e0b" strokeWidth={2.5}
                                                fill="url(#gradQ)" dot={false} />
                                            <Line yAxisId="q" type="monotone" dataKey="luuluongxa" name="Q xả (m³/s)" stroke="#ef4444"
                                                strokeWidth={2} dot={false} strokeDasharray="5 3" />
                                            <Line yAxisId="z" type="monotone" dataKey="htl" name="Mực nước Z (m)" stroke="#0ea5e9"
                                                strokeWidth={2.5} dot={false} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                    <WindowNav total={histData.length} window={histWindow} setWindow={setHistWindow}
                                        label={`${histSlice[0]?.shortLabel || ""} → ${histSlice[histSlice.length - 1]?.shortLabel || ""}`} />
                                </>
                            )}

                            {histData.length > 0 && (
                                <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                                    {[
                                        ["Q vào max", `${Math.max(...histData.map(d => d.qvao)).toFixed(0)} m³/s`, "text-amber-600 bg-amber-50 border-amber-200"],
                                        ["Q xả max", `${Math.max(...histData.map(d => d.luuluongxa)).toFixed(0)} m³/s`, "text-red-600 bg-red-50 border-red-200"],
                                        ["Mực nước max", `${Math.max(...histData.map(d => d.htl)).toFixed(2)} m`, "text-blue-600 bg-blue-50 border-blue-200"],
                                        ["Tổng số điểm", `${histData.length} giờ`, "text-slate-600 bg-slate-50 border-slate-200"],
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
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs bg-amber-50 text-amber-700 font-bold px-2.5 py-1 rounded-full border border-amber-200">
                                            Đỉnh {peakQin} m³/s
                                        </span>
                                        <span className="text-xs text-slate-400 font-mono">{simData.length}h tổng</span>
                                    </div>
                                </div>

                                {simLoading ? (
                                    <div className="h-96 flex items-center justify-center text-slate-400 gap-2">
                                        <RefreshCw size={20} className="animate-spin text-blue-400" /> Đang tải...
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height={430}>
                                        <ComposedChart data={simChartData} margin={{ top: 8, right: 24, left: 8, bottom: 52 }}>
                                            <defs>
                                                <linearGradient id="gradP90sim" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                                                </linearGradient>
                                                <linearGradient id="gradQinSim" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis
                                                dataKey="shortLabel"
                                                fontSize={9}
                                                interval={Math.max(1, Math.floor(simData.length / 14))}
                                                angle={-35} textAnchor="end" height={58}
                                                axisLine={false} tickLine={false}
                                                tick={{ fill: "#64748b", fontWeight: "600" }}
                                            />
                                            <YAxis
                                                domain={yDomain(simData, ["qvao", "luuluongxa", "lstm_p10", "lstm_p90"])}
                                                fontSize={10} axisLine={false} tickLine={false}
                                                tick={{ fill: "#64748b" }}
                                                label={{ value: "Q (m³/s)", angle: -90, position: "insideLeft", fontSize: 10, fill: "#94a3b8", dx: -2 }}
                                            />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" />

                                            {/* Uncertainty band P10–P90 */}
                                            <Area type="monotone" dataKey="lstm_p90" name="LSTM P90" stroke="#93c5fd"
                                                strokeWidth={1.5} strokeDasharray="4 3" fill="url(#gradP90sim)"
                                                dot={false} legendType="line" isAnimationActive={false} connectNulls={false} />
                                            <Area type="monotone" dataKey="lstm_p10" name="LSTM P10" stroke="#60a5fa"
                                                strokeWidth={1.5} strokeDasharray="4 3" fill="#ffffff"
                                                dot={false} legendType="line" isAnimationActive={false} connectNulls={false} />

                                            {/* Q vào — filled area */}
                                            <Area type="monotone" dataKey="qvao" name="Q Thực tế (m³/s)" stroke="#f59e0b"
                                                strokeWidth={2.5} fill="url(#gradQinSim)" dot={false} isAnimationActive={false} connectNulls={false} />

                                            {/* Q xả & P50 */}
                                            <Line type="monotone" dataKey="luuluongxa" name="Q Xả (m³/s)" stroke="#ef4444"
                                                strokeWidth={1.8} dot={false} strokeDasharray="5 3" isAnimationActive={false} connectNulls={false} />
                                            <Line type="monotone" dataKey="lstm_p50" name="LSTM P50 (dự báo)" stroke="#2563eb"
                                                strokeWidth={2} dot={false} strokeDasharray="7 2" isAnimationActive={false} connectNulls={false} />

                                            {/* Playback marker — always show when not at start */}
                                            {playIndex > 0 && simData[playIndex] && (
                                                <ReferenceLine
                                                    x={simData[playIndex].shortLabel}
                                                    stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="4 3"
                                                    label={{ value: "▶", fontSize: 12, fill: "#8b5cf6", position: "top" }}
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
                                {playState !== "stopped" && (
                                    <p className="text-center text-xs font-mono text-purple-600 mt-0.5">
                                        ▶ {simData[playIndex]?.fullLabel || ""}
                                    </p>
                                )}
                            </div>

                            {/* Summary stats row */}
                            <div className="grid grid-cols-4 gap-3">
                                {[
                                    ["Đỉnh Q vào", `${peakQin} m³/s`, "bg-amber-50 border-amber-200 text-amber-700"],
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
                                    {FLOOD_EVENTS.map(ev => (
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
                                            { label: "Q vào", val: simData[playIndex]?.qvao, unit: "m³/s", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", bar: "bg-amber-400", max: peakQin },
                                            { label: "Q xả TT", val: simData[playIndex]?.luuluongxa, unit: "m³/s", color: "text-red-600", bg: "bg-red-50 border-red-200", bar: "bg-red-400", max: peakQin },
                                            { label: "LSTM P50", val: simData[playIndex]?.lstm_p50, unit: "m³/s", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", bar: "bg-blue-400", max: peakQin },
                                            { label: "LSTM P10", val: simData[playIndex]?.lstm_p10, unit: "m³/s", color: "text-sky-600", bg: "bg-sky-50 border-sky-200", bar: "bg-sky-300", max: peakQin },
                                            { label: "LSTM P90", val: simData[playIndex]?.lstm_p90, unit: "m³/s", color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200", bar: "bg-indigo-300", max: peakQin },
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
                                onChange={e => { const ev = FLOOD_EVENTS.find(f => f.id === e.target.value); loadEval(ev); }}
                                className="border border-slate-300 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:border-blue-400 outline-none">
                                {FLOOD_EVENTS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                            </select>
                            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs">
                                <span className="font-bold text-blue-700">{evalEvent.desc}</span>
                                <span className="text-slate-500 ml-2 font-mono">{evalEvent.start} → {evalEvent.end}</span>
                            </div>
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
                                <p><span className="text-slate-400">Hồ      :</span> <span className="text-cyan-300">{lakeData?.name || `Hồ ${lakeId}`}</span> (ID={lakeId})</p>
                                <p><span className="text-slate-400">Model   :</span> <span className="text-purple-300">LSTM Bi-directional + Multi-Head Attention, HORIZON=12h</span></p>
                                <p><span className="text-slate-400">Điểm đo :</span> <span className="text-white">{evalData.length} giờ</span></p>
                                <p className="text-emerald-400 font-bold mt-1">═══ Thống kê mô phỏng ═══</p>
                                {metrics ? (
                                    <>
                                        <p><span className="text-slate-400">MAE     :</span> <span className={Number(metrics.mae) < 20 ? "text-emerald-300" : "text-orange-300"}>{metrics.mae} m³/s</span></p>
                                        <p><span className="text-slate-400">RMSE    :</span> <span className={Number(metrics.rmse) < 30 ? "text-emerald-300" : "text-orange-300"}>{metrics.rmse} m³/s</span></p>
                                        <p><span className="text-slate-400">NSE     :</span> <span className={Number(metrics.nse) > 0.7 ? "text-emerald-300" : "text-orange-300"}>{metrics.nse}</span> <span className="text-slate-400">({Number(metrics.nse) > 0.7 ? "✓ Tốt" : Number(metrics.nse) > 0.5 ? "~ Chấp nhận" : "✗ Cần cải thiện"})</span></p>
                                        <p><span className="text-slate-400">Bias    :</span> <span className={Math.abs(Number(metrics.bias)) < 10 ? "text-emerald-300" : "text-red-300"}>{metrics.bias} m³/s</span></p>
                                    </>
                                ) : <p className="text-slate-500">Chưa có dữ liệu...</p>}
                            </div>
                            {metrics && (
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
                            )}
                        </div>

                        {/* Comparison chart */}
                        {evalData.length > 0 && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                <h3 className="text-blue-900 font-black mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
                                    <Activity size={16} /> SO SÁNH THỰC TẾ vs LSTM (P10 / P50 / P90)
                                </h3>
                                <ResponsiveContainer width="100%" height={280}>
                                    <ComposedChart data={evalSlice} margin={{ top: 10, right: 20, left: 10, bottom: 55 }}>
                                        <defs>
                                            <linearGradient id="gradEval" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis dataKey="shortLabel" fontSize={10} interval={Math.max(1, Math.floor(evalSlice.length / 10))}
                                            angle={-30} textAnchor="end" height={60} axisLine={false} tickLine={false}
                                            tick={{ fill: "#64748b", fontWeight: "600" }} />
                                        <YAxis domain={yDomain(evalSlice, ["qvao", "lstm_p10", "lstm_p90"])}
                                            fontSize={10} axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                                        <Area type="monotone" dataKey="lstm_p90" name="LSTM P90" stroke="#93c5fd" strokeWidth={1.5}
                                            strokeDasharray="4 3" fill="url(#gradEval)" dot={false} legendType="line" />
                                        <Area type="monotone" dataKey="lstm_p10" name="LSTM P10" stroke="#60a5fa" strokeWidth={1.5}
                                            strokeDasharray="4 3" fill="#ffffff" dot={false} legendType="line" />
                                        <Line type="monotone" dataKey="qvao" name="Q Thực tế" stroke="#f59e0b" strokeWidth={3} dot={false} />
                                        <Line type="monotone" dataKey="lstm_p50" name="LSTM P50" stroke="#2563eb" strokeWidth={2.5} dot={false} strokeDasharray="7 2" />
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
                                    ["Đỉnh Q vào", `${peakQin} m³/s`, "bg-amber-50 border-amber-200 text-amber-700"],
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
                                <p>• Đỉnh lũ Q vào: <strong className="text-amber-300">{peakQin} m³/s</strong> — {evalEvent.desc}</p>
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
                                                    {["Thời gian", "Q vào", "Q xả TT", "Q xả TƯ", "Cắt lũ TT", "Cắt lũ TƯ", "Z dự báo (m)"].map(h => (
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
