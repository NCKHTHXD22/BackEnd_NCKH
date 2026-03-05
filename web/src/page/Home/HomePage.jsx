import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import NavbarPublic from '../../components/NavbarPublic';
import {
    FaCog, FaCrosshairs, FaExclamationTriangle, FaLayerGroup, FaTrash,
    FaPlus, FaMinus, FaExpand, FaEdit,
    FaBell, FaMapMarkedAlt, FaProjectDiagram, FaSearchLocation, FaBook,
    FaPlay, FaChevronLeft, FaSearch, FaFilter, FaChevronRight,
    FaMountain // Used for landslide as a fallback icon
} from 'react-icons/fa';
import mapApi from '../../api/mapApi';
import { RESERVOIRS } from '../../utils/reservoirs';

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icon for Rain Stations (e.g., a blue cloud/drop)
const rainIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/1164/1164961.png',
    iconSize: [25, 25],
    iconAnchor: [12, 25],
    popupAnchor: [0, -25],
});

// Custom Icon for Reservoirs (e.g., a red triangle/dam)
const reservoirIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/2857/2857415.png',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
});

// Component to handle map resizing dynamically
const MapResizer = () => {
    const map = useMap();
    React.useEffect(() => {
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }, [map]);
    return null;
};

export default function HomePage() {
    // Center of Vietnam coordinates
    const position = [16.0544, 108.2022];

    const [rainStations, setRainStations] = useState([]);
    const [waterLevels, setWaterLevels] = useState([]);
    const [reservoirs, setReservoirs] = useState([]);
    const [publicPosts, setPublicPosts] = useState([]);
    const [showNewsPanel, setShowNewsPanel] = useState(false);

    useEffect(() => {
        const fetchMapData = async () => {
            try {
                const [rainData, waterData, reservoirData, postData] = await Promise.all([
                    mapApi.getRainStations().catch(() => []),
                    mapApi.getWaterLevelStations().catch(() => []),
                    mapApi.getReservoirs().catch(() => []),
                    mapApi.getPublicPosts().catch(() => []) // Adjust based on your actual public post API
                ]);

                setRainStations(Array.isArray(rainData) ? rainData : []);
                setWaterLevels(Array.isArray(waterData) ? waterData : []);

                // Reservoirs now include synced hydro data from backend persistent storage
                const resArray = Array.isArray(reservoirData) ? reservoirData : [];
                const updatedReservoirs = resArray.map(res => ({
                    ...res,
                    Q_to_Lake: res.qvao || 0,
                    Q_discharge: res.luuluongxa || 0,
                    WaterLevel_Upstream: res.htl || 0,
                    Total_Q_discharge: res.luuluongxa || 0
                }));
                setReservoirs(updatedReservoirs);

                // Filter for approved posts for the public view
                setPublicPosts(Array.isArray(postData) ? postData.filter(p => p.status === 'approved') : []);
            } catch (error) {
                console.error("Error fetching map data:", error);
            }
        };
        fetchMapData();
    }, []);

    return (
        <div className="relative w-full h-screen overflow-hidden bg-gray-100 font-sans">
            <NavbarPublic />

            {/* Map Area */}
            <div className="absolute top-[52px] left-0 w-full h-[calc(100vh-52px)] z-0">
                <MapContainer
                    center={position}
                    zoom={6}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" /* Google Satellite Hybrid */
                    />
                    <MapResizer />

                    {/* Default Center Marker */}
                    <Marker position={position}>
                        <Popup>
                            Hệ thống hỗ trợ đưa ra quyết định (DSS) <br /> Trung tâm.
                        </Popup>
                    </Marker>

                    {/* Rendering Rain Stations */}
                    {rainStations.map((station, index) => {
                        const lat = station.location?.lat || station.lat;
                        const lng = station.location?.lng || station.lng;
                        if (!lat || !lng) return null;
                        return (
                            <Marker key={`rain-${index}`} position={[lat, lng]} icon={rainIcon}>
                                <Popup>
                                    <strong>Trạm đo mưa: {station.name || 'Không tên'}</strong><br />
                                    Lượng mưa: {station.sumDepth || 0} mm<br />
                                    Tình trạng: {station.level || 'Bình thường'}
                                </Popup>
                            </Marker>
                        )
                    })}

                    {/* Rendering Water Level Stations */}
                    {waterLevels.map((station, index) => {
                        const lat = station.location?.lat || station.lat;
                        const lng = station.location?.lng || station.lng;
                        if (!lat || !lng) return null;
                        return (
                            <Marker key={`wl-${index}`} position={[lat, lng]}>
                                <Popup>
                                    <strong>Trạm mực nước: {station.name || 'Không tên'}</strong><br />
                                    Mực nước: {station.waterLevel || 0} m
                                </Popup>
                            </Marker>
                        )
                    })}

                    {/* Rendering Reservoirs */}
                    {reservoirs.map((res, index) => {
                        let lat = res.location?.lat || res.lat;
                        let lng = res.location?.lng || res.lng;

                        // Try to match with RESERVOIRS configuration for static locations
                        const resConfig = RESERVOIRS[res.Id_Lake] || Object.values(RESERVOIRS).find(r => r.name.toLowerCase() === res.Lake_Name?.toLowerCase() || r.name.toLowerCase() === res.name?.toLowerCase());
                        if (resConfig) {
                            lat = resConfig.lat;
                            lng = resConfig.lon;
                        }

                        if (!lat || !lng) return null;
                        return (
                            <Marker key={`res-${index}`} position={[lat, lng]} icon={reservoirIcon}>
                                <Popup>
                                    <strong>Hồ chứa: {res.Lake_Name || res.name || 'Không tên'}</strong><br />
                                    Lưu lượng đến: {res.Q_to_Lake || res.inflow || 0} m³/s<br />
                                    Lưu lượng xả: {res.Q_discharge || res.outflow || 0} m³/s<br />
                                    Tổng lưu lượng xả về hạ du: {res.Total_Q_discharge || 0} m³/s<br />
                                    Mực nước thượng lưu: {res.WaterLevel_Upstream || res.waterLevel || 0} m<br />
                                    Cập nhật: {res.lastUpdate ? new Date(res.lastUpdate).toLocaleString('vi-VN') : 'N/A'}
                                </Popup>
                            </Marker>
                        )
                    })}
                </MapContainer>
            </div>

            {/* --- FLOATING UI CONTROLS --- */}

            {/* Left Sidebar */}
            <div className="absolute left-2 top-20 z-[1000] flex flex-col gap-1 bg-[#2A4B7C] bg-opacity-80 rounded text-gray-200">
                <button className="hover:bg-gray-700 hover:text-white p-2 transition-colors" title="Cài đặt"><FaCog /></button>
                <button className="hover:bg-gray-700 hover:text-white p-2 transition-colors" title="Định vị"><FaCrosshairs /></button>
                <div className="relative group inline-block">
                    <button
                        className="text-red-500 hover:bg-gray-700 p-2 transition-colors w-full flex justify-center"
                        onClick={() => setShowNewsPanel(!showNewsPanel)}
                    >
                        <FaExclamationTriangle />
                    </button>
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-md">
                        Sự kiện thiên tai
                    </div>
                </div>
                <button className="hover:bg-gray-700 hover:text-white p-2 transition-colors" title="Lớp bản đồ"><FaLayerGroup /></button>
                <button className="hover:bg-gray-700 hover:text-white p-2 transition-colors" title="Xóa"><FaTrash /></button>
            </div>

            {/* Right Toolbar Horizontal (top right) */}
            {/*<div className="absolute right-16 top-20 z-[1000] flex bg-[#2A4B7C] bg-opacity-80 rounded text-gray-200 shadow-md">
                <button className="hover:bg-gray-700 hover:text-white p-2 border-r border-gray-600"><FaCrosshairs size={14} /></button>
                <button className="hover:bg-gray-700 hover:text-white p-2 border-r border-gray-600"><FaPlus size={14} /></button>
                <button className="hover:bg-gray-700 hover:text-white p-2 border-r border-gray-600"><FaMinus size={14} /></button>
                <button className="hover:bg-gray-700 hover:text-white p-2 border-r border-gray-600"><FaExpand size={14} /></button>
                <button className="hover:bg-gray-700 hover:text-white p-2"><FaEdit size={14} /></button>
            </div>*/}

            {/* Right Toolbar Vertical */}
            {/*<div className="absolute right-2 top-20 z-[1000] flex flex-col gap-1 bg-[#2A4B7C] bg-opacity-80 rounded text-gray-200 shadow-md">
                <button className="text-yellow-400 hover:bg-gray-700 p-2 border-b border-gray-600"><FaBell /></button>
                <button className="hover:bg-gray-700 hover:text-white p-2 border-b border-gray-600"><FaMapMarkedAlt /></button>
                <button className="hover:bg-gray-700 hover:text-white p-2 border-b border-gray-600"><FaProjectDiagram /></button>
                <button className="hover:bg-gray-700 hover:text-white p-2 border-b border-gray-600"><FaSearchLocation /></button>
                <button 
                  className="hover:bg-gray-700 hover:text-white p-2"
                  onClick={() => setShowNewsPanel(!showNewsPanel)}
                  title="Tin tức / Cảnh báo public"
                >
                    <FaBook />
                </button>
            </div>*/}

            {/* Settings Panel Mockup (Bản đồ nền) */}
            {/*<div className="hidden md:block absolute right-16 top-32 z-[1000] w-64 bg-white rounded shadow-lg overflow-hidden text-sm">
                <div className="bg-gray-100 p-2 border-b font-semibold flex justify-between items-center text-gray-700">
                    <span>Bản đồ nền</span>
                    <span className="cursor-pointer">❯</span>
                </div>
                <div className="p-3">
                    <label className="flex items-center gap-2 mb-2 p-2 border rounded text-gray-600 cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="basemap" /> Bản đồ Việt Nam
                    </label>

                    <label className="flex items-center gap-2 mb-2 p-2 border-2 border-blue-400 bg-blue-50 text-blue-700 cursor-pointer rounded-md">
                        <input type="radio" name="basemap" defaultChecked /> Google
                    </label>

                </div>
            </div>*/}

            {/* Public News Panel (Toggle via left FaExclamationTriangle Icon) */}
            {showNewsPanel && (
                <div className="absolute left-14 top-20 bottom-32 z-[1000] w-[350px] bg-white rounded shadow-2xl overflow-hidden flex flex-col text-sm transition-transform duration-300">
                    <div className="bg-white text-gray-800 p-3 font-bold flex justify-between items-center shadow-sm border-b">
                        <span className="text-base text-gray-900">Sự kiện thiên tai</span>
                        <button onClick={() => setShowNewsPanel(false)} className="text-gray-500 hover:text-gray-800">
                            <FaChevronLeft />
                        </button>
                    </div>

                    <div className="bg-gray-200 text-gray-700 text-xs px-3 py-2 font-medium">
                        {publicPosts.length} thiên tai đang diễn ra / {publicPosts.length} thiên tai
                    </div>

                    <div className="p-2 border-b flex gap-2">
                        <div className="relative flex-1">
                            <FaSearch className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Tìm kiếm"
                                className="w-full border rounded pl-8 pr-2 py-1 text-xs focus:outline-blue-500"
                            />
                        </div>
                        <select className="border rounded text-xs px-2 focus:outline-blue-500 bg-white">
                            <option>2026</option>
                            <option>2025</option>
                        </select>
                        <button className="text-blue-600 px-2 border rounded hover:bg-blue-50">
                            <FaFilter />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto w-full">
                        {publicPosts.length > 0 ? (
                            publicPosts.map(post => (
                                <div key={post._id} className="border-b p-3 flex gap-3 hover:bg-blue-50 cursor-pointer transition-colors group">
                                    <div className="mt-1">
                                        {/* Mock icon per type of disaster, defaulting to Exclamation warning */}
                                        <div className="p-2 bg-red-100 text-red-600 rounded-full">
                                            <FaMountain size={16} />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-gray-800 text-[13px] leading-tight mb-1">{post.title || "Cảnh báo thiên tai"}</h3>
                                        <div className="text-[11px] text-gray-600 space-y-0.5">
                                            <p><span className="font-medium text-gray-700">Thời gian bắt đầu:</span> {new Date(post.createdAt || new Date()).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                                            <p><span className="font-medium text-gray-700">Thời gian kết thúc:</span> Đang cập nhật</p>
                                            <p className="line-clamp-1"><span className="font-medium text-gray-700">Vị trí:</span> {post.location || "Toàn khu vực"}</p>
                                            <p className="line-clamp-1"><span className="font-medium text-gray-700">Vùng ảnh hưởng:</span> {post.affectedArea || "Miền Trung"}</p>
                                            <p><span className="font-medium text-gray-700">Cấp độ rủi ro thiên tai:</span> {post.riskLevel || "Cấp 2"}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <FaChevronRight />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-6 text-center text-gray-500 text-xs mt-10">
                                <FaExclamationTriangle className="mx-auto text-4xl mb-3 text-gray-300" />
                                Không có thông tin sự kiện thiên tai nào đang diễn ra.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom Slider & Legend */}
            <div className="absolute bottom-4 left-0 right-0 z-[1000] flex flex-col md:flex-row justify-between items-end px-2 md:px-10 pointer-events-none gap-2">

                {/* Play & Timeline - Left aligned, stretches max */}
                <div className="w-full md:flex-1 max-w-4xl flex items-center gap-2 pointer-events-auto">
                    <button className="bg-white text-red-600 rounded-full w-10 h-10 shadow-md border border-gray-300 hover:bg-gray-100 flex items-center justify-center shrink-0">
                        <FaPlay className="ml-1" />
                    </button>

                    <div className="flex-1 bg-[#284061] bg-opacity-80 p-2 md:p-3 rounded text-white shadow-md text-xs">
                        <div className="relative pt-6 px-1">
                            {/* Tooltip for current time */}
                            <div className="absolute top-0 left-0 bg-[#E09022] text-white px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold whitespace-nowrap">
                                Thứ năm 05/03/2026, 11:00
                            </div>
                            <input type="range" className="w-full h-1 bg-white appearance-none outline-none cursor-pointer mt-1" defaultValue={0} />

                            <div className="flex justify-between mt-2 text-[8px] sm:text-[10px] text-gray-200">
                                <div className="flex flex-col items-center"><div className="h-1 w-[1px] bg-white mb-1"></div><span>Thứ năm 05/03/2026</span></div>
                                <div className="flex flex-col items-center"><div className="h-1 w-[1px] bg-white mb-1"></div><span>Thứ bảy 07/03/2026</span></div>
                                <div className="flex flex-col items-center"><div className="h-1 w-[1px] bg-white mb-1"></div><span>Thứ ba 10/03/2026</span></div>
                                <div className="flex flex-col items-center"><div className="h-1 w-[1px] bg-white mb-1"></div><span>Thứ năm 12/03/2026</span></div>
                                <div className="flex flex-col items-center"><div className="h-1 w-[1px] bg-white mb-1"></div><span>Chủ nhật 15/03/2026</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Legend - Right aligned */}
                <div className="bg-[#2A4B7C] bg-opacity-80 text-white rounded p-2 text-[10px] w-full md:w-80 shadow-md pointer-events-auto mt-2 md:mt-0">
                    <div className="font-bold mb-1 ml-1 text-xs">TỐC ĐỘ GIÓ</div>
                    <div className="flex justify-between mb-1 text-[9px] px-1">
                        <span className="w-10">Cấp gió</span>
                        <span className="flex-1 text-center">0</span>
                        <span className="flex-1 text-center">2</span>
                        <span className="flex-1 text-center">3</span>
                        <span className="flex-1 text-center">4</span>
                        <span className="flex-1 text-center">7</span>
                        <span className="flex-1 text-center">8</span>
                        <span className="flex-1 text-center">11</span>
                    </div>
                    <div className="flex h-3 w-full rounded overflow-hidden mb-1 ml-1 border border-gray-600">
                        <div className="flex-1 bg-blue-800"></div>
                        <div className="flex-1 bg-blue-500"></div>
                        <div className="flex-1 bg-cyan-400"></div>
                        <div className="flex-1 bg-green-400"></div>
                        <div className="flex-1 bg-yellow-400"></div>
                        <div className="flex-1 bg-[#D17647]"></div>
                        <div className="flex-1 bg-[#9A508E]"></div>
                    </div>
                    <div className="flex justify-between text-gray-300 text-[9px] px-1">
                        <span className="w-10">km/h</span>
                        <span className="flex-1 text-center">0</span>
                        <span className="flex-1 text-center">10</span>
                        <span className="flex-1 text-center">20</span>
                        <span className="flex-1 text-center">35</span>
                        <span className="flex-1 text-center">55</span>
                        <span className="flex-1 text-center">70</span>
                        <span className="flex-1 text-center">100</span>
                    </div>
                </div>

            </div>

        </div>
    );
}
