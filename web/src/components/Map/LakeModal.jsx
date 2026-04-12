import React, { useState, useEffect } from 'react';
import OperationDashboard from '../../page/admin/OperationDashboard';
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
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedRainSource, setSelectedRainSource] = useState('station');
    const [selectedModel, setSelectedModel] = useState('lstm');
    const [isRunning, setIsRunning] = useState(false);
    const [forecastResults, setForecastResults] = useState(null);
    const [rainData, setRainData] = useState([]);
    const [forecastHistory, setForecastHistory] = useState([]);
    const [realLstmData, setRealLstmData] = useState([]);
    const [realHistoryData, setRealHistoryData] = useState([]);

    // Fetch real data on load and when switching to forecast
    useEffect(() => {
        const fetchData = async () => {
            if (!lakeId) return;
            try {
                // Fetch 48h history even for overview (useful)
                const history = await mapApi.getInflowHistory(lakeId).catch(() => []);
                setRealHistoryData(history);

                // Fetch real LSTM if in forecast tab
                if (activeTab === 'forecast' && selectedModel === 'lstm') {
                    const lstm = await mapApi.getForecastLstm(lakeId).catch(() => null);
                    // Handle object with predictions property
                    if (lstm && lstm.predictions) {
                        setRealLstmData(lstm.predictions);
                    } else if (Array.isArray(lstm)) {
                        setRealLstmData(lstm);
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

    // Bỏ tiền tố "HỒ " nếu tên đã có sẵn (VD: "HỒ A VƯƠNG" → "A VƯƠNG")
    const rawName = lakeData.name || lakeData.Lake_Name || 'Không tên';
    const lakeName = rawName.replace(/^HỒ\s+/i, '');

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
        const baseQ = lakeData.Q_to_Lake || 80;
        const now = new Date();
        now.setMinutes(0, 0, 0); // Align to hour start

        // Helper: Format date for labels (GMT+7)
        const formatLabel = (date) => {
            return date.getHours().toString().padStart(2, '0') + ':00 ' +
                date.getDate().toString().padStart(2, '0') + '/' +
                (date.getMonth() + 1).toString().padStart(2, '0');
        };

        const result = [];
        // Combined Timeline: Last 24h to Next 12h relative to CURRENT TIME
        const START_HISTORY = 36; // 36 hours of history
        const END_FORECAST = 12; // 12 hours of forecast

        for (let i = 0; i <= (START_HISTORY + END_FORECAST); i++) {
            const hourOffset = i - START_HISTORY;
            const targetTime = new Date(now.getTime() + hourOffset * 3600000);
            const label = formatLabel(targetTime);
            const isFuture = hourOffset > 0;
            const isNow = hourOffset === 0;

            // 1. Check Historical Data — match by full ISO hour (YYYY-MM-DDTHH)
            const targetHourKey = targetTime.getFullYear() + '-' +
                String(targetTime.getMonth()).padStart(2, '0') + '-' +
                String(targetTime.getDate()).padStart(2, '0') + 'T' +
                String(targetTime.getHours()).padStart(2, '0');
            const realPoint = realHistoryData.find(d => {
                const dt = new Date(d.timestamp);
                const key = dt.getFullYear() + '-' +
                    String(dt.getMonth()).padStart(2, '0') + '-' +
                    String(dt.getDate()).padStart(2, '0') + 'T' +
                    String(dt.getHours()).padStart(2, '0');
                return key === targetHourKey;
            });

            // 2. Check LSTM Forecast Data — same full-hour match
            const realPred = Array.isArray(realLstmData) ?
                realLstmData.find(d => {
                    const dt = new Date(d.targetTime || d.forecastTime);
                    const key = dt.getFullYear() + '-' +
                        String(dt.getMonth()).padStart(2, '0') + '-' +
                        String(dt.getDate()).padStart(2, '0') + 'T' +
                        String(dt.getHours()).padStart(2, '0');
                    return key === targetHourKey;
                }) : null;

            // Actual value at this hour (used for past + isNow connection)
            const actualQvao = realPoint ? realPoint.qvao : null;

            const dataPoint = {
                time: label,
                fullTime: targetTime.getHours().toString().padStart(2, '0') + ':00',
                isFuture: isFuture,
                // Past + isNow: use real measurement
                qActual: !isFuture ? actualQvao : null,
                // isNow: forecast band starts from actual value → smooth visual connection
                // Future: LSTM prediction (qvao_forecast = P50 in DB schema)
                p50: isNow
                    ? actualQvao
                    : (isFuture ? (realPred ? (realPred.p50 || realPred.qvao_forecast) : null) : null),
                p10: isNow
                    ? actualQvao
                    : (isFuture ? (realPred ? realPred.p10 : null) : null),
                p90: isNow
                    ? actualQvao
                    : (isFuture ? (realPred ? realPred.p90 : null) : null),
                rain: realPoint ? (realPoint.rain || 0) : 0
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
                if (result) setForecastResults(result);
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

    const tabs = [
        {
            id: 'overview', label: 'Tổng quan', icon: <Info size={15} />,
            active: 'bg-sky-500 text-white shadow-sky-200 shadow-md',
            inactive: 'bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-100',
        },
        {
            id: 'operation', label: 'Vận hành', icon: <Settings size={15} />,
            active: 'bg-violet-500 text-white shadow-violet-200 shadow-md',
            inactive: 'bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-100',
        },
        {
            id: 'forecast', label: 'Dự báo', icon: <BarChart3 size={15} />,
            active: 'bg-orange-500 text-white shadow-orange-200 shadow-md',
            inactive: 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100',
        },
        {
            id: 'history', label: 'Lịch sử & Training', icon: <History size={15} />,
            active: 'bg-teal-500 text-white shadow-teal-200 shadow-md',
            inactive: 'bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100',
        },
    ];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">

                {/* Header */}
                <div className="bg-[#1e3a8a] text-white p-4 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                            <span className="text-sm text-blue-200">Chi tiết Hồ chứa</span>
                        </div>
                        <h2 className="text-2xl font-bold tracking-wide uppercase">HỒ {lakeName}</h2>
                        <p className="text-sm text-blue-200 mt-1">
                            {lakeData.address || lakeData.province || ''}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <div className="bg-green-500 hover:bg-green-600 cursor-pointer text-white px-4 py-2 rounded font-semibold text-sm flex items-center gap-2 transition-colors">
                            <span className="w-2 h-2 bg-white rounded-full"></span> HOẠT ĐỘNG
                        </div>
                        <button
                            onClick={onClose}
                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-semibold text-sm flex items-center gap-1 transition-colors"
                        >
                            <X size={16} /> Đóng
                        </button>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="bg-white px-6 py-3 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
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
                <div className="flex-1 overflow-y-auto bg-gray-50 p-6">

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Basic Info */}
                                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                                    <h3 className="text-blue-800 font-bold mb-4 flex items-center gap-2 border-b pb-2">
                                        <Info size={18} /> Thông tin cơ bản
                                    </h3>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between border-b border-gray-100 pb-2">
                                            <span className="text-gray-600">Dung tích thiết kế:</span>
                                            <span className="font-semibold text-blue-900">343.55 triệu m³</span>
                                        </div>
                                        <div className="flex justify-between border-b border-gray-100 pb-2">
                                            <span className="text-gray-600">Mực nước dâng BT:</span>
                                            <span className="font-semibold text-blue-900">380 m</span>
                                        </div>
                                        <div className="flex justify-between border-b border-gray-100 pb-2">
                                            <span className="text-gray-600">Mực nước chết:</span>
                                            <span className="font-semibold text-blue-900">340 m</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Current Status */}
                                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                                    <h3 className="text-blue-800 font-bold mb-4 flex items-center gap-2 border-b pb-2">
                                        <Activity size={18} /> Tình trạng hiện tại
                                    </h3>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between border-b border-gray-100 pb-2">
                                            <span className="text-gray-600">Mực nước thượng lưu:</span>
                                            <span className="font-semibold text-blue-900">{currentHtl.toFixed(2)} m</span>
                                        </div>
                                        <div className="flex justify-between border-b border-gray-100 pb-2">
                                            <span className="text-gray-600">Lưu lượng vào (Qvào):</span>
                                            <span className="font-semibold text-blue-900">{currentQvao.toFixed(2)} m³/s</span>
                                        </div>
                                        <div className="flex justify-between border-b border-gray-100 pb-2">
                                            <span className="text-gray-600">Lưu lượng xả:</span>
                                            <span className="font-semibold text-red-600">{currentLuuluongxa.toFixed(2)} m³/s</span>
                                        </div>
                                        <div className="flex justify-between border-b border-gray-100 pb-2 text-xs">
                                            <span className="text-gray-500">Cập nhật lúc:</span>
                                            <span className="text-gray-500">
                                                {currentUpdateTime ? new Date(currentUpdateTime).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Chart */}
                            <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                                <h3 className="text-blue-800 font-bold mb-4 flex items-center gap-2 border-b pb-2">
                                    <Activity size={18} /> Biểu đồ Mực nước hồ (m) — 48 giờ gần nhất
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
                                                        <div className="bg-white p-2 border border-gray-200 shadow-lg rounded-lg text-xs">
                                                            <p className="font-bold border-b pb-1 mb-1 text-gray-700">{label}</p>
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
                            <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 text-sm space-y-4">
                                {/* Rain Source Selector */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <CloudRain size={16} className="text-blue-600" />
                                        <span className="font-bold text-gray-700">CHỌN NGUỒN DỮ LIỆU MƯA:</span>
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
                                        <span className="font-bold text-gray-700">MÔ HÌNH DỰ BÁO:</span>
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
                                                {model.icon} Mô hình {model.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
                                    <button
                                        onClick={handleRunModel}
                                        disabled={isRunning}
                                        className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-md transition-all ${isRunning
                                            ? 'bg-gray-400 text-white cursor-not-allowed'
                                            : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white hover:shadow-lg'
                                            }`}
                                    >
                                        {isRunning ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Đang xử lý...
                                            </>
                                        ) : (
                                            <>
                                                <Play size={16} /> Chạy mô hình dự báo
                                            </>
                                        )}
                                    </button>
                                    <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-md transition-colors">
                                        <Database size={16} /> Tải dữ liệu đối soát
                                    </button>

                                    {/* Status info */}
                                    <div className="flex-1 flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
                                        <span className="text-xs text-gray-500">
                                            Mô hình: <strong className="text-gray-700">{MODELS.find(m => m.id === selectedModel)?.label}</strong> | 
                                            Nguồn: <strong className="text-gray-700">{RAIN_SOURCES.find(s => s.id === selectedRainSource)?.label}</strong>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Unified Forecast Visualization */}
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                {/* Large Combined Chart */}
                                <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                                    <h3 className="text-blue-800 font-bold mb-1 flex items-center gap-2">
                                        <Activity size={20} /> BIỂU ĐỒ DỰ BÁO LƯU LƯỢNG TỔNG HỢP (ENSEMBLE)
                                    </h3>
                                    <p className="text-sm text-gray-500 mb-6 italic">
                                        Hiển thị 36 giờ thực đo và 12 giờ dự báo LSTM tích hợp kịch bản (P10-P50-P90)
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
                                                    label={{ value: 'Lưu lượng Q (m³/s)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#3b82f6', fontSize: 13, fontWeight: 'bold' } }} 
                                                />
                                                <YAxis 
                                                    yAxisId="rain" 
                                                    orientation="right" 
                                                    reversed={true} 
                                                    domain={[0, 150]} 
                                                    hide={true} 
                                                />
                                                <RechartsTooltip content={({ active, payload, label }) => {
                                                    if (active && payload && payload.length) {
                                                        const data = payload[0].payload;
                                                        return (
                                                            <div className="bg-white p-3 border border-gray-200 shadow-xl rounded-lg text-xs min-w-[200px]">
                                                                <p className="font-bold border-b pb-1 mb-2 text-gray-700">{label} {data.isFuture ? '(Dự báo)' : '(Thực tế)'}</p>
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
                                                    label={{ value: "Hiện tại", fill: '#ef4444', fontSize: 10, fontWeight: 'bold', position: 'top' }} 
                                                />
                                                
                                                {/* Rainfall Bar Chart (Inverted) */}
                                                {selectedRainSource === 'bestmatch' ? (
                                                    // Stacked Rain bars for all sources
                                                    RAIN_SOURCES.filter(s => s.id !== 'bestmatch').map((src) => (
                                                        <Bar key={`rain_${src.id}`} yAxisId="rain" dataKey={`rain_${src.id}`} fill={src.color} name={`Mưa (${src.label})`} barSize={15} opacity={0.6} />
                                                    ))
                                                ) : (
                                                    <Bar yAxisId="rain" dataKey="rain" fill={RAIN_SOURCES.find(s => s.id === selectedRainSource)?.color || "#3b82f6"} name="Lượng mưa (mm)" barSize={15} opacity={0.6} />
                                                )}

                                                {/* Actual Flow */}
                                                <Line yAxisId="flow" type="monotone" dataKey="qActual" stroke="#3b82f6" strokeWidth={3} dot={false} name="Khảo sát (Thực tế)" connectNulls={true} />
                                                
                                                {/* P90 — upper bound line + fill band from top */}
                                                <Area yAxisId="flow" type="monotone" dataKey="p90"
                                                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3"
                                                    fill="url(#colorBand)" fillOpacity={1}
                                                    name="Max (P90 — Kịch bản cao nhất)"
                                                    dot={false} connectNulls={false} />
                                                {/* P10 — lower bound line + white fill to erase below */}
                                                <Area yAxisId="flow" type="monotone" dataKey="p10"
                                                    stroke="#6366f1" strokeWidth={1.5} strokeDasharray="6 3"
                                                    fill="#fff" fillOpacity={1}
                                                    name="Min (P10 — Kịch bản thấp nhất)"
                                                    dot={false} connectNulls={false} />

                                                {/* Specific Sources Lines (Only in Best Match) */}
                                                {selectedRainSource === 'bestmatch' && RAIN_SOURCES.filter(s => s.id !== 'bestmatch').map((src) => (
                                                    <Line key={`p50_${src.id}`} yAxisId="flow" type="monotone" dataKey={`p50_${src.id}`} stroke={src.color} strokeWidth={1} strokeDasharray="4 4" dot={false} name={`Dự báo nguồn ${src.label}`} opacity={0.8} />
                                                ))}

                                                {/* Forecast Scenario Line (Primary) */}
                                                <Line yAxisId="flow" type="monotone" dataKey="p50" stroke={MODELS.find(m => m.id === selectedModel)?.color || '#ef4444'} strokeWidth={3} strokeDasharray="8 5" dot={{ r: 3 }} name={selectedRainSource === 'bestmatch' ? `Dự báo Best Match (Trung bình)` : `Dự báo ${MODELS.find(m => m.id === selectedModel)?.label} (Kỳ vọng)`} connectNulls={true} />

                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Results Table Integration */}
                                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
                                    <h3 className="text-gray-800 font-bold mb-1 flex items-center gap-2">
                                        <Clock size={18} /> KẾT QUẢ DỰ BÁO CHI TIẾT
                                    </h3>
                                    <p className="text-xs text-gray-500 mb-4 italic">12 giờ tiếp theo (LSTM)</p>
                                    <div className="flex-1 overflow-auto border border-gray-100 rounded-lg">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-[#f8fafc] text-gray-600 font-bold border-b text-[10px] uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-3 py-3">Giờ</th>
                                                    <th className="px-3 py-3 text-center">Min</th>
                                                    <th className="px-3 py-3 text-center">Avg</th>
                                                    <th className="px-3 py-3 text-center text-red-600">Max</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {unifiedData.filter(d => d.isFuture).slice(0, 12).map((d, i) => (
                                                    <tr key={i} className={`border-b border-gray-50 hover:bg-blue-50/50 transition-colors ${i % 2 ? 'bg-gray-50/30' : ''}`}>
                                                        <td className="px-3 py-3 font-bold text-gray-700">{d.fullTime}</td>
                                                        <td className="px-2 py-3 text-center text-blue-500 font-medium">{d.p10?.toFixed(1) || '0.0'}</td>
                                                        <td className="px-2 py-3 text-center font-bold text-gray-800">{d.p50?.toFixed(1) || '0.0'}</td>
                                                        <td className="px-2 py-3 text-center text-red-500 font-medium">{d.p90?.toFixed(1) || '0.0'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                        <div className="text-[10px] font-bold text-blue-800 mb-1">CHỈ SỐ TIN CẬY</div>
                                        <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                            <div className="bg-blue-500 h-full w-[85%]"></div>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-blue-600 mt-1"><span>Độ tin cậy mô hình</span> <span>85%</span></div>
                                    </div>
                                </div>
                            </div>

                            {/* Info cards */}
                            <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                                <h3 className="text-gray-800 font-bold mb-4 border-b pb-2 text-sm flex items-center gap-2"><BookOpen size={16} /> HƯỚNG DẪN ĐỌC BIỂU ĐỒ & DỮ LIỆU</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
                                    <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                                        <span className="w-8 border-t-2 border-red-500 border-dashed"></span>
                                        <span className="text-xs font-semibold text-gray-700">P90 — Kịch bản cao nhất</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                                        <span className="w-8 border-t-2 border-blue-600 border-dashed"></span>
                                        <span className="text-xs font-semibold text-gray-700">P50 — Dự báo kỳ vọng (AVG)</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                                        <span className="w-8 border-t-2 border-indigo-500 border-dashed"></span>
                                        <span className="text-xs font-semibold text-gray-700">P10 — Kịch bản thấp nhất</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                                        <span className="w-8 border-t-3 border-blue-600"></span>
                                        <span className="text-xs font-semibold text-gray-700">Khảo sát thực tế (đo được)</span>
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
