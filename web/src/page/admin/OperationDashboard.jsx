import React, { useState, useEffect, useMemo } from "react";
import mapApi from "../../api/mapApi";
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
    Area,
} from "recharts";
import {
    Settings,
    Droplets,
    Droplet,
    Zap,
    Clock,
    LogOut,
    Map as MapIcon,
    TrendingUp,
    Database,
    AlertTriangle,
    CheckCircle,
    Info,
    ChevronDown,
    ChevronUp,
    Activity,
    Shield,
    ArrowRight,
} from "lucide-react";

// ─── Heuristic: recommend discharge ───────────────────────────────────────────
function computeRecommendation({ htl, qvao, luuluongxa, forecastPeak }) {
    const DESIGN_LEVEL = 380;   // mực nước dâng bình thường (m) – tuỳ hồ
    const FLOOD_LEVEL  = 385;   // mực nước lũ kiểm tra
    const DEAD_LEVEL   = 340;   // mực nước chết

    const safeCapacity = 0.85 * DESIGN_LEVEL; // 85 % mực thiết kế ≈ safe ceiling
    const fill = (htl - DEAD_LEVEL) / (DESIGN_LEVEL - DEAD_LEVEL); // 0→1

    // Dự báo đỉnh 12 giờ tới (P50)
    const qPeak = forecastPeak || qvao;

    let level = "ok";      // ok | warning | danger
    let qRec  = luuluongxa; // m³/s hiện tại
    let reason = "";
    let detail = "";

    if (htl >= FLOOD_LEVEL) {
        level  = "danger";
        qRec   = Math.max(qvao * 1.5, luuluongxa * 1.3);
        reason = "Mực nước vượt ngưỡng lũ kiểm tra";
        detail = `Mực nước hồ (${htl.toFixed(2)} m) đã vượt ngưỡng lũ kiểm tra (${FLOOD_LEVEL} m). ` +
                 `Cần tăng lưu lượng xả khẩn cấp lên khoảng ${qRec.toFixed(0)} m³/s để hạ mực nước nhanh, ` +
                 `tránh nguy cơ vỡ đập.`;
    } else if (htl >= DESIGN_LEVEL) {
        level  = "warning";
        qRec   = Math.max(qvao * 1.2, luuluongxa * 1.1);
        reason = "Mực nước đạt ngưỡng dâng bình thường";
        detail = `Mực nước hồ (${htl.toFixed(2)} m) đang ở mức dâng bình thường (${DESIGN_LEVEL} m). ` +
                 `Nên tăng xả nhẹ lên ${qRec.toFixed(0)} m³/s để duy trì dung tích phòng lũ, ` +
                 `đặc biệt khi dự báo lưu lượng đến sẽ đạt ~${qPeak.toFixed(0)} m³/s.`;
    } else if (htl >= safeCapacity) {
        level  = "warning";
        qRec   = qvao > luuluongxa ? qvao * 1.05 : luuluongxa;
        reason = "Hồ đạt >85% dung tích an toàn";
        detail = `Hồ đã tích đến ${(fill * 100).toFixed(1)}% dung tích. ` +
                 `Với dự báo lưu lượng đến ~${qPeak.toFixed(0)} m³/s, ` +
                 `khuyến nghị duy trì xả ở mức ${qRec.toFixed(0)} m³/s để tránh tràn bất ngờ.`;
    } else if (fill < 0.3 && qvao < 20) {
        level  = "ok";
        qRec   = Math.max(luuluongxa * 0.8, 0);
        reason = "Hồ đang ở mức thấp, lưu lượng vào nhỏ";
        detail = `Hồ chỉ tích ${(fill * 100).toFixed(1)}% dung tích, lưu lượng vào rất thấp (${qvao.toFixed(1)} m³/s). ` +
                 `Có thể giảm xả xuống ${qRec.toFixed(0)} m³/s để tích nước dự phòng mùa khô.`;
    } else {
        level  = "ok";
        qRec   = luuluongxa;
        reason = "Tình trạng vận hành bình thường";
        detail = `Hồ đang vận hành ổn định (đầy ${(fill * 100).toFixed(1)}%, H=${htl.toFixed(2)} m). ` +
                 `Duy trì lưu lượng xả hiện tại ${qRec.toFixed(0)} m³/s là phù hợp. ` +
                 `Theo dõi sát dự báo lưu lượng đến 12 giờ tới (~${qPeak.toFixed(0)} m³/s).`;
    }

    return { level, qRec, reason, detail };
}

// ─── Reservoir status narrative ────────────────────────────────────────────────
function buildStatusNarrative({ htl, qvao, luuluongxa, historyCount }) {
    const trend = historyCount >= 2 ? "" : "";
    return (
        `Mực nước hồ hiện tại là ${htl.toFixed(2)} m. ` +
        `Lưu lượng nước vào hồ đạt ${qvao.toFixed(1)} m³/s, ` +
        `lưu lượng xả qua tràn/tuabin là ${luuluongxa.toFixed(1)} m³/s. ` +
        (qvao > luuluongxa
            ? `Hồ đang ở trạng thái tích nước (Q vào > Q xả), mực nước có xu hướng tăng.`
            : qvao < luuluongxa
            ? `Hồ đang ở trạng thái xả nước (Q xả > Q vào), mực nước có xu hướng giảm.`
            : `Hồ đang ở trạng thái cân bằng (Q vào ≈ Q xả).`)
    );
}

// ─── Isolated clock: updates every second WITHOUT re-rendering the parent ──────
function LiveClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return <span className="text-blue-800 font-mono font-black ml-2">{now.toLocaleString('vi-VN')}</span>;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function OperationDashboard({ lakeId }) {
    const [reservoirs, setReservoirs] = useState([]);
    const [selectedReservoir, setSelectedReservoir] = useState(lakeId || "");
    const [chartData, setChartData] = useState([]);
    const [latestHydro, setLatestHydro] = useState({ qvao: 0, luuluongxa: 0, htl: 0 });
    const [forecastData, setForecastData] = useState([]);   // LSTM forecast
    const [showExplain, setShowExplain] = useState(true);
    const [showRec, setShowRec]       = useState(true);
    // NOTE: clock is in <LiveClock /> — no state here to avoid re-rendering

    // Max P90 in next 12h — used for recommendation
    const forecastPeak = useMemo(() => {
        if (!forecastData.length) return latestHydro.qvao;
        const future = forecastData.filter(d => d.isForecast);
        if (!future.length) return latestHydro.qvao;
        return Math.max(...future.map(d => d.p50 || 0));
    }, [forecastData, latestHydro.qvao]);

    const rec = useMemo(() =>
        computeRecommendation({
            htl: latestHydro.htl,
            qvao: latestHydro.qvao,
            luuluongxa: latestHydro.luuluongxa,
            forecastPeak,
        }),
    [latestHydro, forecastPeak]);

    const statusNarrative = useMemo(() =>
        buildStatusNarrative({
            htl: latestHydro.htl,
            qvao: latestHydro.qvao,
            luuluongxa: latestHydro.luuluongxa,
            historyCount: chartData.length,
        }),
    [latestHydro, chartData.length]);

    // ─── Fetch all reservoirs (if no lakeId locked) ───────────────────────────
    useEffect(() => {
        if (lakeId) return;
        (async () => {
            try {
                const resp = await mapApi.getReservoirs();
                const list = resp?.data ?? (Array.isArray(resp) ? resp : []);
                setReservoirs(list);
                if (list.length > 0) setSelectedReservoir(list[0].Id_Lake);
            } catch (e) {
                console.error("Error fetching reservoirs", e);
            }
        })();
    }, []);

    // ─── Fetch live hydrological data — refresh every 1 hour ─────────────────
    useEffect(() => {
        const id = lakeId || selectedReservoir;
        if (!id) return;

        const fetchHydro = async () => {
            try {
                const data = await mapApi.getLiveHydro(id);
                setLatestHydro({
                    qvao: data.qvao || 0,
                    luuluongxa: data.luuluongxa || 0,
                    htl: data.htl || 0,
                });

                if (Array.isArray(data.history)) {
                    // Sort ascending (earliest → latest) so x-axis goes left→right
                    const sorted = [...data.history].sort(
                        (a, b) => new Date(a.time) - new Date(b.time)
                    );
                    const mapped = sorted.map(d => {
                        const dt = new Date(d.time);
                        return {
                            _ts: dt,
                            time: dt.getHours().toString().padStart(2, "0") + ":00",
                            fullLabel:
                                dt.getDate().toString().padStart(2, "0") +
                                "/" +
                                (dt.getMonth() + 1).toString().padStart(2, "0") +
                                " " +
                                dt.getHours().toString().padStart(2, "0") +
                                ":00",
                            qIn: d.qvao || 0,
                            qOut: d.luuluongxa || 0,
                            waterLevel: d.htl || 0,
                            isForecast: false,
                        };
                    });
                    setChartData(mapped);
                }
            } catch (e) {
                console.error("Error fetching live hydro", e);
            }
        };

        fetchHydro(); // initial load
        const timer = setInterval(fetchHydro, 60 * 60 * 1000); // refresh every 1 hour
        return () => clearInterval(timer);
    }, [selectedReservoir, lakeId]);

    // ─── Fetch LSTM forecast — refresh every 1 hour ────────────────────────────
    useEffect(() => {
        const id = lakeId || selectedReservoir;
        if (!id) return;

        const fetchForecast = async () => {
            try {
                const raw = await mapApi.getForecastLstm(id);
                const arr = Array.isArray(raw)
                    ? raw
                    : Array.isArray(raw?.predictions)
                    ? raw.predictions
                    : [];

                const mapped = arr.map(d => {
                    const dt = new Date(d.forecastTime || d.targetTime);
                    return {
                        _ts: dt,
                        fullLabel:
                            dt.getDate().toString().padStart(2, "0") +
                            "/" +
                            (dt.getMonth() + 1).toString().padStart(2, "0") +
                            " " +
                            dt.getHours().toString().padStart(2, "0") +
                            ":00",
                        p50: d.qvao_forecast || d.p50 || null,
                        p10: d.p10 || null,
                        p90: d.p90 || null,
                        isForecast: true,
                    };
                });
                setForecastData(mapped);
            } catch (e) {
                console.error("Error fetching forecast", e);
            }
        };

        fetchForecast(); // initial load
        const timer = setInterval(fetchForecast, 60 * 60 * 1000); // refresh every 1 hour
        return () => clearInterval(timer);
    }, [selectedReservoir, lakeId]);

    // ─── Merge history + forecast into unified timeline ────────────────────────
    const unifiedData = useMemo(() => {
        // Build a map: fullLabel → point
        const map = new Map();

        // Historical points
        chartData.forEach(d => {
            map.set(d.fullLabel, { ...d });
        });

        // Forecast points: add on top of history (they may overlap at boundary)
        forecastData.forEach(d => {
            const existing = map.get(d.fullLabel);
            if (existing) {
                map.set(d.fullLabel, {
                    ...existing,
                    p50: d.p50,
                    p10: d.p10,
                    p90: d.p90,
                    isForecast: existing.isForecast, // keep as history if overlap
                });
            } else {
                map.set(d.fullLabel, { ...d, qIn: null, qOut: null, waterLevel: null });
            }
        });

        // Sort chronologically
        const sorted = Array.from(map.values()).sort((a, b) => a._ts - b._ts);

        // ── Bridge: nối Q vào thực đo với đường dự báo P50 ──
        // Tìm điểm cuối cùng có dữ liệu thực (qIn khác null) và có dữ liệu dự báo tồn tại
        if (forecastData.length > 0) {
            // Điểm lịch sử cuối cùng có qIn thực
            let lastRealIdx = -1;
            for (let i = sorted.length - 1; i >= 0; i--) {
                if (sorted[i].qIn != null) { lastRealIdx = i; break; }
            }
            // Điểm dự báo đầu tiên (p50 khác null)
            let firstForecastIdx = -1;
            for (let i = 0; i < sorted.length; i++) {
                if (sorted[i].p50 != null) { firstForecastIdx = i; break; }
            }

            if (lastRealIdx !== -1 && firstForecastIdx !== -1) {
                const bridgeQin = sorted[lastRealIdx].qIn;
                // Đặt p50=p10=p90 = qIn tại điểm cuối lịch sử → đường dự báo bắt đầu từ đây
                sorted[lastRealIdx] = {
                    ...sorted[lastRealIdx],
                    p50: bridgeQin,
                    p10: sorted[firstForecastIdx].p10 != null ? bridgeQin : null,
                    p90: sorted[firstForecastIdx].p90 != null ? bridgeQin : null,
                };
            }
        }

        return sorted;
    }, [chartData, forecastData]);

    // Label of the "now" divider
    const nowLabel = useMemo(() => {
        if (!chartData.length) return null;
        const last = chartData[chartData.length - 1];
        return last?.fullLabel;
    }, [chartData]);

    // ─── Colour helpers ────────────────────────────────────────────────────────
    const recColor = rec.level === "danger" ? "#ef4444" : rec.level === "warning" ? "#f59e0b" : "#10b981";
    const recBg    = rec.level === "danger" ? "bg-red-50 border-red-200" : rec.level === "warning" ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200";
    const recIcon  = rec.level === "danger"
        ? <AlertTriangle size={20} className="text-red-500" />
        : rec.level === "warning"
        ? <AlertTriangle size={20} className="text-amber-500" />
        : <CheckCircle size={20} className="text-emerald-500" />;

    return (
        <div className="flex flex-col bg-white text-gray-700 font-sans mt-8 rounded-xl border border-gray-200 shadow-xl overflow-hidden">

            {/* ── Header ── */}
            <div className="flex items-center justify-between p-5 bg-gray-50 border-b border-gray-200">
                <div className="text-xl font-bold flex items-center text-blue-900">
                    <Droplets className="text-blue-600 mr-2" size={24} /> Vận Hành Hồ Chứa
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Hồ chứa đang xem</span>
                        <div className="flex items-center gap-2">
                            <MapIcon size={16} className="text-blue-500" />
                            {!lakeId ? (
                                <select
                                    className="bg-white text-sm font-bold text-gray-800 outline-none border border-gray-300 px-4 py-2 rounded-lg cursor-pointer hover:border-blue-400 transition-colors shadow-sm"
                                    value={selectedReservoir}
                                    onChange={e => setSelectedReservoir(e.target.value)}
                                >
                                    <option value="" disabled>Chọn hồ thủy điện</option>
                                    {reservoirs.map(res => (
                                        <option key={res.Id_Lake} value={res.Id_Lake}>
                                            Thủy điện {res.name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <span className="bg-blue-50 text-blue-700 text-sm font-bold px-4 py-2 rounded-lg border border-blue-100 italic">
                                    Mã hồ: {lakeId}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Dashboard Content ── */}
            <div className="p-6 flex flex-col xl:flex-row gap-6">

                {/* Left Column (25%) */}
                <div className="w-full xl:w-1/4 flex flex-col gap-6">
                    {/* Reservoir visual card */}
                    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-lg relative h-[320px] flex flex-col group hover:border-blue-200 transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-blue-600 text-4xl font-black flex items-end">
                                {latestHydro.qvao.toFixed(1)} <span className="text-xs ml-1 text-gray-400 font-bold">m³/s</span>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">Lưu lượng xả hiện tại</span>
                                <div className="text-red-500 font-bold flex items-center justify-end gap-1">
                                    <TrendingUp size={14} className="rotate-45" /> {latestHydro.luuluongxa.toFixed(1)} m³/s
                                </div>
                            </div>
                        </div>
                        <div className="text-blue-500 text-2xl font-black mb-6 flex items-center gap-2 bg-blue-50 w-fit px-4 py-1.5 rounded-full border border-blue-100">
                            <Droplets size={22} /> {latestHydro.htl.toFixed(2)} <span className="text-lg">m</span>
                        </div>

                        {/* Visual Mockup */}
                        <div className="h-44 w-full relative mt-auto border-b-8 border-gray-300 rounded-b">
                            <div className="absolute bottom-0 left-0 w-3/4 h-full bg-blue-400/30 rounded-tl-3xl border-t-2 border-blue-400 animate-pulse"></div>
                            <div className="absolute right-4 bottom-0 w-28 h-5/6 bg-gray-200 rounded-t-2xl shadow-inner" style={{ clipPath: "polygon(10% 20%, 30% 20%, 90% 100%, 0% 100%)" }}></div>
                            <div className="absolute top-1/3 right-8 text-[10px] bg-red-600 px-3 py-1 rounded-full text-white font-black shadow-lg uppercase tracking-tighter">
                                Xả: {latestHydro.luuluongxa.toFixed(1)} m³/s
                            </div>
                        </div>

                        <div className="absolute bottom-6 left-6 text-[10px] space-y-1.5 bg-white/90 p-3 rounded-lg w-36 shadow-xl border border-blue-50 backdrop-blur-sm">
                            <div className="flex justify-between text-gray-500 font-bold"><span>V. p. lũ</span> <span className="font-extrabold text-gray-800">0 m³</span></div>
                            <div className="flex justify-between text-gray-500 font-bold"><span>V. trống</span> <span className="font-extrabold text-gray-800">0 m³</span></div>
                            <div className="flex justify-between border-t border-gray-100 pt-2 mt-2 text-blue-600 font-bold"><span>V. hồ</span> <span className="font-black">2.09M m³</span></div>
                        </div>
                    </div>

                    {/* Power generation card */}
                    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-lg relative flex flex-col h-[320px] group hover:border-yellow-200 transition-all">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-4">
                            <div className="text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">Kế hoạch: 15.08M kWh</div>
                            <div className="text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-yellow-100"><Zap size={14} className="text-yellow-500" /> Thực tế: 14.78M kWh</div>
                        </div>
                        <div className="h-36 w-full relative mt-2 flex-grow group">
                            <div className="absolute inset-0 bg-blue-50/50 rounded-2xl flex items-center justify-center overflow-hidden border border-blue-100 italic transition-transform group-hover:scale-[0.98]">
                                <div className="w-24 h-24 rounded-full border-8 border-dashed border-blue-500/30 flex items-center justify-center animate-[spin_10s_linear_infinite]">
                                    <Settings size={48} className="text-blue-400 group-hover:rotate-45 transition-transform duration-1000" />
                                </div>
                            </div>
                            <div className="absolute right-6 top-1/2 text-right transform -translate-y-1/2">
                                <div className="text-blue-700 text-2xl font-black mb-1 drop-shadow-sm">433.7 <span className="text-sm">m</span></div>
                                <div className="text-emerald-700 font-black bg-emerald-50 px-4 py-1.5 rounded-full text-xs border border-emerald-100 shadow-sm flex items-center gap-2">
                                    <Droplet size={12} /> 36.45 m³/s
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <div className="text-[10px] flex flex-col gap-2">
                                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                    <span className="text-gray-400 font-bold">LƯỢNG MƯA</span>
                                    <span className="font-black text-gray-800">77.27 mm</span>
                                </div>
                                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                    <span className="text-gray-400 font-bold">ĐỘ NHÁM</span>
                                    <span className="font-black text-gray-800">0.002</span>
                                </div>
                            </div>
                            <div className="bg-blue-600 rounded-xl p-3 flex flex-col items-center justify-center shadow-lg transform group-hover:rotate-1 transition-transform">
                                <div className="text-[10px] text-blue-200 uppercase font-black tracking-widest mb-1">Hiệu suất</div>
                                <div className="text-white text-2xl font-black">87<span className="text-sm">%</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Middle Column — Main Chart (50%) */}
                <div className="w-full xl:w-1/2 bg-white rounded-xl border border-gray-100 flex flex-col shadow-2xl min-h-[550px] overflow-hidden">
                    <div className="flex justify-between items-center p-5 bg-gray-50/50 border-b border-gray-100">
                        <div className="flex items-center gap-3 text-sm text-gray-600 font-bold uppercase tracking-wider">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                            <Clock size={18} className="text-blue-500" />
                            <span>Thời gian thực: <LiveClock /></span>
                        </div>
                        {forecastData.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full border border-purple-100 font-bold">
                                <Activity size={12} /> {forecastData.length} điểm dự báo LSTM
                            </div>
                        )}
                    </div>
                    <div className="flex-1 w-full p-6 relative">
                        {unifiedData.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                                Đang tải dữ liệu...
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={unifiedData} margin={{ top: 20, right: 30, left: 10, bottom: 50 }}>
                                    <defs>
                                        <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis
                                        dataKey="fullLabel"
                                        stroke="#94a3b8"
                                        fontSize={9}
                                        fontWeight="bold"
                                        axisLine={false}
                                        tickLine={false}
                                        interval={Math.max(1, Math.floor(unifiedData.length / 10))}
                                        angle={-35}
                                        textAnchor="end"
                                        height={55}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        stroke="#94a3b8"
                                        fontSize={10}
                                        fontWeight="bold"
                                        tickCount={6}
                                        domain={['auto', 'auto']}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        labelFormatter={label => `🕐 ${label}`}
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const pt = payload[0]?.payload;
                                            return (
                                                <div style={{ background: '#fff', borderRadius: 12, border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0/0.1)', padding: 12, fontSize: 12, fontWeight: 'bold', color: '#1e293b', minWidth: 180 }}>
                                                    <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 6, color: '#64748b' }}>
                                                        🕐 {label} {pt?.isForecast ? '· Dự báo' : '· Thực tế'}
                                                    </div>
                                                    {payload.map((e, i) => e.value != null && (
                                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingBottom: 2, color: e.color }}>
                                                            <span>{e.name}</span>
                                                            <span>{Number(e.value).toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend
                                        verticalAlign="bottom"
                                        height={40}
                                        iconType="circle"
                                        wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '16px' }}
                                    />

                                    {/* Reference line = current time boundary */}
                                    {nowLabel && (
                                        <ReferenceLine
                                            yAxisId="left"
                                            x={nowLabel}
                                            stroke="#ef4444"
                                            strokeDasharray="5 5"
                                            strokeWidth={2}
                                            label={{ value: "Hiện tại", fill: "#ef4444", fontSize: 10, fontWeight: "bold", position: "top" }}
                                        />
                                    )}

                                    {/* Actual water level — no animation to prevent chart thrashing */}
                                    <Line yAxisId="left" type="monotone" dataKey="waterLevel" name="Mực nước hồ (m)" stroke="#0ea5e9" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
                                    {/* Actual inflow */}
                                    <Line yAxisId="left" type="monotone" dataKey="qIn" name="Lưu lượng vào (m³/s)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3, fill: '#f59e0b' }} connectNulls isAnimationActive={false} />
                                    {/* Actual outflow */}
                                    <Line yAxisId="left" type="monotone" dataKey="qOut" name="Lưu lượng xả (m³/s)" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" connectNulls isAnimationActive={false} />

                                    {/* LSTM forecast band P10→P90 */}
                                    <Area yAxisId="left" type="monotone" dataKey="p90"
                                        stroke="#a855f7" strokeWidth={1.5} strokeDasharray="6 3"
                                        fill="url(#forecastBand)" fillOpacity={1}
                                        name="Dự báo Max P90 (m³/s)"
                                        dot={false} connectNulls={false} isAnimationActive={false} />
                                    <Area yAxisId="left" type="monotone" dataKey="p10"
                                        stroke="#6366f1" strokeWidth={1.5} strokeDasharray="6 3"
                                        fill="#fff" fillOpacity={1}
                                        name="Dự báo Min P10 (m³/s)"
                                        dot={false} connectNulls={false} isAnimationActive={false} />
                                    {/* LSTM P50 forecast line */}
                                    <Line yAxisId="left" type="monotone" dataKey="p50"
                                        stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="8 4"
                                        dot={{ r: 3, fill: '#8b5cf6' }}
                                        name="Dự báo LSTM P50 (m³/s)"
                                        connectNulls={false} isAnimationActive={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Right Column — Controls (25%) */}
                <div className="w-full xl:w-1/4 flex flex-col gap-4">
                    <div className="bg-white rounded-xl flex-1 border border-gray-100 shadow-xl flex flex-col p-2">
                        <div className="p-5 border-b border-gray-50 group">
                            <div className="mb-4 text-blue-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div> Mực nước thiết kế (m)
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400 font-bold">Thượng lưu</span>
                                    <input type="text" defaultValue="0" readOnly className="w-24 bg-gray-50 border border-transparent text-gray-800 px-3 py-2 rounded-lg text-right font-black shadow-inner outline-none" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400 font-bold">Trong hồ</span>
                                    <input type="text" value={latestHydro.htl.toFixed(2) || 0} readOnly className="w-24 bg-blue-50 border border-blue-100 text-blue-800 px-3 py-2 rounded-lg text-right font-black shadow-inner outline-none" />
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-b border-gray-50">
                            <div className="mb-4 text-yellow-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div> Công suất tổ máy (MW)
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400 font-bold">Tổ máy H1</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                        <input type="text" defaultValue="17.2" readOnly className="w-24 bg-gray-50 border border-transparent text-gray-800 px-3 py-2 rounded-lg text-right font-black shadow-inner outline-none" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400 font-bold">Tổ máy H2</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                        <input type="text" defaultValue="17.3" readOnly className="w-24 bg-gray-50 border border-transparent text-gray-800 px-3 py-2 rounded-lg text-right font-black shadow-inner outline-none" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-b border-gray-50">
                            <div className="mb-4 text-red-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div> Điều tiết cửa van (cm)
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400 font-bold">Cửa xả số 01</span>
                                    <input type="text" defaultValue="0" readOnly className="w-24 bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg text-right font-black shadow-inner outline-none" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400 font-bold">Cửa xả số 02</span>
                                    <input type="text" defaultValue="0" readOnly className="w-24 bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg text-right font-black shadow-inner outline-none" />
                                </div>
                            </div>
                        </div>

                        {/* Footer actions */}
                        <div className="p-6 mt-auto flex justify-between gap-3">
                            <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all hover:translate-y-[-2px] active:translate-y-[0px]">
                                <Database size={18} /> Lưu dữ liệu vận hành
                            </button>
                            <button className="w-14 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-red-500 py-3 rounded-xl flex items-center justify-center transition-all border border-gray-100">
                                <LogOut size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Explanation + Recommendation Section ── */}
            <div className="px-6 pb-6 flex flex-col gap-4">

                {/* Status Explanation */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-md overflow-hidden">
                    <button
                        onClick={() => setShowExplain(v => !v)}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100 hover:from-blue-100 hover:to-cyan-100 transition-colors"
                    >
                        <div className="flex items-center gap-3 font-bold text-blue-900 text-sm">
                            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                                <Info size={15} />
                            </div>
                            GIẢI THÍCH TÌNH TRẠNG HỒ &amp; DỰ BÁO
                        </div>
                        {showExplain ? <ChevronUp size={18} className="text-blue-600" /> : <ChevronDown size={18} className="text-blue-600" />}
                    </button>

                    {showExplain && (
                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                            {/* Current status */}
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <Activity size={16} className="text-blue-600" /> Tình trạng hiện tại
                                </h4>
                                <p className="text-gray-600 leading-relaxed bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                    {statusNarrative}
                                </p>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                        <div className="text-blue-700 font-black text-base">{latestHydro.htl.toFixed(2)}<span className="text-xs font-normal"> m</span></div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">Mực nước TL</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                        <div className="text-amber-600 font-black text-base">{latestHydro.qvao.toFixed(1)}<span className="text-xs font-normal"> m³/s</span></div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">Q vào</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                        <div className="text-red-600 font-black text-base">{latestHydro.luuluongxa.toFixed(1)}<span className="text-xs font-normal"> m³/s</span></div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">Q xả</div>
                                    </div>
                                </div>
                            </div>

                            {/* Forecast explanation */}
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <TrendingUp size={16} className="text-purple-600" /> Giải thích Dự báo LSTM
                                </h4>
                                {forecastData.length > 0 ? (
                                    <>
                                        <p className="text-gray-600 leading-relaxed bg-purple-50/50 p-4 rounded-lg border border-purple-100">
                                            Mô hình LSTM dự báo <strong>{forecastData.length} giờ tới</strong> với 3 kịch bản:&nbsp;
                                            <span className="text-indigo-600 font-bold">P10 (thấp nhất)</span>,&nbsp;
                                            <span className="text-purple-700 font-bold">P50 (kỳ vọng)</span>,&nbsp;
                                            <span className="text-red-500 font-bold">P90 (cao nhất)</span>.&nbsp;
                                            Đỉnh lưu lượng dự báo kỳ vọng trong 12 giờ tới đạt khoảng&nbsp;
                                            <strong className="text-purple-700">{forecastPeak.toFixed(1)} m³/s</strong>.
                                        </p>
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                            <div className="flex items-center gap-2 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                                                <span className="w-6 border-t-2 border-indigo-500 border-dashed inline-block"></span>
                                                <span className="text-indigo-700 font-bold">P10 — Kịch bản thấp nhất</span>
                                            </div>
                                            <div className="flex items-center gap-2 bg-purple-50 p-2.5 rounded-lg border border-purple-100">
                                                <span className="w-6 border-t-2 border-purple-600 border-dashed inline-block"></span>
                                                <span className="text-purple-700 font-bold">P50 — Kỳ vọng trung bình</span>
                                            </div>
                                            <div className="flex items-center gap-2 bg-red-50 p-2.5 rounded-lg border border-red-100 col-span-2">
                                                <span className="w-6 border-t-2 border-red-500 border-dashed inline-block"></span>
                                                <span className="text-red-600 font-bold">P90 — Kịch bản lưu lượng cao nhất (cần đề phòng)</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-gray-400 italic bg-gray-50 p-4 rounded-lg border border-gray-100">
                                        Chưa có dữ liệu dự báo LSTM cho hồ này. Các đường dự báo sẽ hiển thị khi mô hình chạy xong.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Discharge Recommendation */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-md overflow-hidden">
                    <button
                        onClick={() => setShowRec(v => !v)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-100"
                        style={{ background: `linear-gradient(to right, ${rec.level === 'danger' ? '#fff1f2, #fff1f2' : rec.level === 'warning' ? '#fffbeb, #fef9c3' : '#f0fdf4, #ecfdf5'})` }}
                    >
                        <div className="flex items-center gap-3 font-bold text-gray-900 text-sm">
                            <div className={`p-1.5 rounded-lg text-white ${rec.level === 'danger' ? 'bg-red-500' : rec.level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                                <Shield size={15} />
                            </div>
                            KHUYẾN NGHỊ LƯU LƯỢNG XẢ
                            <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-black ${rec.level === 'danger' ? 'bg-red-100 text-red-700' : rec.level === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {rec.level === 'danger' ? '⚠ KHẨN CẤP' : rec.level === 'warning' ? '⚠ CHÚ Ý' : '✓ BÌNH THƯỜNG'}
                            </span>
                        </div>
                        {showRec ? <ChevronUp size={18} className="text-gray-600" /> : <ChevronDown size={18} className="text-gray-600" />}
                    </button>

                    {showRec && (
                        <div className="p-5">
                            {/* Main recommendation */}
                            <div className={`flex items-center gap-4 p-4 rounded-xl border-2 mb-5 ${recBg}`}>
                                {recIcon}
                                <div className="flex-1">
                                    <div className="font-bold text-gray-800 text-sm mb-0.5">{rec.reason}</div>
                                    <div className="text-xs text-gray-500">Dựa trên mực nước hồ, lưu lượng thực đo và dự báo LSTM 12 giờ tới</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Đề xuất xả</div>
                                    <div className="font-black text-2xl" style={{ color: recColor }}>{rec.qRec.toFixed(0)}</div>
                                    <div className="text-xs text-gray-500 font-bold">m³/s</div>
                                </div>
                            </div>

                            {/* Flow indicator */}
                            <div className="flex items-center gap-3 mb-5 text-sm font-bold text-gray-600">
                                <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                                    <div className="text-amber-700 text-xs mb-0.5">Q VÀO hiện tại</div>
                                    <div className="text-amber-800 text-lg font-black">{latestHydro.qvao.toFixed(1)} <span className="text-xs font-normal">m³/s</span></div>
                                </div>
                                <ArrowRight size={20} className="text-gray-400 shrink-0" />
                                <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                                    <div className="text-red-600 text-xs mb-0.5">Q XẢ hiện tại</div>
                                    <div className="text-red-700 text-lg font-black">{latestHydro.luuluongxa.toFixed(1)} <span className="text-xs font-normal">m³/s</span></div>
                                </div>
                                <ArrowRight size={20} className="text-gray-400 shrink-0" />
                                <div className="flex-1 border-2 rounded-lg p-3 text-center" style={{ borderColor: recColor, background: `${recColor}10` }}>
                                    <div className="text-xs mb-0.5 font-bold" style={{ color: recColor }}>ĐỀ XUẤT XẢ</div>
                                    <div className="text-lg font-black" style={{ color: recColor }}>{rec.qRec.toFixed(0)} <span className="text-xs font-normal">m³/s</span></div>
                                </div>
                            </div>

                            {/* Detailed explanation */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                <h5 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-2">
                                    <Info size={14} className="text-blue-600" /> Giải thích chi tiết
                                </h5>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    {rec.detail}
                                </p>
                                <div className="mt-3 pt-3 border-t border-gray-200 text-[11px] text-gray-500 flex items-center gap-2">
                                    <Shield size={12} className="text-blue-500" />
                                    Khuyến nghị được tính toán dựa trên mực nước hồ hiện tại, cân bằng nước và dự báo lưu lượng LSTM 12 giờ tới.
                                    Vui lòng tham khảo thêm quy trình vận hành hồ chứa theo QĐ 1865/QĐ-TTg trước khi quyết định xả.
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
