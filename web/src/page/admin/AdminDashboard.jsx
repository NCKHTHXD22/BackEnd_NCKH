import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import adminApi from "../../api/adminApi";
import "../../styles/AdminDashboard.css";
import {
  FaUsers,
  FaWater,
  FaCheckCircle,
  FaTimesCircle,
  FaHourglassHalf,
} from "react-icons/fa";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Tạo custom icon (để marker đẹp hơn)
const sensorIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/854/854866.png", // icon giọt nước
  iconSize: [30, 30],
});

function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    users: 0,
    sensors: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
  });
  const [sensorData, setSensorData] = useState([]);
  const [userStats, setUserStats] = useState({ week: 0, month: 0, year: 0 });
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("light");

useEffect(() => {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}, [theme]);

 useEffect(() => {
  const fetchStats = async () => {
    setLoading(true);
    try {
      const [users, sensors, approved, rejected, pending, userStats] = await Promise.all([
        adminApi.getUsers(),
        adminApi.getSensorsInfo(),
        adminApi.getApprovedPosts(),
        adminApi.getRejectedPosts(),
        adminApi.getPendingPosts(),
        adminApi.getUserStats(),
      ]);

      // ánh xạ dữ liệu cảm biến từ API ngoài
      const mappedSensors = sensors.map((item) => ({
        id: item.deviceId,
        location: item.locationName,
        lat: item.coordinates.lat,
        lng: item.coordinates.lng,
        waterLevel: item.data.waterLevel,
        rain: item.data.isRaining,
        temp: item.data.temperature,
        humidity: item.data.humidity,
        description: item.data.description,
        severe: item.data.isSevere,
        timestamp: item.data.timestamp,
      }));

      setStats({
        users: users?.length || 0,
        sensors: mappedSensors.length,
        approved: approved?.length || 0,
        rejected: rejected?.length || 0,
        pending: pending?.length || 0,
      });

      setSensorData(mappedSensors);
      setUserStats(userStats);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  };

  fetchStats();
}, []);


  const postData = [
    { name: "Đã duyệt", value: stats.approved },
    { name: "Đang chờ", value: stats.pending },
    { name: "Bị từ chối", value: stats.rejected },
  ];

  const COLORS = ["#28a745", "#ffc107", "#dc3545"];

  return (
      <div className="w-full flex flex-col px-4 pt-20">
      <div className="flex flex-col items-start mb-4 gap-2"></div>
      <div className="flex justify-end mb-4">
      <button
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        className="p-2 rounded-full border hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>
      <h2 className="dashboard-title">📊 Trang chủ quản trị</h2>

      {loading ? (
        <p className="text-gray-500">Đang tải dữ liệu...</p>
      ) : (
        <>
          {/* Cards thống kê */}
          <div className="dashboard-grid">
            {/* Người dùng */}
            <div className="dashboard-card bg-blue">
              <div className="info">
                <h3>{stats.users}</h3>
                <p>Người dùng</p>
                <button
                  onClick={() => navigate("/admin/users")}
                  className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-sm font-medium hover:bg-gray-100"
                >
                  Quản lý
                </button>
              </div>
              <FaUsers className="icon" />
            </div>

            {/* Cảm biến */}
            <div className="dashboard-card bg-cyan">
              <div className="info">
                <h3>{stats.sensors}</h3>
                <p>Cảm biến</p>
                
              </div>
              <FaWater className="icon" />
            </div>

            {/* Bài đã duyệt */}
            <div className="dashboard-card bg-green">
              <div className="info">
                <h3>{stats.approved}</h3>
                <p>Bài đã duyệt</p>
                <button
                  onClick={() => navigate("/admin/approved")}
                  className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-sm font-medium hover:bg-gray-100"
                >
                  Quản lý bài đã duyệt
                </button>
              </div>
              <FaCheckCircle className="icon" />
            </div>

            {/* Bài chờ */}
            <div className="dashboard-card bg-yellow">
              <div className="info">
                <h3>{stats.pending}</h3>
                <p>Bài chờ</p>
                <button
                  onClick={() => navigate("/admin/pending")}
                  className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-sm font-medium hover:bg-gray-100"
                >
                  Quản lý bài chờ
                </button>
              </div>
              <FaHourglassHalf className="icon" />
            </div>

            {/* Bài từ chối */}
            <div className="dashboard-card bg-red">
              <div className="info">
                <h3>{stats.rejected}</h3>
                <p>Bài từ chối</p>
                <button
                  onClick={() => navigate("/admin/rejected")}
                  className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-sm font-medium hover:bg-gray-100"
                >
                  Quản lý bài từ chối
                </button>
              </div>
              <FaTimesCircle className="icon" />
            </div>
          </div>

          {/* Biểu đồ người dùng */}
          <div className="mt-8">
            <h3 className="font-semibold mb-4">📈 Thống kê người dùng</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { name: "Tuần", value: userStats.week },
                  { name: "Tháng", value: userStats.month },
                  { name: "Năm", value: userStats.year },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#007bff" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Biểu đồ bài đăng */}
<div className="mt-8">
  <h3 className="font-semibold mb-4">📰 Thống kê bài đăng</h3>
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={postData}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="name" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Bar dataKey="value" fill="#8884d8">
        {postData.map((entry, index) => (
          <Cell key={index} fill={COLORS[index]} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
</div>

{/* Thông tin cảm biến + Bản đồ */}
<div className="mt-8">
  <h3 className="font-semibold mb-4">🌊 Thông tin cảm biến</h3>

  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {/* Cột trái: Bản đồ rộng 2/3 */}
  <div className="w-full h-[500px] lg:col-span-2">
    <MapContainer
      center={
        sensorData.length > 0
          ? [sensorData[0].lat, sensorData[0].lng]
          : [16.047079, 108.20623] // fallback: Đà Nẵng
      }
      zoom={13}
      style={{ height: "100%", width: "100%", borderRadius: "12px" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {sensorData.map((s, i) => (
        <Marker key={i} position={[s.lat, s.lng]} icon={sensorIcon}>
          <Popup>
            <b>{s.location}</b> <br />
            Mực nước: {s.waterLevel} cm <br />
            Nhiệt độ: {s.temp} °C <br/>
            Độ ẩm: {s.humidity} % <br />
            Mưa: {s.rain ? "🌧️ Có mưa" : "☀️ Không mưa"} <br />
            Trạng thái: {s.severe ? "⚠️ Nguy hiểm" : "Bình thường"} <br />
            <i>{new Date(s.timestamp).toLocaleString()}</i>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  </div>

  {/* Cột phải: Thông tin chi tiết chiếm 1/3 */}
  <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-2 lg:col-span-1">
    {sensorData.map((s, i) => (
      <div
        key={i}
        className="p-4 bg-white rounded-2xl shadow-md border flex flex-col gap-3 max-w-md"
      >
        <h4 className="font-semibold text-blue-600 mb-2">
          📍 {s.location} (ID: {s.id})
        </h4>

        {/* Mini cards */}
        <div className="grid grid-cols-1 gap-2">
          <div className="p-3 rounded-lg bg-blue-100">
            <p className="font-medium text-blue-700">Mực nước</p>
            <p className="text-lg font-bold">{s.waterLevel} cm</p>
          </div>
          <div className="p-3 rounded-lg bg-red-100">
            <p className="font-medium text-red-700">Nhiệt độ</p>
            <p className="text-lg font-bold">{s.temp} °C</p>
          </div>
          <div className="p-3 rounded-lg bg-cyan-100">
            <p className="font-medium text-cyan-700">Mưa</p>
            <p className="text-lg font-bold">
              {s.rain ? "🌧️ Có mưa" : "☀️ Không mưa"}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-green-100">
            <p className="font-medium text-green-700">Độ ẩm</p>
            <p className="text-lg font-bold">{s.humidity} %</p>
          </div>
        </div>

        <p className="text-sm text-gray-500 mt-2">
          {s.severe ? "⚠️ Nguy hiểm" : "Bình thường"} |{" "}
          {new Date(s.timestamp).toLocaleString()}
        </p>
      </div>
    ))}

    {sensorData.length === 0 && (
      <p className="text-gray-500 italic">Chưa có dữ liệu cảm biến</p>
    )}
  </div>
</div>
</div>
        </>
      )}
    </div>
  );
}

export default AdminDashboard;
