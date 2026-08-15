import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLakeName } from '../../utils/lakeName';
import OperationDashboard from '../../page/admin/OperationDashboard';
import { getAdminToken } from '../../services/auth';
import FloodHistoryTraining from '../../page/admin/FloodHistoryTraining';
import {
    X,
    Droplet,
    Settings,
    Clock,
    BookOpen,
    History,
    Activity,
    Info,
    Calendar,
    CloudRain,
    BarChart3,
    Play,
    Zap,
    Database,
    TrendingUp
} from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ResponsiveContainer,
    Area,
    AreaChart,
    ComposedChart,
    Bar,
    ReferenceLine
} from 'recharts';
import mapApi from '../../api/mapApi';
import axiosClient from '../../api/axiosClient';

// Rain source configs
const RAIN_SOURCES = [
    { id: 'station', label: 'Trạm đo (NCKH)', color: '#2563eb' },
    { id: 'bestmatch', label: 'Best Match', color: '#7c3aed' },
    { id: 'ecmwf', label: 'EU ECMWF', color: '#0891b2' },
    { id: 'gfs', label: 'US GFS', color: '#059669' },
    { id: 'jma', label: 'JP JMA', color: '#dc2626' },
    { id: 'icon', label: 'DE ICON', color: '#ea580c' },
];

// Model configs
const MODELS = [
    { id: 'arimax', label: 'ARIMAX', color: '#7c3aed', icon: <TrendingUp size={14} /> },
    { id: 'lstm', label: 'LSTM', color: '#2563eb', icon: <Zap size={14} /> },
    { id: 'hec', label: 'HEC-HMS', color: '#059669', icon: <BarChart3 size={14} /> },
];

export default function LakeModal({ lakeId, lakeData, onClose }) {
    const { t, i18n } = useTranslation();
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedRainSource, setSelectedRainSource] = useState('station');
    const [selectedModel, setSelectedModel] = useState('lstm');
    const [isRunning, setIsRunning] = useState(false);
    const [forecastResults, setForecastResults] = useState(null);
    const [rainData, setRainData] = useState([]);
    const [forecastHistory, setForecastHistory] = useState([]);
    const [realLstmData, setRealLstmData] = useState([]);
    const [realHistoryData, setRealHistoryData] = useState([]);
    const [rainLakeHistory, setRainLakeHistory] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await axiosClient.post("/inflowlake-history/sync");
            // Refresh data after sync
            const [history, rainHistory] = await Promise.all([
                mapApi.getInflowHistory(lakeId).catch(() => []),
                mapApi.getRainLakeHistory(lakeId).catch(() => []),
            ]);
            setRealHistoryData(history);
            setRainLakeHistory(Array.isArray(rainHistory) ? rainHistory : []);
            alert("Đã đồng bộ xong dữ liệu mới nhất!");
        } catch (err) {
            console.error("❌ Sync failed:", err);
            alert("Đồng bộ thất bại. Vui lòng thử lại sau.");
        } finally {
            setIsSyncing(false);
        }
    };

    // Fetch real data on load and when switching to forecast
    useEffect(() => {
        const fetchData = async () => {
            if (!lakeId) return;
            try {
                const [history, rainHistory] = await Promise.all([
                    mapApi.getInflowHistory(lakeId).catch(() => []),
                    mapApi.getRainLakeHistory(lakeId).catch(() => []),
                ]);
                setRealHistoryData(history);
                setRainLakeHistory(Array.isArray(rainHistory) ? rainHistory : []);

                if (activeTab === 'forecast' && selectedModel === 'lstm') {
                    const lstm = await mapApi.getForecastLstm(lakeId).catch(() => null);
                    if (lstm) {
                        const predictions = Array.isArray(lstm) ? lstm : (lstm.predictions || []);
                        setRealLstmData(predictions);
                    } else {
                        setRealLstmData([]);
                    }
                }
            } catch (err) {
                console.error("❌ Error fetching real data:", err);
            }
        };
        fetchData();
    }, [lakeId, activeTab, selectedModel]);

    if (!lakeId || !lakeData) return null;

    const rawName = lakeData.name || lakeData.Lake_Name || 'Không tên';
    const lakeName = i18n.language === 'en'
        ? formatLakeName(rawName, 'en')
        : rawName.replace(/^HỒ\s+/i, '');

    // Latest record from history (more up-to-date than inflowlakes snapshot)
    const latestRecord = realHistoryData.length > 0
        ? realHistoryData[realHistoryData.length - 1]
        : null;
    const currentQvao = latestRecord?.qvao ?? lakeData.Q_to_Lake ?? 0;
    const currentLuuluongxa = latestRecord?.luuluongxa ?? lakeData.Q_discharge ?? 0;
    const currentHtl = latestRecord?.htl ?? lakeData.WaterLevel_Upstream ?? 0;
    const currentUpdateTime = latestRecord?.timestamp ?? lakeData.lastUpdate ?? null;

    // Real water level chart data from history (htl field)
    const realLevelData = realHistoryData
        .filter(d => d.htl && d.htl > 0)
        .map(d => {
            const dt = new Date(d.timestamp);
            return {
                time: dt.getHours().toString().padStart(2, '0') + ':00 ' +
                    dt.getDate().toString().padStart(2, '0') + '/' +
                    (dt.getMonth() + 1).toString().padStart(2, '0'),
                level: d.htl
            };
        })
        .slice(-48); // Last 48 points

    // Generate unified forecast data (Actuals + Real LSTM + Fallbacks)
    const generateUnifiedData = () => {
        const now = new Date();
        now.setMinutes(0, 0, 0); // Align to hour start

        const formatLabel = (date) =>
            date.getHours().toString().padStart(2, '0') + ':00 ' +
            date.getDate().toString().padStart(2, '0') + '/' +
            (date.getMonth() + 1).toString().padStart(2, '0');

        // Build hour-key string for robust timestamp matching (Local Time)
        const hourKey = (dt) => {
            if (!dt || isNaN(dt.getTime())) return null;
            return dt.getFullYear() + '-' +
                String(dt.getMonth() + 1).padStart(2, '0') + '-' +
                String(dt.getDate()).padStart(2, '0') + 'T' +
                String(dt.getHours()).padStart(2, '0');
        };

        const result = [];
        const START_HISTORY = 36;
        const END_FORECAST = 12;

        let lastKnownActual = null; // carry-forward to bridge gaps in gov data

        for (let i = 0; i <= (START_HISTORY + END_FORECAST); i++) {
            const hourOffset = i - START_HISTORY;
            const targetTime = new Date(now.getTime() + hourOffset * 3600000);
            const label = formatLabel(targetTime);
            const isFuture = hourOffset > 0;
            const isNow = hourOffset === 0;
            const targetKey = hourKey(targetTime);

            // 1. Historical data — match by hour key
            const realPoint = realHistoryData.find(d => hourKey(new Date(d.timestamp)) === targetKey);

            // 2. LSTM forecast — match by hour key
            const realPred = Array.isArray(realLstmData)
                ? realLstmData.find(d => {
                    const dTime = d.targetTime || d.forecastTime || d.time;
                    return dTime && hourKey(new Date(dTime)) === targetKey;
                })
                : null;

            const actualQvao = realPoint ? realPoint.qvao : null;
            // Track last non-null actual to fill gaps when gov API lags
            if (actualQvao !== null) lastKnownActual = actualQvao;

            // Rain matching
            const rainPoint = rainLakeHistory.find(d => hourKey(new Date(d.timestamp)) === targetKey);
            const stationRain = rainPoint ? (rainPoint.sumDepth || 0) : 0;
            const forecastRain = realPred ? (realPred.rain_forecast || realPred.rain || 0) : 0;
            const rainVal = isFuture ? forecastRain : stationRain;

            // Bridge value: actual Q if available, else last known (for gap hours)
            const bridgeVal = actualQvao ?? lastKnownActual;

            const dataPoint = {
                time: label,
                fullTime: targetTime.getHours().toString().padStart(2, '0') + ':00',
                isFuture,
                // Extend actual line through hours where gov data hasn't arrived yet
                qActual: !isFuture ? (actualQvao ?? lastKnownActual) : null,
                // Bridge LSTM forecast to last known actual at "now"
                p50: isNow
                    ? bridgeVal
                    : (realPred ? (realPred.p50 || realPred.qvao_forecast) : null),
                p10: isNow
                    ? bridgeVal
                    : (realPred ? realPred.p10 : null),
                p90: isNow
                    ? bridgeVal
                    : (realPred ? realPred.p90 : null),
                rain: rainVal,
                rain_station: stationRain,
                rain_bestmatch: rainVal,
                rain_ecmwf: null,
                rain_gfs: null,
                rain_jma: null,
                rain_icon: null,
            };

            result.push(dataPoint);
        }

        return result;
    };

    const unifiedData = generateUnifiedData();

    // Run model simulation
    const handleRunModel = async () => {
        setIsRunning(true);
        try {
            // Try to fetch real forecast data
            if (mapApi.getForecastLstm && selectedModel === 'lstm') {
                const result = await mapApi.getForecastLstm(lakeId).catch(() => null);
                if (result) {
                    const predictions = Array.isArray(result) ? result : (result.predictions || []);
                    setRealLstmData(predictions); // Update the state used by unifiedData
                    setForecastResults(result);
                }
            }
            if (mapApi.getForecastHistory) {
                const history = await mapApi.getForecastHistory(lakeId, selectedRainSource).catch(() => null);
                if (history) setForecastHistory(Array.isArray(history) ? history : []);
            }
        } catch (err) {
            console.error("Error running model:", err);
        }
        // Simulate processing time
        setTimeout(() => { setIsRunning(false); }, 1500);
    };

    const isAdmin = !!getAdminToken();

    const tabs = [
        {
            id: 'overview', label: t('lakeModal.tabs.overview'), icon: <Info size={15} />,
            active: 'bg-sky-500 text-white shadow-sky-200 shadow-md',
            inactive: 'bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-100',
        },
        ...(isAdmin ? [{
            id: 'operation', label: t('lakeModal.tabs.operation'), icon: <Settings size={15} />,
            active: 'bg-violet-500 text-white shadow-violet-200 shadow-md',
            inactive: 'bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-100',
        }] : []),
        {
            id: 'forecast', label: t('lakeModal.tabs.forecast'), icon: <BarChart3 size={15} />,
            active: 'bg-orange-500 text-white shadow-orange-200 shadow-md',
            inactive: 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100',
        },
        {
            id: 'history', label: t('lakeModal.tabs.history'), icon: <History size={15} />,
            active: 'bg-teal-500 text-white shadow-teal-200 shadow-md',
            inactive: 'bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100',
        },
    ];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-fade-in">

                {/* Header */}
                <div className="relative text-white p-5 flex justify-between items-start overflow-hidden bg-header shrink-0">
                    <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/5" />
                    <div className="pointer-events-none absolute bottom-0 right-32 h-24 w-24 rounded-full bg-cyan-400/10" />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 bg-emerald-300 rounded-full ring-4 ring-emerald-300/20 animate-pulse-soft"></span>
                            <span className="text-sm text-blue-100/80">{t('lakeModal.reservoirDetails')}</span>
                        </div>
                        <h2 className="text-2xl font-black tracking-wide uppercase">
                            {i18n.language === 'en' ? lakeName : `HỒ ${lakeName}`}
                        </h2>
                        <p className="text-sm text-blue-100/70 mt-1">
                            {lakeData.address || lakeData.province || ''}
                        </p>
                    </div>
                    <div className="relative flex gap-2">
                        <div className="bg-emerald-500 hover:bg-emerald-400 cursor-pointer text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-md shadow-emerald-900/20">
                            <span className="w-2 h-2 bg-white rounded-full"></span> {t('lakeModal.operating')}
                        </div>
                        <button
                            onClick={onClose}
                            className="bg-white/15 hover:bg-white/25 border border-white/20 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-colors"
                        >
                            <X size={16} /> {t('lakeModal.close')}
                        </button>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="bg-white px-6 py-3 border-b border-slate-100 flex items-center gap-2 overflow-x-auto shrink-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap ${activeTab === tab.id ? tab.active : tab.inactive}`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content Area */}
                <div className="flex-1 overflow-y-auto bg-slate-50 p-6">

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Basic Info */}
                                <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-100">
                                    <h3 className="text-blue-800 font-bold mb-4 flex items-center gap-2 border-b pb-2">
                                        <Info size={18} /> {t('lakeModal.overview.basicInfo')}
                                    </h3>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between border-b border-slate-100 pb-2">
                                            <span className="text-slate-500">{t('lakeModal.overview.designCapacity')}</span>
                                            <span className="font-semibold text-blue-900">343.55 {t('lakeModal.overview.million_m3')}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-100 pb-2">
                                            <span className="text-slate-500">{t('lakeModal.overview.normalPool')}</span>
                                            <span className="font-semibold text-blue-900">380 m</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-100 pb-2">
                                            <span className="text-slate-500">{t('lakeModal.overview.deadLevel')}</span>
                                            <span className="font-semibold text-blue-900">340 m</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Current Status */}
                                <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-100">
                                    <h3 className="text-blue-800 font-bold mb-4 flex items-center gap-2 border-b pb-2">
                                        <Activity size={18} /> {t('lakeModal.overview.currentStatus')}
                                    </h3>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between border-b border-slate-100 pb-2">
                                            <span className="text-slate-500">{t('lakeModal.overview.upstreamLevel')}</span>
                                            <span className="font-semibold text-blue-900">{currentHtl.toFixed(2)} m</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-100 pb-2">
                                            <span className="text-slate-500">{t('lakeModal.overview.inflow')}</span>
                                            <span className="font-semibold text-blue-900">{currentQvao.toFixed(2)} m³/s</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-100 pb-2">
                                            <span className="text-slate-500">{t('lakeModal.overview.discharge')}</span>
                                            <span className="font-semibold text-red-600">{currentLuuluongxa.toFixed(2)} m³/s</span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-400">{t('lakeModal.overview.updatedAt')}</span>
                                                <button 
                                                    onClick={handleSync}
                                                    disabled={isSyncing}
                                                    className={`p-1 rounded-full hover:bg-slate-100 transition-colors ${isSyncing ? 'animate-spin' : ''}`}
                                                    title="Đồng bộ dữ liệu mới ngay"
                                                >
                                                    <Activity size={12} className={isSyncing ? 'text-blue-600' : 'text-slate-400'} />
                                                </button>
                                            </div>
                                            <span className="text-slate-400">
                                                {currentUpdateTime ? new Date(currentUpdateTime).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Chart */}
                            <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-100">
                                <h3 className="text-blue-800 font-bold mb-4 flex items-center gap-2 border-b pb-2">
                                    <Activity size={18} /> {t('lakeModal.overview.waterLevelChart')}
                                </h3>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={realLevelData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis 
                                                dataKey="time" 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fontSize: 10, fill: '#6B7280' }} 
                                                interval={3}
                                            />
                                            <YAxis 
                                                domain={['auto', 'auto']} 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fontSize: 11, fill: '#6B7280' }} 
                                                label={{ value: 'MN (m)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#3b82f6', fontSize: 11, fontWeight: 'bold' } }}
                                            />
                                            <RechartsTooltip content={({ active, payload, label }) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                        <div className="bg-white p-2 border border-slate-100 shadow-lg rounded-lg text-xs">
                                                            <p className="font-bold border-b pb-1 mb-1 text-slate-600">{label}</p>
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-blue-600">MN:</span>
                                                                <span className="font-bold">{Number(payload[0].value).toFixed(2)} m</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }} />
                                            <Line type="monotone" dataKey="level" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* OPERATION TAB */}
                    {activeTab === 'operation' && (
                        <div className="-mt-8">
                            <OperationDashboard lakeId={lakeId} />
                        </div>
                    )}

                    {/* MERGED FORECAST TAB (Dự báo = old forecast + research) */}
                    {activeTab === 'forecast' && (
                        <div className="space-y-6">
                            {/* Controls Panel */}
                            <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-100 text-sm space-y-4">
                                {/* Rain Source Selector */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <CloudRain size={16} className="text-blue-600" />
                                        <span className="font-bold text-slate-600">{t('lakeModal.forecast.rainSourceLabel')}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {RAIN_SOURCES.map(src => (
                                            <button
                                                key={src.id}
                                                onClick={() => setSelectedRainSource(src.id)}
                                                className={`px-3 py-1.5 text-xs rounded-lg font-bold transition-all border-2 ${selectedRainSource === src.id
                                                    ? 'text-white shadow-md'
                                                    : 'border-blue-100 bg-blue-50/30 text-blue-600 hover:bg-blue-100/50'
                                                    }`}
                                                style={selectedRainSource === src.id ? { backgroundColor: src.color } : {}}
                                            >
                                                {src.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Model Selector */}
                                <div className="border-t pt-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Zap size={16} className="text-purple-600" />
                                        <span className="font-bold text-slate-600">{t('lakeModal.forecast.modelLabel')}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {MODELS.map(model => (
                                            <button
                                                key={model.id}
                                                onClick={() => setSelectedModel(model.id)}
                                                className={`px-4 py-2 text-xs rounded-lg font-bold flex items-center gap-2 transition-all border-2 ${selectedModel === model.id
                                                    ? 'text-white shadow-lg scale-105'
                                                    : 'border-purple-100 bg-purple-50/30 text-purple-600 hover:bg-purple-100/50'
                                                    }`}
                                                style={selectedModel === model.id ? { backgroundColor: model.color } : {}}
                                            >
                                                {model.icon} {t('lakeModal.forecast.modelPrefix')} {model.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                                    <button
                                        onClick={handleRunModel}
                                        disabled={isRunning}
                                        className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-md transition-all ${isRunning
                                            ? 'bg-slate-400 text-white cursor-not-allowed'
                                            : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white hover:shadow-lg'
                                            }`}
                                    >
                                        {isRunning ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                {t('lakeModal.forecast.processing')}
                                            </>
                                        ) : (
                                            <>
                                                <Play size={16} /> {t('lakeModal.forecast.runModel')}
                                            </>
                                        )}
                                    </button>
                                    <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-md transition-colors">
                                        <Database size={16} /> {t('lakeModal.forecast.loadData')}
                                    </button>

                                    {/* Status info */}
                                    <div className="flex-1 flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
                                        <span className="text-xs text-slate-400">
                                            Mô hình: <strong className="text-slate-600">{MODELS.find(m => m.id === selectedModel)?.label}</strong> | 
                                            Nguồn: <strong className="text-slate-600">{RAIN_SOURCES.find(s => s.id === selectedRainSource)?.label}</strong>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Unified Forecast Visualization */}
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                {/* Large Combined Chart */}
                                <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-slate-100">
                                    <h3 className="text-blue-800 font-bold mb-1 flex items-center gap-2">
                                        <Activity size={20} /> {t('lakeModal.forecast.chartTitle')}
                                    </h3>
                                    <p className="text-sm text-slate-400 mb-6 italic">
                                        {t('lakeModal.forecast.chartSubtitle')}
                                    </p>
                                    <div className="h-[450px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={unifiedData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                                                <defs>
                                                    <linearGradient id="colorBand" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={MODELS.find(m => m.id === selectedModel)?.color || '#3b82f6'} stopOpacity={0.2} />
                                                        <stop offset="95%" stopColor={MODELS.find(m => m.id === selectedModel)?.color || '#3b82f6'} stopOpacity={0.05} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                <XAxis 
                                                    dataKey="time" 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fontSize: 10, fill: '#6B7280' }} 
                                                    interval={6} 
                                                />
                                                <YAxis 
                                                    yAxisId="flow"
                                                    domain={['auto', 'auto']} 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fontSize: 12, fill: '#6B7280' }} 
                                                    label={{ value: t('lakeModal.forecast.flowAxis'), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#3b82f6', fontSize: 13, fontWeight: 'bold' } }}
                                                />
                                                <YAxis
                                                    yAxisId="rain"
                                                    orientation="right"
                                                    reversed={true}
                                                    domain={[0, 80]}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fontSize: 10, fill: '#0891b2' }}
                                                    label={{ value: t('lakeModal.forecast.rainAxis'), angle: 90, position: 'insideRight', offset: 12, style: { textAnchor: 'middle', fill: '#0891b2', fontSize: 11, fontWeight: 'bold' } }}
                                                />
                                                <RechartsTooltip content={({ active, payload, label }) => {
                                                    if (active && payload && payload.length) {
                                                        const data = payload[0].payload;
                                                        return (
                                                            <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-lg text-xs min-w-[200px]">
                                                                <p className="font-bold border-b pb-1 mb-2 text-slate-600">{label} {data.isFuture ? t('lakeModal.forecast.forecastLabel') : t('lakeModal.forecast.actualLabel')}</p>
                                                                {payload.map((entry, idx) => {
                                                                    // Skip rendering P10/P90 explicitly to declutter tooltip (Optional, but looks cleaner)
                                                                    if (entry.dataKey === 'p10' || entry.dataKey === 'p90') return null;
                                                                    return (
                                                                        <div key={idx} className="flex justify-between gap-4 py-1">
                                                                            <span style={{ color: entry.color, fontWeight: 'bold' }}>{entry.name}:</span>
                                                                            <span className="font-bold">
                                                                                {entry.value !== null && entry.value !== undefined 
                                                                                    ? Number(entry.value).toFixed(2) 
                                                                                    : '0.00'} 
                                                                                {(entry.name && entry.name.toLowerCase().includes('mưa')) || entry.yAxisId === 'rain' ? ' mm' : ' m³/s'}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }} />
                                                <Legend verticalAlign="top" height={40} align="right" iconType="circle" />
                                                <ReferenceLine 
                                                    x={unifiedData.find((d, i) => i > 0 && d.isFuture && !unifiedData[i-1].isFuture)?.time || unifiedData[36]?.time} 
                                                    stroke="#ef4444" 
                                                    strokeDasharray="5 5" 
                                                    strokeWidth={2} 
                                                    label={{ value: t('lakeModal.forecast.current'), fill: '#ef4444', fontSize: 10, fontWeight: 'bold', position: 'top' }} 
                                                />
                                                
                                                {/* Rainfall bars — inverted (reversed axis → bars go down from top) */}
                                                {selectedRainSource === 'bestmatch' ? (
                                                    <>
                                                        {/* Individual sources (có data hiện màu, không có data thì không vẽ) */}
                                                        {RAIN_SOURCES.filter(s => s.id !== 'bestmatch' && s.id !== 'station').map(src => (
                                                            <Bar key={`rain_${src.id}`} yAxisId="rain" dataKey={`rain_${src.id}`} fill={src.color} name={`${t('lakeModal.forecast.rainPrefix')} ${src.label}`} barSize={6} opacity={0.5} />
                                                        ))}
                                                        {/* Station — luôn có data */}
                                                        <Bar yAxisId="rain" dataKey="rain_station" fill="#2563eb" name={t('lakeModal.forecast.stationRain')} barSize={8} opacity={0.55} />
                                                        {/* BestMatch = trung bình — thanh đậm hơn */}
                                                        <Bar yAxisId="rain" dataKey="rain_bestmatch" fill="#7c3aed" name={t('lakeModal.forecast.bestMatchRain')} barSize={10} opacity={0.85} />
                                                    </>
                                                ) : (
                                                    <Bar
                                                        yAxisId="rain"
                                                        dataKey={`rain_${selectedRainSource}`}
                                                        fill={RAIN_SOURCES.find(s => s.id === selectedRainSource)?.color || '#2563eb'}
                                                        name={`${t('lakeModal.forecast.rainPrefix')} (${RAIN_SOURCES.find(s => s.id === selectedRainSource)?.label || selectedRainSource}) (mm)`}
                                                        barSize={12}
                                                        opacity={0.7}
                                                    />
                                                )}

                                                {/* Actual Flow */}
                                                <Line yAxisId="flow" type="monotone" dataKey="qActual" stroke="#3b82f6" strokeWidth={3} dot={false} name={t('lakeModal.forecast.surveyActual')} connectNulls={true} />
                                                
                                                {/* P90 — upper bound line + fill band from top */}
                                                <Area yAxisId="flow" type="monotone" dataKey="p90"
                                                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3"
                                                    fill="url(#colorBand)" fillOpacity={1}
                                                    name={t('lakeModal.forecast.p90Label')}
                                                    dot={false} connectNulls={true} />
                                                {/* P10 — lower bound line + white fill to erase below */}
                                                <Area yAxisId="flow" type="monotone" dataKey="p10"
                                                    stroke="#6366f1" strokeWidth={1.5} strokeDasharray="6 3"
                                                    fill="#fff" fillOpacity={1}
                                                    name={t('lakeModal.forecast.p10Label')}
                                                    dot={false} connectNulls={true} />

                                                {/* Specific Sources Lines (Only in Best Match) */}
                                                {selectedRainSource === 'bestmatch' && RAIN_SOURCES.filter(s => s.id !== 'bestmatch').map((src) => (
                                                    <Line key={`p50_${src.id}`} yAxisId="flow" type="monotone" dataKey={`p50_${src.id}`} stroke={src.color} strokeWidth={1} strokeDasharray="4 4" dot={false} name={`${t('lakeModal.forecast.forecastSource')} ${src.label}`} opacity={0.8} />
                                                ))}

                                                {/* Forecast Scenario Line (Primary) */}
                                                <Line yAxisId="flow" type="monotone" dataKey="p50" stroke={MODELS.find(m => m.id === selectedModel)?.color || '#ef4444'} strokeWidth={3} strokeDasharray="8 5" dot={{ r: 3 }} name={selectedRainSource === 'bestmatch' ? t('lakeModal.forecast.bestMatchAvg') : t('lakeModal.forecast.forecastExpected', { model: MODELS.find(m => m.id === selectedModel)?.label })} connectNulls={true} />

                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Results Table Integration */}
                                <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-100 flex flex-col h-full">
                                    <h3 className="text-slate-700 font-bold mb-1 flex items-center gap-2">
                                        <Clock size={18} /> {t('lakeModal.forecast.tableTitle')}
                                    </h3>
                                    <p className="text-xs text-slate-400 mb-4 italic">{t('lakeModal.forecast.next12h')}</p>
                                    <div className="flex-1 overflow-auto border border-slate-100 rounded-lg">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-[#f8fafc] text-slate-500 font-bold border-b text-[10px] uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-3 py-3">{t('lakeModal.forecast.hour')}</th>
                                                    <th className="px-2 py-3 text-center text-cyan-600">{t('lakeModal.forecast.rain')}</th>
                                                    <th className="px-3 py-3 text-center">{t('lakeModal.forecast.min')}</th>
                                                    <th className="px-3 py-3 text-center">{t('lakeModal.forecast.avg')}</th>
                                                    <th className="px-3 py-3 text-center text-red-600">{t('lakeModal.forecast.max')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {unifiedData.filter(d => d.isFuture).slice(0, 12).map((d, i) => (
                                                    <tr key={i} className={`border-b border-slate-50 hover:bg-blue-50/50 transition-colors ${i % 2 ? 'bg-slate-50/40' : ''}`}>
                                                        <td className="px-3 py-3 font-bold text-slate-600">{d.fullTime}</td>
                                                        <td className="px-2 py-3 text-center text-cyan-600 font-medium">
                                                            {(d.rain_bestmatch || d.rain || 0) > 0
                                                                ? `${(d.rain_bestmatch || d.rain || 0).toFixed(1)}`
                                                                : <span className="text-slate-300">—</span>}
                                                        </td>
                                                        <td className="px-2 py-3 text-center text-blue-500 font-medium">{d.p10?.toFixed(1) || '0.0'}</td>
                                                        <td className="px-2 py-3 text-center font-bold text-slate-700">{d.p50?.toFixed(1) || '0.0'}</td>
                                                        <td className="px-2 py-3 text-center text-red-500 font-medium">{d.p90?.toFixed(1) || '0.0'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                        <div className="text-[10px] font-bold text-blue-800 mb-1">{t('lakeModal.forecast.confidenceIndex')}</div>
                                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                            <div className="bg-blue-500 h-full w-[85%]"></div>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-blue-600 mt-1"><span>{t('lakeModal.forecast.modelConfidence')}</span> <span>85%</span></div>
                                    </div>
                                </div>
                            </div>

                            {/* Info cards */}
                            <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-100">
                                <h3 className="text-slate-700 font-bold mb-4 border-b pb-2 text-sm flex items-center gap-2"><BookOpen size={16} /> {t('lakeModal.forecast.guideTitle')}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
                                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl">
                                        <span className="w-8 border-t-2 border-red-500 border-dashed"></span>
                                        <span className="text-xs font-semibold text-slate-600">{t('lakeModal.forecast.p90Guide')}</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl">
                                        <span className="w-8 border-t-2 border-blue-600 border-dashed"></span>
                                        <span className="text-xs font-semibold text-slate-600">{t('lakeModal.forecast.p50Guide')}</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl">
                                        <span className="w-8 border-t-2 border-indigo-500 border-dashed"></span>
                                        <span className="text-xs font-semibold text-slate-600">{t('lakeModal.forecast.p10Guide')}</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl">
                                        <span className="w-8 border-t-3 border-blue-600"></span>
                                        <span className="text-xs font-semibold text-slate-600">{t('lakeModal.forecast.surveyGuide')}</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-cyan-50 p-3 rounded-lg border border-cyan-100">
                                        <span className="w-8 h-3 bg-violet-500 rounded opacity-80 inline-block"></span>
                                        <span className="text-xs font-semibold text-cyan-700">{t('lakeModal.forecast.rainGuide')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    )}

                    {/* HISTORY AND TRAINING TAB */}
                    {activeTab === 'history' && (
                        <div className="-m-6 h-full">
                            <FloodHistoryTraining lakeId={lakeId} lakeData={lakeData} />
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
