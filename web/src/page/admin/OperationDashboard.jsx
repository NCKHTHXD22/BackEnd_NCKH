import React, { useState, useEffect } from "react";
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
} from "recharts";
import {
    Settings,
    Droplets,
    Droplet,
    Zap,
    Clock,
    LogOut,
    Map as MapIcon,
    ChevronDown,
    TrendingUp,
    Database
} from "lucide-react";

export default function OperationDashboard({ lakeId }) {
    const [reservoirs, setReservoirs] = useState([]);
    const [selectedReservoir, setSelectedReservoir] = useState(lakeId || "");
    const [chartData, setChartData] = useState([]);
    const [latestHydro, setLatestHydro] = useState({ qvao: 0, luuluongxa: 0, htl: 0 });

    // Mock data for the chart based on the image
    const mockChartData = Array.from({ length: 24 }).map((_, i) => ({
        time: `2022 24/05 ${String(i).padStart(2, '0')}:00`,
        rain: Math.random() * 20,
        qIn: 40 + Math.random() * 100,
        qInExpected: 40 + Math.random() * 80,
        qOut: 30 + Math.random() * 60,
        qSpill: 10 + Math.random() * 20,
        waterLevel: 530 + Math.random() * 10,
        power: 20 + Math.random() * 15,
    }));

    const fetchReservoirs = async () => {
        if (lakeId) return; // No need to fetch all if locked to one
        try {
            const respReservoirs = await mapApi.getReservoirs();

            let resList = [];
            if (respReservoirs && respReservoirs.data) {
                resList = respReservoirs.data;
            } else if (Array.isArray(respReservoirs)) {
                resList = respReservoirs;
            }

            setReservoirs(resList);
            if (resList.length > 0) setSelectedReservoir(resList[0].Id_Lake);
        } catch (error) {
            console.error("Error fetching reservoirs", error);
        }
    };

    const fetchLiveHydro = async (lakeId) => {
        if (!lakeId) return;
        try {
            const data = await mapApi.getLiveHydro(lakeId);
            setLatestHydro({
                qvao: data.qvao || 0,
                luuluongxa: data.luuluongxa || 0,
                htl: data.htl || 0
            });

            if (data.history && Array.isArray(data.history)) {
                const mappedHistory = data.history.map(d => ({
                    time: new Date(d.time).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                    qIn: d.qvao || 0,
                    qInExpected: d.qvaotht || 0,
                    qOut: d.luuluongxa || 0,
                    waterLevel: d.htl || 0,
                    power: 20 + Math.random() * 10
                }));
                // We show last 24 hours
                setChartData(mappedHistory.slice(-24));
            }
        } catch (error) {
            console.error("Error fetching live hydro", error);
        }
    };

    useEffect(() => {
        if (lakeId) {
            setSelectedReservoir(lakeId);
        }
        fetchLiveHydro(lakeId || selectedReservoir);
    }, [selectedReservoir, lakeId]);

    useEffect(() => {
        fetchReservoirs();
    }, []);

    return (
        <div className="flex flex-col bg-white text-gray-700 font-sans mt-8 rounded-xl border border-gray-200 shadow-xl overflow-hidden">
            {/* Header for Reservoir Selection */}
            <div className="flex items-center justify-between p-5 bg-gray-50 border-b border-gray-200">
                <div className="flex flex-col">
                    <div className="text-xl font-bold flex items-center text-blue-900">
                        <Droplets className="text-blue-600 mr-2" size={24} /> Vận Hành Hồ Chứa
                    </div>
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
                                    onChange={(e) => setSelectedReservoir(e.target.value)}
                                >
                                    <option value="" disabled>Chọn hồ thủy điện</option>
                                    {reservoirs.map((res) => (
                                        <option key={res.Id_Lake} value={res.Id_Lake}>
                                            Thủy điện {res.name}
                                        </option>
                                    ))}
                                    {reservoirs.length === 0 && <option value="demo">Thủy điện Mường Hum (Demo)</option>}
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

            {/* Dashboard Content */}
            <div className="p-6 flex flex-col xl:flex-row gap-6">
                {/* Left Column (25%) */}
                <div className="w-full xl:w-1/4 flex flex-col gap-6">
                    {/* Reservoir visual card */}
                    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-lg relative h-[320px] flex flex-col group hover:border-blue-200 transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-blue-600 text-4xl font-black flex items-end">
                                {latestHydro.qvao} <span className="text-xs ml-1 text-gray-400 font-bold">m³/s</span>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">Lưu lượng xả hiện tại</span>
                                <div className="text-red-500 font-bold flex items-center justify-end gap-1">
                                    <TrendingUp size={14} className="rotate-45" /> {latestHydro.luuluongxa} m³/s
                                </div>
                            </div>
                        </div>
                        <div className="text-blue-500 text-2xl font-black mb-6 flex items-center gap-2 bg-blue-50 w-fit px-4 py-1.5 rounded-full border border-blue-100">
                            <Droplets size={22} /> {latestHydro.htl} <span className="text-lg">m</span>
                        </div>

                        {/* Visual Mockup for Dam */}
                        <div className="h-44 w-full relative mt-auto border-b-8 border-gray-300 rounded-b">
                            <div className="absolute bottom-0 left-0 w-3/4 h-full bg-blue-400/30 rounded-tl-3xl border-t-2 border-blue-400 animate-pulse"></div>
                            <div className="absolute right-4 bottom-0 w-28 h-5/6 bg-gray-200 rounded-t-2xl shadow-inner" style={{ clipPath: "polygon(10% 20%, 30% 20%, 90% 100%, 0% 100%)" }}></div>
                            <div className="absolute top-1/3 right-8 text-[10px] bg-red-600 px-3 py-1 rounded-full text-white font-black shadow-lg uppercase tracking-tighter">Xả qua tràn: {latestHydro.luuluongxa} m³/s</div>
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

                        {/* Visual Mockup for Turbine */}
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

                {/* Middle Column - Main Chart (50%) */}
                <div className="w-full xl:w-1/2 bg-white rounded-xl border border-gray-100 flex flex-col shadow-2xl min-h-[550px] overflow-hidden">
                    <div className="flex justify-between items-center p-5 bg-gray-50/50 border-b border-gray-100">
                        <div className="flex items-center gap-3 text-sm text-gray-600 font-bold uppercase tracking-wider">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                            <Clock size={18} className="text-blue-500" />
                            <span>Thời gian thực: <span className="text-blue-800 font-mono font-black ml-2">{new Date().toLocaleString('vi-VN')}</span></span>
                        </div>
                    </div>
                    <div className="flex-1 w-full p-6 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} fontWeight="bold" tickFormatter={(tick) => tick.split(' ')[2] ? tick.split(' ')[2] : tick} axisLine={false} tickLine={false} />
                                <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} fontWeight="bold" tickCount={6} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ 
                                        backgroundColor: '#ffffff', 
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        color: '#1e293b'
                                    }}
                                />
                                <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '20px' }} />

                                <Line yAxisId="left" type="monotone" dataKey="waterLevel" name="Mực nước hồ (m)" stroke="#0ea5e9" strokeWidth={4} dot={false} animationDuration={1500} />
                                <Line yAxisId="left" type="monotone" dataKey="qIn" name="Lưu lượng vào (m³/s)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} animationDuration={2000} />
                                <Line yAxisId="left" type="monotone" dataKey="qOut" name="Lưu lượng xả (m³/s)" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" animationDuration={2500} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Right Column - Controls/Stats (25%) */}
                <div className="w-full xl:w-1/4 flex flex-col gap-4">
                    <div className="bg-white rounded-xl flex-1 border border-gray-100 shadow-xl flex flex-col p-2">
                        <div className="p-5 border-b border-gray-50 group">
                            <div className="mb-4 text-blue-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div> Mực nước thiết kế (m)
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between group/row">
                                    <span className="text-sm text-gray-400 font-bold group-hover/row:text-gray-600 transition-colors">Thượng lưu</span>
                                    <input type="text" defaultValue="0" readOnly className="w-24 bg-gray-50 border border-transparent group-hover/row:border-blue-200 text-gray-800 px-3 py-2 rounded-lg text-right font-black focus:border-blue-500 outline-none transition-all shadow-inner" />
                                </div>
                                <div className="flex items-center justify-between group/row">
                                    <span className="text-sm text-gray-400 font-bold group-hover/row:text-gray-600 transition-colors">Trong hồ</span>
                                    <input type="text" value={latestHydro.htl || 0} readOnly className="w-24 bg-blue-50 border border-blue-100 text-blue-800 px-3 py-2 rounded-lg text-right font-black shadow-inner" />
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
                                        <input type="text" defaultValue="17.2" readOnly className="w-24 bg-gray-50 border border-transparent text-gray-800 px-3 py-2 rounded-lg text-right font-black shadow-inner" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400 font-bold">Tổ máy H2</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                        <input type="text" defaultValue="17.3" readOnly className="w-24 bg-gray-50 border border-transparent text-gray-800 px-3 py-2 rounded-lg text-right font-black shadow-inner" />
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
                                    <input type="text" defaultValue="0" readOnly className="w-24 bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg text-right font-black shadow-inner" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-400 font-bold">Cửa xả số 02</span>
                                    <input type="text" defaultValue="0" readOnly className="w-24 bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg text-right font-black shadow-inner" />
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
        </div>
    );
}
