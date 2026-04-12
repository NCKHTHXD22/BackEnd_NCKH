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

// ─── Reservoir operational constants (per lake) ───────────────────────────────
// MNC=chết, MNDBT=dâng bình thường, MNGC=gia cường, crest=đỉnh đập
const LAKE_CONSTANTS = {
    1:  { MNC:158.0, MNDBT:175.0, MNGC:176.5, crest:177.0, totalVol:685, deadVol:215, floodVol:190, turbines:2, capacity:190 },
    2:  { MNC:225.0, MNDBT:258.0, MNGC:260.5, crest:261.5, totalVol:343, deadVol: 97, floodVol: 80, turbines:2, capacity:210 },
    3:  { MNC:100.0, MNDBT:108.0, MNGC:109.5, crest:110.5, totalVol:180, deadVol: 30, floodVol: 50, turbines:2, capacity: 40 },
    4:  { MNC:160.0, MNDBT:168.0, MNGC:169.5, crest:170.5, totalVol:250, deadVol: 60, floodVol: 70, turbines:2, capacity: 80 },
};
const DEFAULT_CONST = { MNC:158.0, MNDBT:175.0, MNGC:176.5, crest:177.0, totalVol:685, deadVol:215, floodVol:190, turbines:2, capacity:190 };
function getLakeConst(id) { return LAKE_CONSTANTS[Number(id)] || DEFAULT_CONST; }

// ─── Animated Dam Cross-Section (SVG) ─────────────────────────────────────────
function DamCrossSection({ htl, qvao, luuluongxa, lakeId }) {
    const c = getLakeConst(lakeId);
    const SVG_W = 380, SVG_H = 270;
    // Vertical mapping: MNC → y=235, crest → y=38
    const yRange = 235 - 38;
    const zRange = c.crest - c.MNC;
    const zToY = (z) => 235 - ((z - c.MNC) / zRange) * yRange;

    const waterY    = Math.min(235, Math.max(40, zToY(htl)));
    const mncY      = zToY(c.MNC);
    const mndbtY    = zToY(c.MNDBT);
    const mngcY     = zToY(c.MNGC);
    const fillPct   = Math.max(0, Math.min(100, ((htl - c.MNC) / (c.crest - c.MNC)) * 100));
    const isFlood   = htl >= c.MNGC;
    const isWarn    = htl >= c.MNDBT;
    const waterColor = isFlood ? "#ef4444" : isWarn ? "#f59e0b" : "#3b82f6";
    const waterAlpha = isFlood ? 0.75 : 0.6;

    // Gate opening: proportional to release flow
    const gateOpen  = qvao > 0 ? Math.min(28, (luuluongxa / Math.max(qvao, 1)) * 28) : 0;

    // All y-coordinates: ground=245, crest=40, yRange=205
    // Upstream: x=0..214  |  Dam: trapezoid  |  Downstream: x=258..380
    const GROUND  = 245;
    const DAM_TL  = 214, DAM_TR = 234;   // crest top-left / top-right x
    const DAM_BL  = 198, DAM_BR = 265;   // base bottom-left / bottom-right x
    const DOWN_X  = 265;                 // start of downstream
    const UP_CLIP = 216;                 // upstream clip width
    const GAUGE_X = 362;                 // gauge x position

    const waterHeight = Math.max(0, GROUND - waterY);

    return (
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%" style={{ overflow: 'hidden' }}>
            <defs>
                <linearGradient id="damGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" />
                    <stop offset="100%" stopColor="#64748b" />
                </linearGradient>
                <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={waterColor} stopOpacity={waterAlpha} />
                    <stop offset="100%" stopColor={waterColor} stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="downGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e0f2fe" stopOpacity={0.4}/>
                    <stop offset="100%" stopColor="#bfdbfe" stopOpacity={0.1}/>
                </linearGradient>
                <clipPath id="upstreamClip">
                    <rect x="0" y="0" width={UP_CLIP} height={SVG_H} />
                </clipPath>
            </defs>

            {/* ── Sky / background ── */}
            <rect x="0" y="0" width={SVG_W} height={GROUND} fill="url(#skyGrad)" />

            {/* ── Ground / River bed ── */}
            <rect x="0" y={GROUND} width={SVG_W} height={SVG_H - GROUND} fill="#c8c8c8" />
            {/* Ground texture */}
            {[5,25,45,65,85,105,125,145,165,185,205,225,245,265,285,305,325,345,365].map(x => (
                <line key={x} x1={x} y1={GROUND} x2={x+8} y2={SVG_H} stroke="#b0b0b0" strokeWidth="0.5" opacity="0.5" />
            ))}

            {/* ── Upstream water body ── */}
            <rect x="2" y={waterY} width={UP_CLIP - 4} height={waterHeight}
                fill="url(#waterGrad)" clipPath="url(#upstreamClip)" />

            {/* ── Animated wave on water surface ── */}
            <g clipPath="url(#upstreamClip)">
                <path d={`M-96,${waterY} Q-72,${waterY-6} -48,${waterY} Q-24,${waterY+6} 0,${waterY} Q24,${waterY-6} 48,${waterY} Q72,${waterY+6} 96,${waterY} Q120,${waterY-6} 144,${waterY} Q168,${waterY+6} 192,${waterY} Q216,${waterY-5} 240,${waterY} Q264,${waterY+5} 288,${waterY}`}
                    fill="none" stroke={waterColor} strokeWidth="2.5" opacity="0.85">
                    <animateTransform attributeName="transform" type="translate" from="96,0" to="0,0" dur="3s" repeatCount="indefinite" />
                </path>
                <path d={`M0,${waterY+2} Q30,${waterY-3} 60,${waterY+2} Q90,${waterY+7} 120,${waterY+2} Q150,${waterY-3} 180,${waterY+2} Q210,${waterY+7} 240,${waterY+2}`}
                    fill="none" stroke={waterColor} strokeWidth="1.2" opacity="0.4">
                    <animateTransform attributeName="transform" type="translate" from="-60,0" to="60,0" dur="5s" repeatCount="indefinite" />
                </path>
            </g>

            {/* ── Dam body (trapezoid) ── */}
            <polygon points={`${DAM_TL},40 ${DAM_TR},40 ${DAM_BR},${GROUND} ${DAM_BL},${GROUND}`} fill="url(#damGrad)" />
            {/* Concrete horizontal texture lines */}
            {[70,100,130,160,190,220].map(y => {
                const frac = (y - 40) / (GROUND - 40);
                const lx = DAM_TL + frac * (DAM_BL - DAM_TL);
                const rx = DAM_TR + frac * (DAM_BR - DAM_TR);
                return <line key={y} x1={lx} y1={y} x2={rx} y2={y}
                    stroke="#475569" strokeWidth="0.6" opacity="0.35" />;
            })}
            {/* Dam crest top line */}
            <line x1={DAM_TL} y1="40" x2={DAM_TR} y2="40" stroke="#94a3b8" strokeWidth="2" />
            <rect x="150" y="28" width="66" height="13" rx="3" fill="#f1f5f9" opacity="0.85" />
            <text x="183" y="38" fontSize="8.5" fill="#475569" textAnchor="middle" fontWeight="bold">Đỉnh đập {c.crest}m</text>

            {/* ── Spillway gate + animated jet ── */}
            {gateOpen > 0 && (
                <g>
                    <rect x={DAM_BR} y={GROUND - gateOpen} width="7" height={gateOpen}
                        fill="#ef4444" opacity="0.85" rx="1" />
                    <path d={`M${DAM_BR+7},${GROUND - gateOpen*0.6} Q${DAM_BR+30},${GROUND - gateOpen*0.3} ${DAM_BR+70},${GROUND-2}`}
                        fill="none" stroke="#7dd3fc" strokeWidth="3.5" strokeDasharray="7 4" opacity="0.85">
                        <animate attributeName="stroke-dashoffset" from="0" to="-22" dur="0.7s" repeatCount="indefinite" />
                    </path>
                </g>
            )}

            {/* ── Downstream water (tail water) ── */}
            <rect x={DOWN_X} y={GROUND - 22} width={SVG_W - DOWN_X} height="22" fill="url(#downGrad)" rx="0" />
            <path d={`M${DOWN_X},${GROUND-20} Q${DOWN_X+18},${GROUND-25} ${DOWN_X+36},${GROUND-20} Q${DOWN_X+54},${GROUND-15} ${DOWN_X+72},${GROUND-20} Q${DOWN_X+90},${GROUND-25} ${DOWN_X+108},${GROUND-20}`}
                fill="none" stroke="#7dd3fc" strokeWidth="1.5" opacity="0.6">
                <animateTransform attributeName="transform" type="translate" from="0,0" to="-36,0" dur="2s" repeatCount="indefinite" />
            </path>

            {/* ── Turbine symbol ── */}
            <circle cx={DOWN_X + 20} cy={GROUND - 11} r="10" fill="#1e3a8a" opacity="0.9" />
            <text x={DOWN_X + 20} y={GROUND - 7} fontSize="11" fill="white" textAnchor="middle" fontWeight="bold">⚙</text>

            {/* ── Q xả label ── */}
            {luuluongxa > 0 && (
                <g>
                    <rect x={DOWN_X + 34} y={GROUND - 42} width="76" height="17" rx="4" fill="#ef4444" opacity="0.9" />
                    <text x={DOWN_X + 72} y={GROUND - 30} fontSize="8.5" fill="white" textAnchor="middle" fontWeight="bold">
                        Xả: {luuluongxa.toFixed(0)} m³/s
                    </text>
                </g>
            )}

            {/* ── Inflow arrow ── */}
            {qvao > 0 && (
                <g>
                    <defs>
                        <marker id="arrowQ" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                            <path d="M0,0 L7,3.5 L0,7 Z" fill="#f59e0b" />
                        </marker>
                    </defs>
                    <path d="M6,170 L46,170" stroke="#f59e0b" strokeWidth="3" markerEnd="url(#arrowQ)">
                        <animate attributeName="stroke-dasharray" values="0 60;60 0" dur="1.2s" repeatCount="indefinite" />
                    </path>
                    <rect x="2" y="154" width="58" height="15" rx="3" fill="#f59e0b" opacity="0.9" />
                    <text x="31" y="165" fontSize="8" fill="white" textAnchor="middle" fontWeight="bold">
                        Q: {qvao.toFixed(0)} m³/s
                    </text>
                </g>
            )}

            {/* ── Level reference lines ── */}
            {/* MNC */}
            {mncY > 40 && mncY < GROUND - 5 && <g>
                <line x1="2" y1={mncY} x2={UP_CLIP - 4} y2={mncY} stroke="#64748b" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
                <rect x="2" y={mncY - 9} width="34" height="10" rx="2" fill="#64748b" opacity="0.8" />
                <text x="19" y={mncY - 1} fontSize="7" fill="white" textAnchor="middle" fontWeight="bold">MNC</text>
            </g>}
            {/* MNDBT */}
            {mndbtY > 40 && mndbtY < GROUND - 5 && <g>
                <line x1="2" y1={mndbtY} x2={UP_CLIP - 4} y2={mndbtY} stroke="#f59e0b" strokeWidth="1.3" strokeDasharray="5 3" />
                <rect x="2" y={mndbtY - 9} width="42" height="10" rx="2" fill="#f59e0b" opacity="0.9" />
                <text x="23" y={mndbtY - 1} fontSize="7" fill="white" textAnchor="middle" fontWeight="bold">MNDBT</text>
            </g>}
            {/* MNGC */}
            {mngcY > 40 && mngcY < GROUND - 5 && <g>
                <line x1="2" y1={mngcY} x2={UP_CLIP - 4} y2={mngcY} stroke="#ef4444" strokeWidth="1.3" strokeDasharray="5 3" />
                <rect x="2" y={mngcY - 9} width="38" height="10" rx="2" fill="#ef4444" opacity="0.9" />
                <text x="21" y={mngcY - 1} fontSize="7" fill="white" textAnchor="middle" fontWeight="bold">MNGC</text>
            </g>}

            {/* ── Current HTL line ── */}
            <line x1="2" y1={waterY} x2={UP_CLIP - 4} y2={waterY} stroke={waterColor} strokeWidth="2.5" opacity="0.95">
                <animate attributeName="opacity" values="0.95;0.45;0.95" dur="2s" repeatCount="indefinite" />
            </line>
            <rect x="120" y={waterY - 12} width="60" height="13" rx="3" fill={waterColor} opacity="0.95" />
            <text x="150" y={waterY - 2} fontSize="8" fill="white" textAnchor="middle" fontWeight="bold">
                Z = {htl.toFixed(2)} m
            </text>

            {/* ── Vertical gauge (right edge) ── */}
            <g transform={`translate(${GAUGE_X}, 40)`}>
                {/* Track background */}
                <rect x="0" y="0" width="10" height={GROUND - 40} rx="4"
                    fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1" />
                {/* Water fill in gauge */}
                <rect x="0" y={waterY - 40} width="10" height={GROUND - waterY} rx="3" fill={waterColor} opacity="0.7">
                    <animate attributeName="height"
                        values={`${GROUND - waterY};${GROUND - waterY + 4};${GROUND - waterY}`}
                        dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="y"
                        values={`${waterY - 40};${waterY - 44};${waterY - 40}`}
                        dur="2.5s" repeatCount="indefinite" />
                </rect>
                {/* Tick marks for MNC/MNDBT/MNGC */}
                {[c.MNC, c.MNDBT, c.MNGC, c.crest].map((z, i) => {
                    const ty = zToY(z) - 40;
                    const cols = ['#64748b','#f59e0b','#ef4444','#475569'];
                    return <g key={z}>
                        <line x1="-5" y1={ty} x2="0" y2={ty} stroke={cols[i]} strokeWidth="1.5" />
                        <text x="-7" y={ty + 3} fontSize="6.5" fill={cols[i]} textAnchor="end" fontWeight="bold">{z}</text>
                    </g>;
                })}
                {/* Current level pointer */}
                <polygon points={`12,${waterY-40} 18,${waterY-37} 18,${waterY-43}`} fill={waterColor} />
            </g>

            {/* Fill % label */}
            <text x={SVG_W - 4} y={SVG_H - 3} fontSize="8.5" fill="#64748b" textAnchor="end" fontWeight="bold">
                {fillPct.toFixed(1)}% đầy
            </text>
        </svg>
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

    // ── Dữ liệu từ API (thay thế LAKE_CONSTANTS hard-code) ────────────────────
    const [lakeSpec, setLakeSpec]       = useState(null);   // thông số kỹ thuật
    const [volumeInfo, setVolumeInfo]   = useState(null);   // V hồ từ Z-V nội suy
    const [powerInfo, setPowerInfo]     = useState(null);   // công suất real-time
    const [recFromDB, setRecFromDB]     = useState(null);   // khuyến nghị từ backend

    // Fallback: dùng LAKE_CONSTANTS nếu chưa fetch được spec
    const c = lakeSpec ? {
        MNC:      lakeSpec.MNC,
        MNDBT:    lakeSpec.MNDBT,
        MNGC:     lakeSpec.MNGC,
        crest:    lakeSpec.crest,
        totalVol: lakeSpec.total_volume,
        deadVol:  lakeSpec.dead_volume,
        floodVol: lakeSpec.flood_volume,
        turbines: lakeSpec.turbines,
        capacity: lakeSpec.capacity_mw,
    } : getLakeConst(lakeId || selectedReservoir);

    // NOTE: clock is in <LiveClock /> — no state here to avoid re-rendering

    // Max P90 in next 12h — used for recommendation
    const forecastPeak = useMemo(() => {
        if (!forecastData.length) return latestHydro.qvao;
        const future = forecastData.filter(d => d.isForecast);
        if (!future.length) return latestHydro.qvao;
        return Math.max(...future.map(d => d.p50 || 0));
    }, [forecastData, latestHydro.qvao]);

    // Khuyến nghị: ưu tiên từ DB, fallback tính local
    const rec = useMemo(() =>
        recFromDB || computeRecommendation({
            htl: latestHydro.htl,
            qvao: latestHydro.qvao,
            luuluongxa: latestHydro.luuluongxa,
            forecastPeak,
        }),
    [recFromDB, latestHydro, forecastPeak]);

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

    // ─── Fetch lake spec từ DB (thay LAKE_CONSTANTS hard-code) ────────────────
    useEffect(() => {
        const id = lakeId || selectedReservoir;
        if (!id) return;
        mapApi.getLakeSpec(id)
            .then(spec => setLakeSpec(spec))
            .catch(() => {}); // fallback về LAKE_CONSTANTS nếu chưa seed
    }, [selectedReservoir, lakeId]);

    // ─── Fetch volume (Z→V nội suy) + power + khuyến nghị khi hydro thay đổi ─
    useEffect(() => {
        const id  = lakeId || selectedReservoir;
        const htl = latestHydro.htl;
        const q   = latestHydro.luuluongxa;
        if (!id || !htl) return;

        // Dung tích hồ từ Z-V curve
        mapApi.getVolume(id, htl)
            .then(v => setVolumeInfo(v))
            .catch(() => {});

        // Công suất phát điện
        if (q > 0) {
            mapApi.getPower(id, htl, q)
                .then(p => setPowerInfo(p))
                .catch(() => {});
        }

        // Khuyến nghị vận hành từ backend
        mapApi.operationRec(id, {
            htl,
            q_in:  latestHydro.qvao,
            q_out: q,
            forecast_peak: forecastPeak || latestHydro.qvao,
        })
            .then(r => setRecFromDB(r))
            .catch(() => {});
    }, [latestHydro, forecastPeak, selectedReservoir, lakeId]);

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

                {/* Left Column (30%) */}
                <div className="w-full xl:w-[30%] flex flex-col gap-3">

                    {/* ── Dam cross-section card ── */}
                    {(() => {
                        // Dùng c từ component scope (lakeSpec từ DB, fallback LAKE_CONSTANTS)
                        const fillPct = volumeInfo?.fill_pct ??
                            Math.max(0, Math.min(100, ((latestHydro.htl - c.MNC) / (c.crest - c.MNC)) * 100));
                        const isFlood = latestHydro.htl >= c.MNGC;
                        const isWarn  = latestHydro.htl >= c.MNDBT;
                        const statusColor = isFlood ? "text-red-600 bg-red-50 border-red-200" : isWarn ? "text-amber-600 bg-amber-50 border-amber-200" : "text-emerald-600 bg-emerald-50 border-emerald-200";
                        const statusLabel = isFlood ? "⚠ LŨ KHẨN CẤP" : isWarn ? "⚠ CHÚ Ý" : "✓ BÌNH THƯỜNG";

                        // Dung tích từ API (nội suy Z-V), fallback tuyến tính
                        const vHo    = volumeInfo?.volume ?? ((fillPct / 100) * (c.totalVol - c.deadVol) + c.deadVol);
                        const vTrong = c.totalVol - vHo;
                        const vPL    = Math.max(0, vHo - (c.totalVol - c.floodVol));

                        return (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                                {/* Header */}
                                <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-blue-900 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Droplets size={16} className="text-blue-300" />
                                        <span className="text-white font-black text-sm tracking-wide">MẶT CẮT HỒ CHỨA</span>
                                    </div>
                                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${statusColor}`}>{statusLabel}</span>
                                </div>

                                {/* SVG dam */}
                                <div className="bg-gradient-to-b from-sky-100 to-slate-100 px-2 pt-2" style={{ height: 280 }}>
                                    <DamCrossSection
                                        htl={latestHydro.htl}
                                        qvao={latestHydro.qvao}
                                        luuluongxa={latestHydro.luuluongxa}
                                        lakeId={lakeId || selectedReservoir}
                                    />
                                </div>

                                {/* Mực nước + Q badges */}
                                <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
                                    {[
                                        { label: "Mực nước", val: `${latestHydro.htl.toFixed(2)} m`, color: "text-blue-700", bg: "bg-blue-50" },
                                        { label: "Q vào",   val: `${latestHydro.qvao.toFixed(1)} m³/s`, color: "text-amber-600", bg: "bg-amber-50" },
                                        { label: "Q xả",    val: `${latestHydro.luuluongxa.toFixed(1)} m³/s`, color: "text-red-600", bg: "bg-red-50" },
                                    ].map(({ label, val, color, bg }) => (
                                        <div key={label} className={`${bg} px-2 py-2 text-center`}>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase">{label}</p>
                                            <p className={`text-xs font-black ${color} mt-0.5 leading-tight`}>{val}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Volume breakdown */}
                                <div className="px-4 py-3 space-y-1.5">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">DUNG TÍCH HỒ</p>
                                    {/* Fill bar */}
                                    <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                        <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000"
                                            style={{ width: `${fillPct}%`, background: isFlood ? 'linear-gradient(90deg,#ef4444,#dc2626)' : isWarn ? 'linear-gradient(90deg,#f59e0b,#d97706)' : 'linear-gradient(90deg,#3b82f6,#0ea5e9)' }}>
                                            <div className="absolute inset-0 opacity-40"
                                                style={{ background: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.3) 4px,rgba(255,255,255,0.3) 8px)' }} />
                                        </div>
                                        <span className="absolute right-2 top-0 h-full flex items-center text-[9px] font-black text-slate-600">{fillPct.toFixed(1)}%</span>
                                    </div>
                                    {/* Volume rows */}
                                    {[
                                        { label: "V. phòng lũ", val: `${vPL.toFixed(1)} tr.m³`,  color: "text-blue-700",    dot: "bg-blue-500" },
                                        { label: "V. trống",    val: `${vTrong.toFixed(1)} tr.m³`, color: "text-slate-600",  dot: "bg-slate-300" },
                                        { label: "V. hồ TT",   val: `${vHo.toFixed(1)} tr.m³`,   color: "text-sky-700",     dot: "bg-sky-500", bold: true },
                                        { label: "V. toàn bộ", val: `${c.totalVol} tr.m³`,        color: "text-slate-400",   dot: "bg-slate-200" },
                                    ].map(({ label, val, color, dot, bold }) => (
                                        <div key={label} className={`flex justify-between items-center py-0.5 ${bold ? "border-t border-slate-100 pt-1.5 mt-0.5" : ""}`}>
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-2 h-2 rounded-full ${dot}`} />
                                                <span className="text-[10px] text-slate-500 font-semibold">{label}</span>
                                            </div>
                                            <span className={`text-[10px] font-black ${color}`}>{val}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Operational thresholds card ── */}
                    {(() => {
                        const htl = latestHydro.htl;
                        return (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                                    <Shield size={14} className="text-slate-600" />
                                    <span className="text-xs font-black text-slate-600 uppercase tracking-wide">Ngưỡng vận hành</span>
                                </div>
                                <div className="px-4 py-3 space-y-2 text-[10px]">
                                    {[
                                        { label: "Đỉnh đập (Crest)", val: c.crest,  color: "text-slate-700 bg-slate-100",  active: false },
                                        { label: "MNGC (Gia cường)", val: c.MNGC,   color: "text-red-700 bg-red-50 border border-red-200", active: htl >= c.MNGC },
                                        { label: "MNDBT (Bình thường)", val: c.MNDBT, color: "text-amber-700 bg-amber-50 border border-amber-200", active: htl >= c.MNDBT && htl < c.MNGC },
                                        { label: "Hiện tại (HTL)",   val: htl.toFixed(2), color: "text-blue-700 bg-blue-50 border border-blue-300 font-black", active: true, pulse: true },
                                        { label: "MNC (Chết)",       val: c.MNC,   color: "text-slate-500 bg-slate-50 border border-slate-200", active: false },
                                    ].map(({ label, val, color, active, pulse }) => (
                                        <div key={label} className={`flex justify-between items-center px-2.5 py-1.5 rounded-lg ${color} ${active ? "shadow-sm" : ""}`}>
                                            <div className="flex items-center gap-1.5">
                                                {pulse && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                                                <span className={active ? "font-black" : "font-semibold"}>{label}</span>
                                            </div>
                                            <span className="font-black">{val} m</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Generator / Power card ── */}
                    {(() => {
                        // Ưu tiên powerInfo từ API (tính chính xác), fallback tính local
                        const powerEst = powerInfo?.power_mw ??
                            Math.round((latestHydro.luuluongxa *
                                Math.max(0, latestHydro.htl - (lakeSpec?.tailwater_elev ?? 120)) *
                                9.81 * (lakeSpec?.turbine_efficiency ?? 0.88)) / 1000);
                        const headVal  = powerInfo?.head_net ??
                            Math.max(0, latestHydro.htl - (lakeSpec?.tailwater_elev ?? 120));
                        const capMW    = c.capacity || 190;
                        const effStr   = `${((lakeSpec?.turbine_efficiency ?? 0.88) * 100).toFixed(0)}%`;
                        const turbines = c.turbines || 2;
                        return (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-4 py-2.5 bg-gradient-to-r from-yellow-50 to-amber-50 border-b border-amber-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Zap size={14} className="text-yellow-500" />
                                        <span className="text-xs font-black text-amber-800 uppercase tracking-wide">Phát điện</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-[10px] text-emerald-700 font-bold">HOẠT ĐỘNG</span>
                                    </div>
                                </div>
                                <div className="px-4 py-3">
                                    <div className="flex items-center gap-4 mb-3">
                                        <div className="w-14 h-14 rounded-full border-4 border-blue-200 bg-blue-50 flex items-center justify-center shrink-0">
                                            <Settings size={28} className="text-blue-500" style={{ animation: 'spin 4s linear infinite' }} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">
                                                Công suất {powerInfo ? '(từ DB)' : '(ước tính)'}
                                            </p>
                                            <p className="text-2xl font-black text-blue-700">
                                                {typeof powerEst === 'number' ? powerEst.toFixed(1) : '—'} <span className="text-sm font-bold">MW</span>
                                            </p>
                                            <p className="text-[10px] text-slate-400">Thiết kế: {capMW} MW</p>
                                        </div>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                                        <div className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full transition-all duration-1000"
                                            style={{ width: `${Math.min(100, ((powerEst || 0) / capMW) * 100)}%` }} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        {[
                                            { label: `Tổ máy ×${turbines}`, val: `${((powerEst||0) / turbines).toFixed(1)} MW/tổ`, color: "text-blue-600" },
                                            { label: "Cột nước",            val: `${headVal.toFixed(1)} m`,                          color: "text-cyan-600" },
                                            { label: "Q phát điện",         val: `${latestHydro.luuluongxa.toFixed(1)} m³/s`,         color: "text-amber-600" },
                                            { label: "Hiệu suất",           val: effStr,                                              color: "text-emerald-600" },
                                        ].map(({ label, val, color }) => (
                                            <div key={label} className="bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-100">
                                                <p className="text-slate-400 font-semibold">{label}</p>
                                                <p className={`font-black ${color} mt-0.5`}>{val}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
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
