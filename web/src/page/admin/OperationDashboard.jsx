import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatLakeName } from "../../utils/lakeName";
import mapApi from "../../api/mapApi";
import { fetchRainForecast, buildRainLabelMap, RAIN_SOURCES } from "../../api/openMeteoApi";
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

// ─── Heuristic: recommend discharge (per-lake thresholds) ─────────────────────
// Nhận lakeConst để dùng đúng MNC/MNDBT/MNGC/crest theo từng hồ
function computeRecommendation({ htl, qvao, luuluongxa, forecastPeak, lakeConst, t }) {
    const MNC    = lakeConst?.MNC   ?? 0;
    const MNDBT  = lakeConst?.MNDBT ?? htl * 1.05;
    const MNGC   = lakeConst?.MNGC  ?? MNDBT * 1.01;

    const fill = MNC < MNDBT
        ? Math.max(0, Math.min(1, (htl - MNC) / (MNDBT - MNC)))
        : 0;

    const qPeak = forecastPeak || qvao;

    let level = "ok";
    let qRec  = luuluongxa;
    let reason = "";
    let detail = "";

    const tr = t || ((k, p) => k); // fallback if t not provided

    if (htl >= MNGC) {
        level  = "danger";
        qRec   = Math.max(qvao * 1.5, luuluongxa * 1.3, 1);
        reason = tr('operation.reason_danger');
        detail = tr('operation.detail_danger', { htl: htl.toFixed(2), mngc: MNGC, qRec: qRec.toFixed(0) });
    } else if (htl >= MNDBT) {
        level  = "warning";
        qRec   = Math.max(qvao * 1.2, luuluongxa * 1.1, 1);
        reason = tr('operation.reason_warning_mndbt');
        detail = tr('operation.detail_warning_mndbt', { htl: htl.toFixed(2), mndbt: MNDBT, qRec: qRec.toFixed(0), qPeak: qPeak.toFixed(0) });
    } else if (fill > 0.85) {
        level  = "warning";
        qRec   = qvao > luuluongxa ? qvao * 1.05 : luuluongxa;
        reason = tr('operation.reason_warning_85');
        detail = tr('operation.detail_warning_85', { fill: (fill * 100).toFixed(1), qRec: qRec.toFixed(0) });
    } else if (fill < 0.3 && qvao < 20) {
        level  = "ok";
        qRec   = Math.max(luuluongxa * 0.8, 0);
        reason = tr('operation.reason_low');
        detail = tr('operation.detail_low', { fill: (fill * 100).toFixed(1), htl: htl.toFixed(2), qRec: qRec.toFixed(0) });
    } else {
        level  = "ok";
        qRec   = luuluongxa;
        reason = tr('operation.reason_ok');
        detail = tr('operation.detail_ok', { fill: (fill * 100).toFixed(1), htl: htl.toFixed(2), qRec: qRec.toFixed(0), qPeak: qPeak.toFixed(0) });
    }

    return { level, qRec, reason, detail };
}

// ─── Reservoir status narrative ────────────────────────────────────────────────
function buildStatusNarrative({ htl, qvao, luuluongxa, t }) {
    const tr = t || ((k) => k);
    const base = tr('operation.narrative_base', { htl: htl.toFixed(2), qvao: qvao.toFixed(1), luuluongxa: luuluongxa.toFixed(1) });
    const trend = qvao > luuluongxa
        ? tr('operation.narrative_filling')
        : qvao < luuluongxa
        ? tr('operation.narrative_discharging')
        : tr('operation.narrative_balanced');
    return `${base} ${trend}`;
}

// ─── Reservoir operational constants (per lake) ───────────────────────────────
// MNC=chết, MNDBT=dâng bình thường, MNGC=gia cường, crest=đỉnh đập
// ID khớp với InflowLake.Id_Lake (15 hồ)
const LAKE_CONSTANTS = {
    1:  { MNC:340.0, MNDBT:380.0, MNGC:381.0, crest:382.0, totalVol:343.5, deadVol: 77.5, floodVol: 80, turbines:2, capacity:210, maxTurbineFlow:320 }, // A Vương
    2:  { MNC:225.0, MNDBT:258.0, MNGC:260.5, crest:261.5, totalVol:312.3, deadVol: 97, floodVol: 80, turbines:3, capacity:208, maxTurbineFlow:280 }, // Đắk Mi 4
    3:  { MNC:205.0, MNDBT:222.5, MNGC:224.0, crest:225.0, totalVol:510.8, deadVol: 276.8, floodVol: 70, turbines:2, capacity:156, maxTurbineFlow:330 }, // Sông Bung 4
    4:  { MNC:158.0, MNDBT:175.0, MNGC:176.5, crest:177.0, totalVol:730.0, deadVol:215, floodVol:190, turbines:2, capacity:190, maxTurbineFlow:380 }, // Sông Tranh 2
    7:  { MNC:130.0, MNDBT:138.0, MNGC:139.0, crest:140.0, totalVol: 20, deadVol:  5, floodVol:  8, turbines:1, capacity: 16, maxTurbineFlow: 40 }, // Sông Bung 4A
    8:  { MNC:175.0, MNDBT:185.0, MNGC:186.5, crest:187.5, totalVol:100, deadVol: 28, floodVol: 30, turbines:2, capacity: 50, maxTurbineFlow:130 }, // Sông Bung 5
    9:  { MNC:330.0, MNDBT:340.0, MNGC:342.0, crest:343.0, totalVol:250, deadVol: 70, floodVol: 60, turbines:2, capacity:100, maxTurbineFlow:185 }, // Sông Bung 2
    11: { MNC: 93.0, MNDBT:100.0, MNGC:101.0, crest:102.0, totalVol: 50, deadVol: 12, floodVol: 15, turbines:1, capacity: 30, maxTurbineFlow: 95 }, // Sông Bung 6
    12: { MNC: 60.0, MNDBT: 65.0, MNGC: 66.0, crest: 67.0, totalVol: 60, deadVol: 15, floodVol: 18, turbines:2, capacity: 60, maxTurbineFlow:215 }, // Sông Tranh 3
    13: { MNC:150.0, MNDBT:160.0, MNGC:161.5, crest:162.5, totalVol:130, deadVol: 35, floodVol: 40, turbines:2, capacity: 90, maxTurbineFlow:175 }, // Za Hung
    14: { MNC:340.0, MNDBT:352.0, MNGC:353.5, crest:354.5, totalVol: 70, deadVol: 18, floodVol: 20, turbines:1, capacity: 30, maxTurbineFlow: 50 }, // Đắk Mi 3
    15: { MNC: 18.0, MNDBT: 24.0, MNGC: 25.0, crest: 26.0, totalVol: 35, deadVol:  8, floodVol: 10, turbines:1, capacity: 30, maxTurbineFlow:225 }, // Khe Diên
    16: { MNC:320.0, MNDBT:334.0, MNGC:335.5, crest:336.5, totalVol: 90, deadVol: 22, floodVol: 25, turbines:2, capacity: 60, maxTurbineFlow:100 }, // Sông Côn 2
    17: { MNC: 53.0, MNDBT: 58.0, MNGC: 59.0, crest: 60.0, totalVol: 40, deadVol: 10, floodVol: 12, turbines:1, capacity: 40, maxTurbineFlow:150 }, // Sông Tranh 4
    19: { MNC:153.0, MNDBT:162.0, MNGC:163.0, crest:164.0, totalVol: 45, deadVol: 12, floodVol: 15, turbines:1, capacity: 35, maxTurbineFlow: 75 }, // Đắk Mi 4C
};
function getLakeConst(id) { return LAKE_CONSTANTS[Number(id)] || null; }

// ─── Animated Dam Cross-Section (SVG) ─────────────────────────────────────────
function DamCrossSection({ htl, qvao, luuluongxa, q_turbine, q_spillway, lakeId, maxTurbineFlow: maxTurbFlowProp, t: tProp }) {
    const { t: tHook } = useTranslation();
    const t = tProp || tHook;
    const c = getLakeConst(lakeId);
    if (!c) return (
        <div className="flex items-center justify-center h-full text-slate-400 text-xs text-center p-4">
            {t('operation.noSpecs')}
        </div>
    );
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

    // Dùng giá trị thực từ API; fallback nếu chưa có dữ liệu phân tách
    const qtran = q_spillway ?? luuluongxa;
    const qmay  = q_turbine  ?? 0;

    // Gate opening proportional to discharge flow
    const maxTurb  = maxTurbFlowProp ?? c?.maxTurbineFlow ?? luuluongxa;
    const gateOpen = luuluongxa > 0 ? Math.min(28, Math.max(6, (luuluongxa / Math.max(maxTurb * 0.5, luuluongxa, 1)) * 28)) : 0;

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
            <text x="183" y="38" fontSize="8.5" fill="#475569" textAnchor="middle" fontWeight="bold">{t('operation.damCrest', { elev: c.crest })}</text>

            {/* ── Spillway gate (cửa xả tràn) — hiển thị khi có xả ── */}
            {luuluongxa > 0 && (() => {
                // Vị trí cửa xả: trên mặt đập phía hạ lưu, gần đỉnh
                const gateH = Math.min(22, Math.max(8, gateOpen));
                const gateY = 50;   // y-start của cửa (gần đỉnh đập)
                const gateX = DAM_TR - 3; // bên mặt hạ lưu đập
                return (
                    <g>
                        {/* Khung cửa van */}
                        <rect x={gateX} y={gateY} width="9" height={gateH + 4}
                            fill="#94a3b8" opacity="0.9" rx="1" />
                        {/* Cửa van (màu đỏ = đang mở) */}
                        <rect x={gateX + 1} y={gateY + 2} width="7" height={gateH}
                            fill="#ef4444" opacity="0.92" rx="1" />
                        {/* Highlight cửa */}
                        <rect x={gateX + 2} y={gateY + 3} width="2" height={gateH - 2}
                            fill="white" opacity="0.3" rx="0.5" />
                    </g>
                );
            })()}

            {/* ── Đường nước cong chảy qua tràn — luôn hiển thị khi luuluongxa > 0 ── */}
            {luuluongxa > 0 && (() => {
                // Điểm bắt đầu: đỉnh đập phía hạ lưu (DAM_TR, 40)
                // Đường cong: từ mặt đập → xuống hạ lưu theo đường cong tự nhiên
                const sx = DAM_TR;
                const sy = 42;
                const ex = DAM_BR + 22;
                const ey = GROUND - 18;
                // Control points tạo đường cong mượt mà
                const cx1 = DAM_TR + 6;
                const cy1 = 85;
                const cx2 = DAM_TR + 20;
                const cy2 = 165;
                const w1 = Math.min(6, 2.5 + luuluongxa / 40);
                const w2 = Math.min(4, 1.5 + luuluongxa / 60);
                return (
                    <g>
                        {/* Đường nước chính */}
                        <path d={`M${sx},${sy} C${cx1},${cy1} ${cx2},${cy2} ${ex},${ey}`}
                            fill="none" stroke="#7dd3fc" strokeWidth={w1} opacity="0.9" strokeLinecap="round">
                            <animate attributeName="stroke-dasharray"
                                values={`0 300;${w1*20} ${w1*8};0 300`}
                                dur="1s" repeatCount="indefinite" />
                        </path>
                        {/* Đường nước phụ (offset nhỏ để tạo chiều rộng) */}
                        <path d={`M${sx+3},${sy+2} C${cx1+4},${cy1+8} ${cx2+5},${cy2+5} ${ex+6},${ey+2}`}
                            fill="none" stroke="#38bdf8" strokeWidth={w2} opacity="0.6" strokeLinecap="round">
                            <animate attributeName="stroke-dasharray"
                                values={`0 300;${w2*18} ${w2*6};0 300`}
                                dur="1.3s" repeatCount="indefinite" />
                        </path>
                        {/* Label Vận xả tràn */}
                        <rect x={DAM_TR + 12} y={90} width="72" height="18" rx="4" fill="#0284c7" opacity="0.92" />
                        <text x={DAM_TR + 48} y={103} fontSize="7.5" fill="white" textAnchor="middle" fontWeight="bold">
                            {t('operation.spillway', { flow: qtran.toFixed(0) })}
                        </text>
                    </g>
                );
            })()}

            {/* ── Downstream water (tail water) ── */}
            <rect x={DOWN_X} y={GROUND - 22} width={SVG_W - DOWN_X} height="22" fill="url(#downGrad)" rx="0" />
            <path d={`M${DOWN_X},${GROUND-20} Q${DOWN_X+18},${GROUND-25} ${DOWN_X+36},${GROUND-20} Q${DOWN_X+54},${GROUND-15} ${DOWN_X+72},${GROUND-20} Q${DOWN_X+90},${GROUND-25} ${DOWN_X+108},${GROUND-20}`}
                fill="none" stroke="#7dd3fc" strokeWidth="1.5" opacity="0.6">
                <animateTransform attributeName="transform" type="translate" from="0,0" to="-36,0" dur="2s" repeatCount="indefinite" />
            </path>

            {/* ── Turbine symbol ── */}
            <circle cx={DOWN_X + 20} cy={GROUND - 11} r="10" fill="#1e3a8a" opacity="0.9" />
            <text x={DOWN_X + 20} y={GROUND - 7} fontSize="11" fill="white" textAnchor="middle" fontWeight="bold">⚙</text>

            {/* ── Q chạy máy label ── */}
            {qmay > 0 && (
                <g>
                    <rect x={DOWN_X + 34} y={GROUND - 42} width="82" height="17" rx="4" fill="#1e3a8a" opacity="0.9" />
                    <text x={DOWN_X + 75} y={GROUND - 30} fontSize="8" fill="white" textAnchor="middle" fontWeight="bold">
                        {t('operation.turbine', { flow: qmay.toFixed(0) })}
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
                        {t('operation.inflow', { flow: qvao.toFixed(0) })}
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
                {t('operation.fillPct', { pct: fillPct.toFixed(1) })}
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
    const { t, i18n } = useTranslation();
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

    // ── Phase 4: Cảnh báo & Nhật ký vận hành ─────────────────────────────────
    const [reservoirAlerts, setReservoirAlerts] = useState([]);
    const [opLogs, setOpLogs]                   = useState([]);
    const [showOpLog, setShowOpLog]             = useState(false);
    const [alertChecking, setAlertChecking]     = useState(false);

    // ── Mưa dự báo Open-Meteo (best_match) ───────────────────────────────────
    const [rainLabelMap, setRainLabelMap] = useState(new Map()); // fullLabel → { bestMatch }

    // Ưu tiên: LakeSpec từ DB → LAKE_CONSTANTS frontend → null (hiển thị cảnh báo)
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
    // c === null → hồ chưa có thông số, UI sẽ hiện cảnh báo

    // NOTE: clock is in <LiveClock /> — no state here to avoid re-rendering

    // Max P90 in next 12h — used for recommendation
    const forecastPeak = useMemo(() => {
        if (!forecastData.length) return latestHydro.qvao;
        const future = forecastData.filter(d => d.isForecast);
        if (!future.length) return latestHydro.qvao;
        return Math.max(...future.map(d => d.p50 || 0));
    }, [forecastData, latestHydro.qvao]);

    // Khuyến nghị: ưu tiên từ DB, fallback tính local
    // Normalize: backend trả q_rec (snake_case), local dùng qRec (camelCase)
    const rec = useMemo(() => {
        const computed = computeRecommendation({
            htl: latestHydro.htl,
            qvao: latestHydro.qvao,
            luuluongxa: latestHydro.luuluongxa,
            forecastPeak,
            lakeConst: getLakeConst(selectedReservoir),
            t,
        });
        return {
            level:   recFromDB?.level  ?? computed.level,
            reason:  computed.reason,
            detail:  computed.detail,
            actions: recFromDB?.actions ?? computed.actions ?? [],
            qRec:    recFromDB?.q_rec ?? computed.qRec ?? 0,
        };
    }, [recFromDB, latestHydro, forecastPeak, i18n.language]);

    const statusNarrative = useMemo(() =>
        buildStatusNarrative({
            htl: latestHydro.htl,
            qvao: latestHydro.qvao,
            luuluongxa: latestHydro.luuluongxa,
            t,
        }),
    [latestHydro, i18n.language]);

    // ─── Thời gian đến ngưỡng (ước tính tuyến tính dùng tỷ lệ dung tích) ────────
    // deltaQ > 0 = đang tích nước, < 0 = đang xả
    const timeToThreshold = useMemo(() => {
        if (!c) return null;
        const { htl, qvao, luuluongxa } = latestHydro;
        const deltaQ = qvao - luuluongxa; // m³/s, dương = tích
        if (Math.abs(deltaQ) < 0.1) return null; // cân bằng → không tính

        // Thể tích cần thay đổi để đến ngưỡng (Mm³ → m³ × 1e6)
        // Dùng tỷ lệ tuyến tính: ΔV = (Δhtl / (crest - MNC)) × totalVol
        const zRange = c.crest - c.MNC;
        const totalM3 = (c.totalVol ?? 0) * 1e6;

        const hoursTo = (targetZ) => {
            if (deltaQ > 0 && targetZ <= htl) return null; // đã vượt
            if (deltaQ < 0 && targetZ >= htl) return null;
            const volNeeded = Math.abs(targetZ - htl) / zRange * totalM3; // m³
            return (volNeeded / Math.abs(deltaQ) / 3600).toFixed(1);      // giờ
        };

        return {
            filling: deltaQ > 0,
            deltaQ,
            hToMNDBT: hoursTo(c.MNDBT),
            hToMNGC:  hoursTo(c.MNGC),
            hToMNC:   hoursTo(c.MNC),
        };
    }, [c, latestHydro]);

    // Lưu lượng môi trường tối thiểu (từ LakeSpec hoặc mặc định 0)
    const minEnvFlow = lakeSpec?.min_env_flow ?? 0;

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
                                "/" +
                                dt.getFullYear() +
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
                    const dt = new Date(d.forecastTime || d.targetTime || d.time);
                    return {
                        _ts: dt,
                        fullLabel:
                            dt.getDate().toString().padStart(2, "0") +
                            "/" +
                            (dt.getMonth() + 1).toString().padStart(2, "0") +
                            "/" +
                            dt.getFullYear() +
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

    // ─── Phase 4: Fetch alerts & op-logs — poll mỗi 5 phút ───────────────────
    useEffect(() => {
        const id = lakeId || selectedReservoir;
        const fetchAlerts = async () => {
            try {
                const [alerts, logs] = await Promise.all([
                    mapApi.getReservoirAlerts(),
                    mapApi.getOperationLogs(id || undefined, 30),
                ]);
                setReservoirAlerts(Array.isArray(alerts) ? alerts : []);
                setOpLogs(Array.isArray(logs) ? logs : []);
            } catch { /* silent */ }
        };
        fetchAlerts();
        const t = setInterval(fetchAlerts, 5 * 60 * 1000); // 5 phút
        return () => clearInterval(t);
    }, [selectedReservoir, lakeId]);

    // ─── Fetch mưa dự báo Open-Meteo (best_match, 3 ngày) ────────────────────
    useEffect(() => {
        const id = lakeId || selectedReservoir;
        if (!id) return;
        let cancelled = false;
        (async () => {
            const rainData = await fetchRainForecast(id, ["best_match", "ecmwf_ifs025", "gfs025", "jma_seamless"], 3);
            if (!cancelled) setRainLabelMap(buildRainLabelMap(rainData));
        })();
        return () => { cancelled = true; };
    }, [selectedReservoir, lakeId]);

    // ─── Merge history + forecast + rain into unified timeline ────────────────
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
                    isForecast: existing.isForecast,
                });
            } else {
                map.set(d.fullLabel, { ...d, qIn: null, qOut: null, waterLevel: null });
            }
        });

        // Merge rain forecast (best_match) từ Open-Meteo
        if (rainLabelMap.size > 0) {
            map.forEach((point, label) => {
                const rain = rainLabelMap.get(label);
                if (rain) map.set(label, { ...point, rainBest: rain.bestMatch });
            });
            // TRUNCATED: Không thêm điểm mưa tương lai nếu chưa có dự báo lưu lượng
        }

        // Sort chronologically
        const sorted = Array.from(map.values()).sort((a, b) => a._ts - b._ts);

        // ── Bridge: nối Q vào thực đo với đường dự báo P50 ──
        if (forecastData.length > 0) {
            let lastRealIdx = -1;
            for (let i = sorted.length - 1; i >= 0; i--) {
                if (sorted[i].qIn != null) { lastRealIdx = i; break; }
            }
            let firstForecastIdx = -1;
            for (let i = 0; i < sorted.length; i++) {
                if (sorted[i].p50 != null) { firstForecastIdx = i; break; }
            }
            if (lastRealIdx !== -1 && firstForecastIdx !== -1) {
                const bridgeQin = sorted[lastRealIdx].qIn;
                sorted[lastRealIdx] = {
                    ...sorted[lastRealIdx],
                    p50: bridgeQin,
                    p10: sorted[firstForecastIdx].p10 != null ? bridgeQin : null,
                    p90: sorted[firstForecastIdx].p90 != null ? bridgeQin : null,
                };
            }
        }

        return sorted;
    }, [chartData, forecastData, rainLabelMap]);

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
                    <Droplets className="text-blue-600 mr-2" size={24} /> {t('lakeModal.tabs.operation')}
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{t('operation.viewingReservoir')}</span>
                        <div className="flex items-center gap-2">
                            <MapIcon size={16} className="text-blue-500" />
                            {!lakeId ? (
                                <select
                                    className="bg-white text-sm font-bold text-gray-800 outline-none border border-gray-300 px-4 py-2 rounded-lg cursor-pointer hover:border-blue-400 transition-colors shadow-sm"
                                    value={selectedReservoir}
                                    onChange={e => setSelectedReservoir(e.target.value)}
                                >
                                    <option value="" disabled>{t('operation.selectReservoir')}</option>
                                    {reservoirs.map(res => (
                                        <option key={res.Id_Lake} value={res.Id_Lake}>
                                            {t('operation.hydroPower', { name: formatLakeName(res.name, i18n.language) })}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <span className="bg-blue-50 text-blue-700 text-sm font-bold px-4 py-2 rounded-lg border border-blue-100 italic">
                                    {t('operation.lakeCode')} {lakeId}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Cảnh báo thiếu thông số kỹ thuật ── */}
            {!c && (lakeId || selectedReservoir) && (
                <div className="mx-5 mt-4 bg-yellow-50 border border-yellow-300 border-l-4 border-l-yellow-500 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                        <p className="text-sm font-bold text-yellow-800">{t('operation.noSpecs')}</p>
                        <p className="text-xs text-yellow-700">{t('operation.noSpecsDetail')}</p>
                    </div>
                </div>
            )}

            {/* ── Alert Banner (Phase 4) — chỉ hiện alert của hồ đang chọn ── */}
            {reservoirAlerts.filter(a => a.alert_level !== 'normal' && String(a.lake_id) === String(lakeId || selectedReservoir)).length > 0 && (
                <div className="mx-5 mt-4 rounded-xl overflow-hidden border shadow-lg">
                    {reservoirAlerts.filter(a => a.alert_level !== 'normal' && String(a.lake_id) === String(lakeId || selectedReservoir)).map(alert => {
                        const cfg = {
                            danger:  { bg: 'bg-red-50',    border: 'border-red-300',   icon: '🔴', text: 'text-red-800',   badge: 'bg-red-600',   label: t('operation.alertEmergency') },
                            warning: { bg: 'bg-amber-50',  border: 'border-amber-300', icon: '🟡', text: 'text-amber-800', badge: 'bg-amber-500', label: t('operation.alertWarning') },
                            watch:   { bg: 'bg-blue-50',   border: 'border-blue-200',  icon: '🔵', text: 'text-blue-800',  badge: 'bg-blue-500',  label: t('operation.alertWatch') },
                        }[alert.alert_level] || {};
                        return (
                            <div key={alert.lake_id} className={`${cfg.bg} ${cfg.border} border-l-4 px-4 py-3 flex items-start gap-3`}>
                                <span className="text-xl mt-0.5">{cfg.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full text-white ${cfg.badge}`}>{cfg.label}</span>
                                        <span className={`text-xs font-black ${cfg.text}`}>{formatLakeName(alert.lake_name, i18n.language)}</span>
                                        <span className="text-[10px] text-slate-500 ml-auto">
                                            {alert.checked_at ? new Date(alert.checked_at).toLocaleTimeString('vi-VN') : ''}
                                        </span>
                                    </div>
                                    <p className={`text-xs font-bold ${cfg.text}`}>{alert.reason}</p>
                                    <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-slate-600">
                                        <span>{t('operation.alertHtl')} <b>{alert.htl_current?.toFixed(2)}m</b></span>
                                        <span>{t('operation.alertZmax')} <b className={alert.alert_level==='danger'?'text-red-600':'text-amber-600'}>{alert.htl_forecast_max?.toFixed(2)}m</b></span>
                                        <span>{t('operation.alertPeakAfter')} <b>{alert.hour_to_max}h</b></span>
                                        <span>{t('operation.alertQrec')} <b>{alert.q_recommended?.toFixed(0)} m³/s</b></span>
                                    </div>
                                    {alert.actions?.length > 0 && (
                                        <ul className="mt-1.5 space-y-0.5">
                                            {alert.actions.map((a, i) => (
                                                <li key={i} className={`text-[10px] font-semibold ${cfg.text} flex items-center gap-1`}>
                                                    <span>›</span> {a}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Dashboard Content ── */}
            <div className="p-6 flex flex-col gap-6">
                
                {/* ── Row 1: Dam Section & Stats Cards ── */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    
                    {/* Dam Cross Section */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[320px]">
                        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity size={16} className="text-blue-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest">{t('operation.damSection')}</span>
                            </div>
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">ONLINE</span>
                        </div>
                        <div className="p-4 bg-gradient-to-b from-slate-50 to-white flex-1 relative">
                            <div className="h-[200px] w-full">
                                <DamCrossSection
                                    htl={latestHydro.htl}
                                    qvao={latestHydro.qvao}
                                    luuluongxa={latestHydro.luuluongxa}
                                    q_turbine={latestHydro.q_turbine}
                                    q_spillway={latestHydro.q_spillway}
                                    lakeId={lakeId || selectedReservoir}
                                    maxTurbineFlow={c?.max_turbine_flow ?? c?.maxTurbineFlow}
                                />
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <div className="text-center p-1.5 rounded-lg bg-blue-50 border border-blue-100">
                                    <p className="text-[8px] font-black text-blue-400 uppercase">{t('operation.waterLevelMini')}</p>
                                    <p className="text-sm font-black text-blue-700">{latestHydro.htl.toFixed(2)}m</p>
                                </div>
                                <div className="text-center p-1.5 rounded-lg bg-amber-50 border border-amber-100">
                                    <p className="text-[8px] font-black text-amber-400 uppercase">{t('operation.capacityMini')}</p>
                                    <p className="text-sm font-black text-amber-700">{c ? (((latestHydro.htl-c.MNC)/(c.MNDBT-c.MNC))*100).toFixed(1) : 0}%</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Card 1: Ngưỡng vận hành */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                            <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><AlertTriangle size={18} /></div>
                            <span className="font-black text-xs uppercase tracking-wider text-slate-700">{t('operation.operatingThreshold')}</span>
                        </div>
                        <div className="flex-1 flex flex-col justify-around">
                            <div className="flex justify-between items-center group cursor-help" title={t('operation.deadLevelTitle')}>
                                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {t('operation.mnc')}
                                </span>
                                <span className="font-black text-slate-700">{c?.MNC?.toFixed(2) || '—'} m</span>
                            </div>
                            <div className="flex justify-between items-center group cursor-help" title={t('operation.normalPoolTitle')}>
                                <span className="text-xs font-bold text-amber-600 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {t('operation.mndbt')}
                                </span>
                                <span className="font-black text-amber-600">{c?.MNDBT?.toFixed(2) || '—'} m</span>
                            </div>
                            <div className="flex justify-between items-center group cursor-help" title={t('operation.reinforcedLevelTitle')}>
                                <span className="text-xs font-bold text-red-600 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" /> {t('operation.mngc')}
                                </span>
                                <span className="font-black text-red-600">{c?.MNGC?.toFixed(2) || '—'} m</span>
                            </div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-1">
                                <span>{t('operation.reservoirStatus')}</span>
                                <span className={latestHydro.htl >= (c?.MNDBT||0) ? 'text-red-600' : 'text-blue-600'}>
                                    {latestHydro.htl >= (c?.MNGC||0) ? t('operation.statusDanger') : latestHydro.htl >= (c?.MNDBT||0) ? t('operation.statusNearFull') : t('operation.statusSafe')}
                                </span>
                            </div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-1000 ${latestHydro.htl >= (c?.MNDBT||0) ? 'bg-red-500' : 'bg-blue-500'}`}
                                     style={{ width: `${Math.max(5, Math.min(100, ((latestHydro.htl-(c?.MNC||0))/((c?.MNGC||c?.MNDBT||1)-(c?.MNC||0)))*100))}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Thông số thiết kế */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                            <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Settings size={18} /></div>
                            <span className="font-black text-xs uppercase tracking-wider text-slate-700">{t('operation.designSpecs')}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-y-4">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{t('operation.totalVolume')}</p>
                                <p className="text-sm font-black text-slate-700">{c?.totalVol || '—'} <span className="text-[10px] font-bold">Mm³</span></p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{t('operation.installedCapacity')}</p>
                                <p className="text-sm font-black text-slate-700">{c?.capacity || '—'} <span className="text-[10px] font-bold">MW</span></p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{t('operation.turbineCount')}</p>
                                <p className="text-sm font-black text-slate-700">{c?.turbines || '—'} <span className="text-[10px] font-bold">{t('operation.unit')}</span></p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{t('operation.maxDischarge')}</p>
                                <p className="text-sm font-black text-red-600">{c?.maxTurbineFlow || '—'} <span className="text-[10px] font-bold">m³/s</span></p>
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Vận hành phát điện */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><Zap size={18} /></div>
                            <span className="font-black text-xs uppercase tracking-wider text-slate-700">{t('operation.powerOperation')}</span>
                        </div>
                        <div className="flex-1 flex flex-col justify-center gap-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-full ${latestHydro.luuluongxa > 0 ? 'bg-emerald-500 animate-spin' : 'bg-slate-200'}`}>
                                        <Zap size={12} className="text-white" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-600">{t('operation.powerFlow')}</span>
                                </div>
                                <span className="font-black text-emerald-600 text-base">{latestHydro.luuluongxa.toFixed(1)} <span className="text-[10px]">m³/s</span></span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-full bg-blue-600">
                                        <TrendingUp size={12} className="text-white" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-600">{t('operation.currentPower')}</span>
                                </div>
                                <span className="font-black text-blue-700 text-base">
                                    {c ? (latestHydro.luuluongxa * 0.85 * 9.81 * (latestHydro.htl - (c.MNC+5)) / 1000).toFixed(1) : '—'} 
                                    <span className="text-[10px]"> MW</span>
                                </span>
                            </div>
                        </div>
                        <div className="mt-auto pt-2">
                            <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase mb-1">
                                <span>{t('operation.turbineEff')}</span>
                                <span className="text-emerald-600">85%</span>
                            </div>
                            <div className="h-1 bg-slate-100 rounded-full">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '85%' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Row 2: Full Width Chart ── */}
                <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                    <div className="flex justify-between items-center p-4 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                            <Activity size={14} className="text-blue-500" />
                            <span>{t('operation.chartHeader')}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                <Clock size={14} className="text-slate-400" />
                                <span>{t('operation.updatedAt')} <LiveClock /></span>
                            </div>
                            {forecastData.length > 0 && (
                                <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-black">LSTM FORECAST ACTIVE</span>
                            )}
                        </div>
                    </div>
                    
                    <div className="w-full p-4 h-[520px]">
                        {unifiedData.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-slate-400 text-xs italic">
                                {t('operation.processingChart')}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={unifiedData} margin={{ top: 10, right: 40, left: 10, bottom: 50 }} barCategoryGap="10%">
                                    <defs>
                                        <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                                        </linearGradient>
                                        <linearGradient id="rainBarGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%"  stopColor="#0ea5e9" stopOpacity={0.8} />
                                            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.2} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis
                                        dataKey="fullLabel"
                                        stroke="#94a3b8"
                                        fontSize={9}
                                        fontWeight="700"
                                        axisLine={false}
                                        tickLine={false}
                                        interval={Math.max(1, Math.floor(unifiedData.length / 10))}
                                        height={55}
                                        angle={-35}
                                        textAnchor="end"
                                        tickFormatter={val => {
                                            if (!val || typeof val !== 'string') return val;
                                            const [d, t] = val.split(' ');
                                            return `${t} ${d.substring(0, 5)}`;
                                        }}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        stroke="#64748b"
                                        fontSize={9}
                                        fontWeight="800"
                                        axisLine={false}
                                        tickLine={false}
                                        domain={['auto', 'auto']}
                                        tickFormatter={v => v.toLocaleString()}
                                    />
                                    <YAxis
                                        yAxisId="rain"
                                        orientation="right"
                                        reversed={true}
                                        stroke="#0ea5e9"
                                        fontSize={9}
                                        fontWeight="800"
                                        domain={[0, 100]}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={v => `${v}mm`}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const pt = payload[0].payload;
                                            return (
                                                <div className="bg-white/95 backdrop-blur shadow-xl border border-slate-100 rounded-xl p-3 text-[11px] min-w-[180px]">
                                                    <div className="border-b border-slate-100 pb-1.5 mb-2 flex justify-between items-center">
                                                        <span className="font-black text-slate-500">{label}</span>
                                                        <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black ${pt.isForecast ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'}`}>
                                                            {pt.isForecast ? t('operation.forecastBadge') : t('operation.actualBadge')}
                                                        </span>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        {payload.map((e, i) => e.value != null && (
                                                            <div key={i} className="flex justify-between items-center">
                                                                <div className="flex items-center gap-1.5">
                                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.color }} />
                                                                    <span className="font-bold text-slate-500 uppercase text-[9px]">{e.name}</span>
                                                                </div>
                                                                <span className="font-black text-slate-800">{Number(e.value).toFixed(1)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend
                                        verticalAlign="top"
                                        align="right"
                                        iconType="plainline"
                                        wrapperStyle={{ fontSize: '9px', fontWeight: '800', paddingBottom: '10px' }}
                                    />
                                    <Bar
                                        yAxisId="rain"
                                        dataKey="rainBest"
                                        name={t('operation.legend_rain')}
                                        fill="url(#rainBarGrad)"
                                        maxBarSize={25}
                                        radius={[0, 0, 4, 4]}
                                        isAnimationActive={false}
                                    />
                                    <Area
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="p90"
                                        stroke="none"
                                        fill="url(#forecastBand)"
                                        name={t('operation.legend_band')}
                                        connectNulls
                                        isAnimationActive={false}
                                    />
                                    <Line yAxisId="left" type="monotone" dataKey="waterLevel" name={t('operation.legend_wl')} stroke="#3b82f6" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
                                    <Line yAxisId="left" type="monotone" dataKey="qIn" name={t('operation.legend_qin')} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} connectNulls isAnimationActive={false} />
                                    <Line yAxisId="left" type="monotone" dataKey="qOut" name={t('operation.legend_qout')} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls isAnimationActive={false} />
                                    <Line yAxisId="left" type="monotone" dataKey="p50" name={t('operation.legend_p50')} stroke="#8b5cf6" strokeWidth={3} strokeDasharray="8 4" dot={false} connectNulls isAnimationActive={false} />
                                    <Line yAxisId="left" type="monotone" dataKey="p90" name={t('operation.legend_p90')} stroke="#dc2626" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} />
                                    <Line yAxisId="left" type="monotone" dataKey="p10" name={t('operation.legend_p10')} stroke="#6366f1" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} />
                                    {nowLabel && (
                                        <ReferenceLine
                                            yAxisId="left"
                                            x={nowLabel}
                                            stroke="#ef4444"
                                            strokeWidth={2}
                                            strokeDasharray="4 4"
                                            label={{ value: t('operation.currentRef'), position: "top", fill: "#ef4444", fontSize: 9, fontWeight: "900" }}
                                        />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
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
                            {t('operation.statusExplainTitle')}
                        </div>
                        {showExplain ? <ChevronUp size={18} className="text-blue-600" /> : <ChevronDown size={18} className="text-blue-600" />}
                    </button>

                    {showExplain && (
                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                            {/* Current status */}
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <Activity size={16} className="text-blue-600" /> {t('operation.currentStatusTitle')}
                                </h4>
                                <p className="text-gray-600 leading-relaxed bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                    {statusNarrative}
                                </p>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                        <div className="text-blue-700 font-black text-base">{latestHydro.htl.toFixed(2)}<span className="text-xs font-normal"> m</span></div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{t('operation.upstreamLevelLabel')}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                        <div className="text-amber-600 font-black text-base">{latestHydro.qvao.toFixed(1)}<span className="text-xs font-normal"> m³/s</span></div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{t('operation.qInLabel')}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                        <div className="text-red-600 font-black text-base">{latestHydro.luuluongxa.toFixed(1)}<span className="text-xs font-normal"> m³/s</span></div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{t('operation.qOutLabel')}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Forecast explanation */}
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <TrendingUp size={16} className="text-purple-600" /> {t('operation.lstmExplainTitle')}
                                </h4>
                                {forecastData.length > 0 ? (
                                    <>
                                        <p className="text-gray-600 leading-relaxed bg-purple-50/50 p-4 rounded-lg border border-purple-100">
                                            {t('operation.lstmDesc1', { hours: forecastData.length })}&nbsp;
                                            <span className="text-indigo-600 font-bold">{t('operation.p10Short')}</span>,&nbsp;
                                            <span className="text-purple-700 font-bold">{t('operation.p50Short')}</span>,&nbsp;
                                            <span className="text-red-500 font-bold">{t('operation.p90Short')}</span>.&nbsp;
                                            {t('operation.lstmDesc2')}&nbsp;
                                            <strong className="text-purple-700">{forecastPeak.toFixed(1)} m³/s</strong>.
                                        </p>
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                            <div className="flex items-center gap-2 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                                                <span className="w-6 border-t-2 border-indigo-500 border-dashed inline-block"></span>
                                                <span className="text-indigo-700 font-bold">{t('operation.p10Full')}</span>
                                            </div>
                                            <div className="flex items-center gap-2 bg-purple-50 p-2.5 rounded-lg border border-purple-100">
                                                <span className="w-6 border-t-2 border-purple-600 border-dashed inline-block"></span>
                                                <span className="text-purple-700 font-bold">{t('operation.p50Full')}</span>
                                            </div>
                                            <div className="flex items-center gap-2 bg-red-50 p-2.5 rounded-lg border border-red-100 col-span-2">
                                                <span className="w-6 border-t-2 border-red-500 border-dashed inline-block"></span>
                                                <span className="text-red-600 font-bold">{t('operation.p90Full')}</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-gray-400 italic bg-gray-50 p-4 rounded-lg border border-gray-100">
                                        {t('operation.noLstmData')}
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
                            {t('operation.recTitle')}
                            <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-black ${rec.level === 'danger' ? 'bg-red-100 text-red-700' : rec.level === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {rec.level === 'danger' ? t('operation.lvlDanger') : rec.level === 'warning' ? t('operation.lvlWarning') : t('operation.lvlNormal')}
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
                                    <div className="text-xs text-gray-500">{t('operation.recBasis')}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">{t('operation.propDischarge')}</div>
                                    <div className="font-black text-2xl" style={{ color: recColor }}>{rec.qRec.toFixed(0)}</div>
                                    <div className="text-xs text-gray-500 font-bold">m³/s</div>
                                </div>
                            </div>

                            {/* Flow indicator */}
                            <div className="flex items-center gap-3 mb-5 text-sm font-bold text-gray-600">
                                <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                                    <div className="text-amber-700 text-xs mb-0.5">{t('operation.qInCurrent')}</div>
                                    <div className="text-amber-800 text-lg font-black">{latestHydro.qvao.toFixed(1)} <span className="text-xs font-normal">m³/s</span></div>
                                </div>
                                <ArrowRight size={20} className="text-gray-400 shrink-0" />
                                <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                                    <div className="text-red-600 text-xs mb-0.5">{t('operation.qOutCurrent')}</div>
                                    <div className="text-red-700 text-lg font-black">{latestHydro.luuluongxa.toFixed(1)} <span className="text-xs font-normal">m³/s</span></div>
                                </div>
                                <ArrowRight size={20} className="text-gray-400 shrink-0" />
                                <div className="flex-1 border-2 rounded-lg p-3 text-center" style={{ borderColor: recColor, background: `${recColor}10` }}>
                                    <div className="text-xs mb-0.5 font-bold" style={{ color: recColor }}>{t('operation.suggestDischarge')}</div>
                                    <div className="text-lg font-black" style={{ color: recColor }}>{rec.qRec.toFixed(0)} <span className="text-xs font-normal">m³/s</span></div>
                                </div>
                            </div>

                            {/* Detailed explanation */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                <h5 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-2">
                                    <Info size={14} className="text-blue-600" /> {t('operation.detailExplainTitle')}
                                </h5>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    {rec.detail}
                                </p>
                                <div className="mt-3 pt-3 border-t border-gray-200 text-[11px] text-gray-500 flex items-center gap-2">
                                    <Shield size={12} className="text-blue-500" />
                                    {t('operation.recFooter1')} {lakeSpec?.regulation_doc || 'QĐ 1865/QĐ-TTg'} {t('operation.recFooter2')}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Nhật ký vận hành (Phase 4) ── */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-md overflow-hidden">
                    <button
                        onClick={() => setShowOpLog(v => !v)}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100 hover:bg-slate-100 transition-colors"
                    >
                        <div className="flex items-center gap-3 font-bold text-slate-800 text-sm">
                            <div className="p-1.5 bg-slate-700 rounded-lg text-white">
                                <Database size={15} />
                            </div>
                            {t('operation.opLogTitle')}
                            <span className="ml-1 text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-black">
                                {t('operation.records', { count: opLogs.length })}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    setAlertChecking(true);
                                    try { await mapApi.triggerAlertCheck(); }
                                    catch { /* ignore */ }
                                    setTimeout(async () => {
                                        try {
                                            const id = lakeId || selectedReservoir;
                                            const [alerts, logs] = await Promise.all([
                                                mapApi.getReservoirAlerts(),
                                                mapApi.getOperationLogs(id || undefined, 30),
                                            ]);
                                            setReservoirAlerts(Array.isArray(alerts) ? alerts : []);
                                            setOpLogs(Array.isArray(logs) ? logs : []);
                                        } catch { /* ignore */ }
                                        setAlertChecking(false);
                                    }, 5000);
                                }}
                                className="text-[10px] font-black px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition flex items-center gap-1"
                            >
                                {alertChecking ? t('operation.checking') : t('operation.checkNow')}
                            </button>
                            {showOpLog ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
                        </div>
                    </button>

                    {showOpLog && (
                        <div className="overflow-x-auto">
                            {opLogs.length === 0 ? (
                                <p className="text-center text-slate-400 text-sm py-8">{t('operation.noOpLog')}</p>
                            ) : (
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            {[t('operation.log_time'), t('operation.log_lake'), t('operation.log_htl'), t('operation.log_qin'), t('operation.log_qout'), t('operation.log_qrec'), t('operation.log_power'), t('operation.log_zfore'), t('operation.log_level'), t('operation.log_reason')].map(h => (
                                                <th key={h} className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {opLogs.map((log, i) => {
                                            const levelCfg = {
                                                danger:  'bg-red-100 text-red-700',
                                                warning: 'bg-amber-100 text-amber-700',
                                                watch:   'bg-blue-100 text-blue-700',
                                                low:     'bg-slate-100 text-slate-600',
                                                normal:  'bg-emerald-50 text-emerald-700',
                                            }[log.alert_level] || 'bg-slate-50 text-slate-500';
                                            const logDate = new Date(log.logged_at);
                                            const timeStr = logDate.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'}) + ' ' + logDate.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
                                            return (
                                                <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                                    <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{timeStr}</td>
                                                    <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">{formatLakeName(log.lake_name, i18n.language)}</td>
                                                    <td className="px-3 py-2 font-black text-blue-700">{log.htl?.toFixed(2)}</td>
                                                    <td className="px-3 py-2 text-amber-600 font-bold">{log.q_in?.toFixed(0)}</td>
                                                    <td className="px-3 py-2 text-red-600 font-bold">{log.q_out?.toFixed(0)}</td>
                                                    <td className="px-3 py-2 font-black text-slate-800">{log.q_recommended?.toFixed(0)}</td>
                                                    <td className="px-3 py-2 text-yellow-600 font-bold">{log.power_mw != null ? `${log.power_mw.toFixed(1)} MW` : '—'}</td>
                                                    <td className="px-3 py-2 font-bold text-purple-700">{log.htl_forecast_max?.toFixed(2) ?? '—'}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${levelCfg}`}>
                                                            {log.alert_level?.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate" title={log.reason}>{log.reason}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

