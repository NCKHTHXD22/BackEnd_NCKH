import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLakeName } from '../../utils/lakeName';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import NavbarPublic from '../../components/NavbarPublic';
import {
    FaCog, FaCrosshairs, FaExclamationTriangle, FaLayerGroup, FaTrash,
    FaPlus, FaMinus, FaExpand, FaEdit, FaPaperPlane,
    FaBell, FaMapMarkedAlt, FaProjectDiagram, FaSearchLocation, FaBook,
    FaChevronLeft, FaSearch, FaFilter, FaChevronRight,
    FaMountain, FaUsers, FaGlobeAsia, FaMap, FaWater,
    FaCloudRain, FaTint, FaThermometerHalf
} from 'react-icons/fa';
import { MdSatellite, MdLayers, MdWarning } from 'react-icons/md';
import mapApi from '../../api/mapApi';
import { RESERVOIRS } from '../../utils/reservoirs';
import hydroDamImg from '../../assets/images/hydro-dam.png';
import LakeModal from '../../components/Map/LakeModal';
import SubmitFloodReportModal from '../../components/Map/SubmitFloodReportModal';
import { getReportTypeLabel, FLOOD_LEVEL_TYPES as REPORT_FLOOD_LEVEL_TYPES } from '../../utils/reportTypes';
import vietnamBoundary from '../../utils/vietnamBoundary.json';

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icon for Rain Stations — bright white pin with a sky-blue raindrop
const rainIcon = new L.DivIcon({
    className: '',
    html: `<div style="width:30px;height:38px;filter:drop-shadow(0 3px 5px rgba(2,132,199,0.45))">
        <div style="width:30px;height:30px;background:#ffffff;border:2.5px solid #38bdf8;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#0ea5e9" style="transform:rotate(45deg)">
                <path d="M12 2.5s6.8 7.6 6.8 12.3A6.8 6.8 0 1 1 5.2 14.8C5.2 10.1 12 2.5 12 2.5Z"/>
            </svg>
        </div>
    </div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -36],
});

// Custom Icon for Reservoirs — bright white pin with the dam pictogram inside
const reservoirIcon = new L.DivIcon({
    className: '',
    html: `<div style="width:34px;height:42px;filter:drop-shadow(0 3px 6px rgba(15,23,42,0.45))">
        <div style="width:34px;height:34px;background:#ffffff;border:2.5px solid #0284c7;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;overflow:hidden;">
            <img src="${hydroDamImg}" style="width:22px;height:22px;object-fit:contain;transform:rotate(45deg);" />
        </div>
    </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -40],
});

// Custom Icon for Community Posts — bright amber pin with a wave glyph
const postIcon = new L.DivIcon({
    className: '',
    html: `<div style="width:30px;height:38px;filter:drop-shadow(0 3px 5px rgba(217,119,6,0.5))">
        <div style="width:30px;height:30px;background:#f59e0b;border:2.5px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(45deg)">
                <path d="M2 15c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"/>
                <path d="M2 19.5c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"/>
            </svg>
        </div>
    </div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -36],
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

// Map tile configs
const TILE_LAYERS = {
    vietnam: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        label: 'Bản đồ Việt Nam',
    },
    admin: {
        url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        attribution: '&copy; Google Maps',
        label: 'Hành chính Việt Nam',
    },
    google: {
        url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        attribution: '&copy; Google Maps',
        label: 'Google',
    },
    sea: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
        attribution: '&copy; Esri Ocean',
        label: 'Phân định biển',
    },
};

// Vietnam boundary style
const vietnamStyle = {
    color: '#FF69B4',
    weight: 2,
    fillColor: 'transparent',
    fillOpacity: 0,
    dashArray: '5,5',
};

// Right sidebar icon button component
function SidebarIcon({ icon, label, active, onClick, activeClass }) {
    return (
        <div className="relative group">
            <button
                onClick={onClick}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200
                    ${active
                        ? (activeClass || 'bg-blue-600 text-white')
                        : 'bg-white text-slate-600 hover:text-blue-600 hover:bg-blue-50'
                    }`}
                title={label}
            >
                {icon}
            </button>
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover:block bg-slate-800 text-white text-xs px-2 py-1 rounded-md whitespace-nowrap shadow-md z-50">
                {label}
            </div>
        </div>
    );
}

export default function HomePage() {
    const { t, i18n } = useTranslation();
    const position = [16.0544, 108.2022];

    const [rainStations, setRainStations] = useState([]);
    const [waterLevels, setWaterLevels] = useState([]);
    const [reservoirs, setReservoirs] = useState([]);
    const [publicPosts, setPublicPosts] = useState([]);
    const [activeLake, setActiveLake] = useState(null);

    // UI panel states
    const [showNewsPanel, setShowNewsPanel] = useState(false);
    const [showBaseMapPanel, setShowBaseMapPanel] = useState(false);
    const [showCommunityPanel, setShowCommunityPanel] = useState(false);
    const [showWarningPanel, setShowWarningPanel] = useState(false);

    // Map state
    const [activeBaseMap, setActiveBaseMap] = useState('admin');
    const [showVietnamBorder, setShowVietnamBorder] = useState(true);
    const [showSurface, setShowSurface] = useState(false);

    // Community layer toggles
    const [showRainLayer, setShowRainLayer] = useState(true);
    const [showReservoirLayer, setShowReservoirLayer] = useState(true);
    const [showPostsLayer, setShowPostsLayer] = useState(false);

    // Gửi thông tin ngập
    const [showSubmitModal, setShowSubmitModal] = useState(false);

    const refreshPublicPosts = async () => {
        try {
            const postData = await mapApi.getPublicPosts();
            setPublicPosts(Array.isArray(postData) ? postData.filter(p => p.status === 'approved') : []);
        } catch (error) {
            console.error("Error refreshing public posts:", error);
        }
    };

    useEffect(() => {
        const fetchMapData = async () => {
            try {
                const [rainData, waterData, reservoirData, postData] = await Promise.all([
                    mapApi.getRainStations().catch(() => []),
                    mapApi.getWaterLevelStations().catch(() => []),
                    mapApi.getReservoirs().catch(() => []),
                    mapApi.getPublicPosts().catch(() => [])
                ]);

                setRainStations(Array.isArray(rainData) ? rainData : []);
                setWaterLevels(Array.isArray(waterData) ? waterData : []);

                const resArray = Array.isArray(reservoirData) ? reservoirData : [];
                const updatedReservoirs = resArray.map(res => ({
                    ...res,
                    Q_to_Lake: res.qvao || 0,
                    Q_discharge: res.luuluongxa || 0,
                    WaterLevel_Upstream: res.htl || 0,
                    Total_Q_discharge: res.luuluongxa || 0
                }));
                setReservoirs(updatedReservoirs);

                setPublicPosts(Array.isArray(postData) ? postData.filter(p => p.status === 'approved') : []);
            } catch (error) {
                console.error("Error fetching map data:", error);
            }
        };
        fetchMapData();
    }, []);

    // Generate warnings from reservoir data
    const generateWarnings = () => {
        const warnings = [];
        reservoirs.forEach(res => {
            const lakeName = res.name || res.Lake_Name || 'Không tên';
            if (res.Q_to_Lake > 100) {
                warnings.push({
                    id: `high-inflow-${res.Id_Lake}`,
                    type: 'inflow',
                    level: res.Q_to_Lake > 200 ? 'danger' : 'warning',
                    title: `Lưu lượng đến hồ ${lakeName} cao`,
                    detail: `Q đến: ${res.Q_to_Lake} m³/s`,
                    time: res.lastUpdate,
                });
            }
            if (res.WaterLevel_Upstream > 0 && res.Q_discharge > 50) {
                warnings.push({
                    id: `high-discharge-${res.Id_Lake}`,
                    type: 'discharge',
                    level: res.Q_discharge > 150 ? 'danger' : 'warning',
                    title: `Xả lũ hồ ${lakeName}`,
                    detail: `Q xả: ${res.Q_discharge} m³/s | MN: ${res.WaterLevel_Upstream}m`,
                    time: res.lastUpdate,
                });
            }
        });
        // Check rain stations for heavy rain
        rainStations.forEach(st => {
            if (st.sumDepth > 50) {
                warnings.push({
                    id: `heavy-rain-${st.uuid || st.name}`,
                    type: 'rain',
                    level: st.sumDepth > 100 ? 'danger' : 'warning',
                    title: `Mưa lớn tại ${st.name || 'trạm đo'}`,
                    detail: `Lượng mưa: ${st.sumDepth} mm`,
                    time: st.lastUpdate,
                });
            }
        });
        return warnings;
    };

    const warnings = generateWarnings();

    const currentTile = TILE_LAYERS[activeBaseMap];

    return (
        <div className="relative w-full h-screen overflow-hidden bg-gray-100 font-sans">
            <NavbarPublic />

            {/* Map Area */}
            <div className="absolute top-16 left-0 w-full h-[calc(100vh-4rem)] z-0">
                <MapContainer
                    center={position}
                    zoom={12}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                >
                    <TileLayer
                        key={activeBaseMap}
                        attribution={currentTile.attribution}
                        url={currentTile.url}
                    />

                    {/* Vietnam Boundary GeoJSON */}
                    {showVietnamBorder && (
                        <GeoJSON
                            key="vietnam-border"
                            data={vietnamBoundary}
                            style={vietnamStyle}
                        />
                    )}

                    <MapResizer />

                    {/* Rendering Rain Stations */}
                    {showRainLayer && rainStations.map((station, index) => {
                        const lat = station.location?.lat || station.lat;
                        const lng = station.location?.lng || station.lng;
                        if (!lat || !lng) return null;
                        return (
                            <Marker key={`rain-${index}`} position={[lat, lng]} icon={rainIcon}>
                                <Popup>
                                    <strong>{t('map.rainStation')} {station.name || t('map.noName')}</strong><br />
                                    {t('map.rainfall')} {station.sumDepth || 0} mm<br />
                                    {t('map.status')} {station.level || t('map.normal')}
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
                                    <strong>{t('map.waterLevelStation')} {station.name || t('map.noName')}</strong><br />
                                    {t('map.waterLevel')} {station.waterLevel || 0} m
                                </Popup>
                            </Marker>
                        )
                    })}

                    {/* Rendering Reservoirs */}
                    {showReservoirLayer && reservoirs.map((res, index) => {
                        let lat = res.location?.lat || res.lat;
                        let lng = res.location?.lng || res.lng || res.lon;
                        const resConfig = RESERVOIRS[res.Id_Lake] || Object.values(RESERVOIRS).find(r => r.name.toLowerCase() === res.Lake_Name?.toLowerCase() || r.name.toLowerCase() === res.name?.toLowerCase());
                        if (resConfig) {
                            lat = resConfig.lat;
                            lng = resConfig.lon;
                        }
                        if (!lat || !lng) return null;
                        const lakeName = formatLakeName(res.name || res.Lake_Name || 'Không tên', i18n.language);

                        return (
                            <Marker key={`res-${index}`} position={[lat, lng]} icon={reservoirIcon}>
                                <Popup>
                                    <div className="font-bold border-b pb-1 mb-1 text-blue-800">{t('map.reservoir')} {lakeName}</div>
                                    <div className="text-sm space-y-1">
                                        <p><strong>{t('map.inflow')}</strong> <span className="text-blue-600">{res.Q_to_Lake || 0}</span> m³/s</p>
                                        <p><strong>{t('map.discharge')}</strong> <span className="text-red-600">{res.Q_discharge || 0}</span> m³/s</p>
                                        <p><strong>{t('map.upstreamLevel')}</strong> <span className="text-green-600">{res.WaterLevel_Upstream || 0}</span> m</p>
                                        <p className="text-[10px] text-gray-400 pt-1 border-t">{t('map.updatedAt')} {res.lastUpdate ? new Date(res.lastUpdate).toLocaleString('vi-VN') : 'N/A'}</p>
                                    </div>
                                    <button
                                        className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-4 rounded text-sm transition-colors shadow-sm"
                                        onClick={() => setActiveLake({ id: res.Id_Lake, data: res })}
                                    >
                                        {t('map.manageReservoir')}
                                    </button>
                                </Popup>
                                <Tooltip direction="top" offset={[0, -20]} opacity={1}>
                                    <div className="text-xs font-semibold">
                                        {lakeName}<br />
                                        Q: {res.Q_to_Lake || 0} m³/s | H: {res.WaterLevel_Upstream || 0}m
                                    </div>
                                </Tooltip>
                            </Marker>
                        )
                    })}

                    {/* Rendering Approved Community Posts (Điểm ngập / Cây ngã đổ — 2 loại có toạ độ điểm) */}
                    {showPostsLayer && publicPosts.map((post, index) => {
                        const lat = post.location?.latitude;
                        const lng = post.location?.longitude;
                        if (!lat || !lng) return null;
                        const reportType = post.reportType || 'flood_point';
                        const hasFloodLevel = REPORT_FLOOD_LEVEL_TYPES.includes(reportType);
                        const aiColor = post.aiLabel === 'DANGEROUS' ? '#ef4444' : post.aiLabel === 'DEEP' ? '#f97316' : post.aiLabel === 'HIGH' ? '#f59e0b' : '#10b981';
                        return (
                            <Marker key={`post-${index}`} position={[lat, lng]} icon={postIcon}>
                                <Popup>
                                    <div className="font-bold border-b pb-1 mb-2 text-amber-700">🌊 {getReportTypeLabel(reportType)}</div>
                                    <div className="text-xs space-y-1">
                                        <p><strong>Địa điểm:</strong> {post.location?.address ? `${post.location.address}, ` : ''}{post.location?.district}, {post.location?.province}</p>
                                        {hasFloodLevel && (
                                            <p><strong>Mức lũ (báo cáo):</strong> <span className="font-bold text-blue-600">{post.floodLevel} cm</span></p>
                                        )}
                                        {hasFloodLevel && post.aiFloodLevel != null && (
                                            <p><strong>Mức ngập (AI):</strong> <span className="font-bold" style={{ color: aiColor }}>{post.aiFloodLevel} cm</span></p>
                                        )}
                                        {hasFloodLevel && <p><strong>Khu vực:</strong> {post.areaType}</p>}
                                        {post.description && <p><strong>Mô tả:</strong> {post.description}</p>}
                                        {hasFloodLevel && post.aiLabel && (
                                            <p><strong>Phân loại AI:</strong> <span className="font-bold px-1.5 py-0.5 rounded text-white text-[10px]" style={{ backgroundColor: aiColor }}>{post.aiLabel}</span>
                                            {post.aiScore != null && <span className="text-gray-400 ml-1">({Math.round(post.aiScore * 100)}%)</span>}
                                            </p>
                                        )}
                                        <p className="text-gray-400 pt-1 border-t">{new Date(post.floodTime || post.createdAt).toLocaleString('vi-VN')}</p>
                                    </div>
                                    {post.imageUrls?.[0] && (
                                        <img src={post.imageUrls[0]} alt="" className="mt-2 rounded w-full h-20 object-cover" />
                                    )}
                                </Popup>
                                <Tooltip direction="top" offset={[0, -30]} opacity={1}>
                                    <span className="text-xs font-semibold">
                                        {post.location?.district ? `${post.location.district} · ` : ''}
                                        {hasFloodLevel ? `${post.floodLevel}cm` : getReportTypeLabel(reportType)}
                                    </span>
                                </Tooltip>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>

            {/* --- FLOATING UI CONTROLS --- */}

            {/* Left Sidebar - floating tool buttons */}
            <div className="absolute left-3 top-20 z-[1000] flex flex-col gap-2">
                <button
                    className="w-10 h-10 rounded-xl bg-white text-slate-600 shadow-lg shadow-slate-900/10 hover:shadow-xl hover:-translate-y-0.5 hover:text-blue-600 flex items-center justify-center transition-all duration-200"
                    title="Cài đặt"
                >
                    <FaCog />
                </button>
                <button
                    className="w-10 h-10 rounded-xl bg-white text-slate-600 shadow-lg shadow-slate-900/10 hover:shadow-xl hover:-translate-y-0.5 hover:text-blue-600 flex items-center justify-center transition-all duration-200"
                    title="Định vị"
                >
                    <FaCrosshairs />
                </button>

                <div className="flex flex-col gap-2">
                    <div className="relative group">
                        <button
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 ${showNewsPanel ? 'bg-red-500 text-white' : 'bg-white text-red-500 hover:bg-red-50'}`}
                            onClick={() => { setShowNewsPanel(!showNewsPanel); setShowWarningPanel(false); setShowCommunityPanel(false); }}
                        >
                            <FaExclamationTriangle />
                        </button>
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:block bg-slate-800 text-white text-xs px-2 py-1 rounded-md whitespace-nowrap shadow-md">
                            Sự kiện thiên tai
                        </div>
                    </div>
                    <button
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 ${showWarningPanel ? 'bg-orange-500 text-white' : 'bg-white text-orange-500 hover:bg-orange-50'}`}
                        title="Cảnh báo thiên tai"
                        onClick={() => { setShowWarningPanel(!showWarningPanel); setShowNewsPanel(false); setShowCommunityPanel(false); }}
                    >
                        <MdWarning size={18} />
                    </button>
                </div>

                <button
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 ${showBaseMapPanel ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}
                    title="Lớp bản đồ"
                    onClick={() => setShowBaseMapPanel(!showBaseMapPanel)}
                >
                    <FaLayerGroup />
                </button>

                <div className="relative group">
                    <button
                        className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 bg-gradient-to-br from-blue-600 to-sky-500 text-white"
                        onClick={() => setShowSubmitModal(true)}
                    >
                        <FaPaperPlane size={14} />
                    </button>
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:block bg-slate-800 text-white text-xs px-2 py-1 rounded-md whitespace-nowrap shadow-md">
                        Gửi thông tin ngập
                    </div>
                </div>
            </div>

            {/* Right Sidebar */}
            <div className="absolute right-3 top-20 z-[1000] flex flex-col gap-2">
                {/* Functional icons group */}
                <div className="flex flex-col gap-2">
                    <SidebarIcon
                        icon={<FaGlobeAsia size={16} />}
                        label="Bản đồ nền"
                        active={showBaseMapPanel}
                        onClick={() => setShowBaseMapPanel(!showBaseMapPanel)}
                    />
                    <SidebarIcon
                        icon={<FaUsers size={16} />}
                        label="Thông tin cộng đồng"
                        active={showCommunityPanel}
                        onClick={() => { setShowCommunityPanel(!showCommunityPanel); setShowNewsPanel(false); setShowWarningPanel(false); }}
                    />
                    <SidebarIcon
                        icon={<FaSearchLocation size={16} />}
                        label="Tìm kiếm"
                    />
                </div>

                {/* Zoom controls */}
                <div className="flex flex-col gap-2">
                    <SidebarIcon icon={<FaPlus size={14} />} label="Phóng to" />
                    <SidebarIcon icon={<FaMinus size={14} />} label="Thu nhỏ" />
                    <SidebarIcon icon={<FaExpand size={14} />} label="Toàn màn hình" />
                </div>
            </div>

            {/* Base Map Panel */}
            {showBaseMapPanel && (
                <div className="absolute right-16 top-20 z-[1000] w-64 bg-white rounded-2xl shadow-2xl shadow-blue-900/20 overflow-hidden text-sm border border-blue-100 animate-in slide-in-from-right">
                    <div className="bg-gradient-to-r from-blue-50 to-sky-50 p-3 border-b border-blue-100 font-semibold flex justify-between items-center text-slate-700">
                        <span className="flex items-center gap-2"><FaLayerGroup className="text-blue-600" /> Bản đồ nền</span>
                        <button onClick={() => setShowBaseMapPanel(false)} className="text-slate-400 hover:text-slate-600 text-lg">❯</button>
                    </div>
                    <div className="p-3 space-y-2">
                        {Object.entries(TILE_LAYERS).map(([key, layer]) => (
                            <label
                                key={key}
                                className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-all
                                    ${activeBaseMap === key
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                                onClick={() => setActiveBaseMap(key)}
                            >
                                <input
                                    type="radio"
                                    name="basemap"
                                    checked={activeBaseMap === key}
                                    onChange={() => setActiveBaseMap(key)}
                                    className="accent-blue-600"
                                />
                                <span className="font-medium">{layer.label}</span>
                            </label>
                        ))}

                        <div className="border-t pt-3 mt-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showVietnamBorder}
                                    onChange={(e) => setShowVietnamBorder(e.target.checked)}
                                    className="accent-blue-600"
                                />
                                <span className="text-gray-600 font-medium">Biên giới Việt Nam</span>
                            </label>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t mt-2">
                            <span className="text-gray-600 font-medium">Bề mặt</span>
                            <button
                                onClick={() => setShowSurface(!showSurface)}
                                className={`relative w-10 h-5 rounded-full transition-colors ${showSurface ? 'bg-blue-600' : 'bg-gray-300'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${showSurface ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Community Info Panel (Thông tin cộng đồng) */}
            {showCommunityPanel && (
                <div className="absolute right-16 top-20 z-[1000] w-64 bg-white rounded-2xl shadow-2xl shadow-blue-900/20 overflow-hidden text-sm border border-blue-100">
                    <div className="bg-gradient-to-r from-blue-50 to-sky-50 p-3 border-b border-blue-100 font-semibold flex justify-between items-center text-slate-700">
                        <span className="flex items-center gap-2"><FaUsers className="text-blue-600" /> Thông tin cộng đồng</span>
                        <button onClick={() => setShowCommunityPanel(false)} className="text-slate-400 hover:text-slate-600 text-lg">❯</button>
                    </div>
                    <div className="p-3 space-y-2">
                        <label
                            className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-all ${showRainLayer ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                            <input
                                type="checkbox"
                                checked={showRainLayer}
                                onChange={e => setShowRainLayer(e.target.checked)}
                                className="accent-blue-600"
                            />
                            <span className="font-medium flex items-center gap-1.5"><FaCloudRain className="text-blue-400" /> Trạm mưa</span>
                        </label>

                        <label
                            className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-all ${showReservoirLayer ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                            <input
                                type="checkbox"
                                checked={showReservoirLayer}
                                onChange={e => setShowReservoirLayer(e.target.checked)}
                                className="accent-blue-600"
                            />
                            <span className="font-medium flex items-center gap-1.5"><FaWater className="text-cyan-500" /> Trạm hồ chứa</span>
                        </label>

                        <label
                            className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-all ${showPostsLayer ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                            <input
                                type="checkbox"
                                checked={showPostsLayer}
                                onChange={e => setShowPostsLayer(e.target.checked)}
                                className="accent-amber-500"
                            />
                            <span className="font-medium flex items-center gap-1.5"><FaUsers className="text-amber-500" /> Báo lũ cộng đồng</span>
                        </label>

                        {showPostsLayer && (
                            <div className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                🌊 {publicPosts.filter(p => p.location?.latitude).length} điểm báo lũ đang hiển thị
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Disaster Warning Panel (Cảnh báo thiên tai) */}
            {showWarningPanel && (
                <div className="absolute left-14 top-20 bottom-32 z-[1000] w-[360px] bg-white rounded-2xl shadow-2xl shadow-orange-900/20 overflow-hidden flex flex-col text-sm border border-orange-100">
                    <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-3 font-bold flex justify-between items-center">
                        <span className="flex items-center gap-2"><MdWarning /> Cảnh báo thiên tai</span>
                        <button onClick={() => setShowWarningPanel(false)} className="text-white/70 hover:text-white">
                            <FaChevronLeft />
                        </button>
                    </div>

                    <div className="bg-orange-50 text-orange-800 text-xs px-3 py-2 font-medium border-b">
                        {warnings.length} cảnh báo đang hoạt động
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {warnings.length > 0 ? (
                            warnings.map(w => (
                                <div key={w.id} className={`border-b p-3 flex gap-3 hover:bg-orange-50 cursor-pointer transition-colors ${w.level === 'danger' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-orange-400'}`}>
                                    <div className="mt-1">
                                        <div className={`p-2 rounded-full ${w.level === 'danger' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                                            {w.type === 'rain' ? <FaCloudRain size={14} /> : w.type === 'inflow' ? <FaTint size={14} /> : <FaWater size={14} />}
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={`font-bold text-[13px] leading-tight mb-1 ${w.level === 'danger' ? 'text-red-700' : 'text-orange-700'}`}>{w.title}</h3>
                                        <div className="text-[11px] text-gray-600 space-y-0.5">
                                            <p>{w.detail}</p>
                                            {w.time && <p className="text-gray-400">Cập nhật: {new Date(w.time).toLocaleString('vi-VN')}</p>}
                                        </div>
                                    </div>
                                    <div className={`self-center px-2 py-0.5 rounded text-[10px] font-bold ${w.level === 'danger' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                        {w.level === 'danger' ? 'NGUY HIỂM' : 'CẢNH BÁO'}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-6 text-center text-gray-500 text-xs mt-10">
                                <MdWarning className="mx-auto text-4xl mb-3 text-gray-300" />
                                Không có cảnh báo thiên tai nào đang hoạt động.
                            </div>
                        )}

                        {/* Summary section */}
                        <div className="p-3 bg-gray-50 border-t">
                            <h4 className="font-bold text-gray-700 text-xs mb-2">TỔNG HỢP DỮ LIỆU</h4>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-white p-2 rounded border text-center">
                                    <div className="text-blue-600 font-bold text-sm">{rainStations.length}</div>
                                    <div className="text-[10px] text-gray-500">Trạm mưa</div>
                                </div>
                                <div className="bg-white p-2 rounded border text-center">
                                    <div className="text-green-600 font-bold text-sm">{reservoirs.length}</div>
                                    <div className="text-[10px] text-gray-500">Hồ chứa</div>
                                </div>
                                <div className="bg-white p-2 rounded border text-center">
                                    <div className="text-red-600 font-bold text-sm">{warnings.length}</div>
                                    <div className="text-[10px] text-gray-500">Cảnh báo</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Public News Panel (Sự kiện thiên tai) */}
            {showNewsPanel && (
                <div className="absolute left-14 top-20 bottom-32 z-[1000] w-[350px] bg-white rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden flex flex-col text-sm border border-slate-200 transition-transform duration-300">
                    <div className="bg-gradient-to-r from-blue-50 to-sky-50 text-slate-800 p-3 font-bold flex justify-between items-center border-b border-blue-100">
                        <span className="text-base text-slate-900">Sự kiện thiên tai</span>
                        <button onClick={() => setShowNewsPanel(false)} className="text-slate-500 hover:text-slate-800">
                            <FaChevronLeft />
                        </button>
                    </div>

                    <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 font-medium">
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

            {/* Lake Modal Overlay */}
            <LakeModal
                lakeId={activeLake?.id}
                lakeData={activeLake?.data}
                onClose={() => setActiveLake(null)}
            />

            {/* Gửi thông tin ngập */}
            <SubmitFloodReportModal
                open={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                onSubmitted={refreshPublicPosts}
            />
        </div>
    );
}
