import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import adminApi from "../../api/adminApi";
import "../../styles/AdminDashboard.css";
import {
  FaUsers,
  FaWater,
  FaCheckCircle,
  FaTimesCircle,
  FaHourglassHalf,
  FaSync
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
import OperationDashboard from "./OperationDashboard";


const sensorIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/854/854866.png",
  iconSize: [30, 30],
});

function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        adminApi.getUsers(),
        adminApi.getSensorsInfo(),
        adminApi.getApprovedPosts(),
        adminApi.getRejectedPosts(),
        adminApi.getPendingPosts(),
        adminApi.getUserStats(),
      ]);

      const [usersRes, sensorsRes, approvedRes, rejectedRes, pendingRes, userStatsRes] = results;

      const users = usersRes.status === 'fulfilled' ? usersRes.value : [];
      const sensors = sensorsRes.status === 'fulfilled' ? sensorsRes.value : [];
      const approved = approvedRes.status === 'fulfilled' ? approvedRes.value : [];
      const rejected = rejectedRes.status === 'fulfilled' ? rejectedRes.value : [];
      const pending = pendingRes.status === 'fulfilled' ? pendingRes.value : [];
      const userStatsValue = userStatsRes.status === 'fulfilled' ? userStatsRes.value : { week: 0, month: 0, year: 0 };

      results.forEach((res, i) => {
        if (res.status === 'rejected') {
          console.warn(`API call ${i} failed:`, res.reason);
        }
      });

      const mappedSensors = Array.isArray(sensors) ? sensors.map((item) => ({
        id: item.deviceId,
        location: item.locationName,
        lat: item.coordinates?.lat || 0,
        lng: item.coordinates?.lng || 0,
        waterLevel: item.data?.waterLevel || 0,
        rain: item.data?.isRaining || false,
        temp: item.data?.temperature || 0,
        humidity: item.data?.humidity || 0,
        description: item.data?.description || "",
        severe: item.data?.isSevere || false,
        timestamp: item.data?.timestamp || new Date(),
      })) : [];

      setStats({
        users: Array.isArray(users) ? users.length : 0,
        sensors: mappedSensors.length,
        approved: Array.isArray(approved) ? approved.length : 0,
        rejected: Array.isArray(rejected) ? rejected.length : 0,
        pending: Array.isArray(pending) ? pending.length : 0,
      });

      setSensorData(mappedSensors);
      setUserStats(userStatsValue);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {}, []);

  const postData = [
    { name: t('adminDashboard.approved'), value: stats.approved },
    { name: t('adminDashboard.pendingChart'), value: stats.pending },
    { name: t('adminDashboard.rejectedChart'), value: stats.rejected },
  ];

  const COLORS = ["#28a745", "#ffc107", "#dc3545"];

  return (
    <div className="w-full flex flex-col px-4 pt-20">
      <div className="flex flex-col items-start mb-4 gap-2"></div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="dashboard-title m-0">📊 {t('adminDashboard.title')}</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchStats()}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? t('adminDashboard.refreshing') : t('adminDashboard.refresh')}
          </button>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="p-3 shadow-md rounded-full border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">{t('adminDashboard.loading')}</p>
      ) : (
        <>
          <div className="dashboard-grid">
            <div className="dashboard-card bg-blue">
              <div className="info">
                <h3>{stats.users}</h3>
                <p>{t('adminDashboard.users')}</p>
                <button
                  onClick={() => navigate("/admin/users")}
                  className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-sm font-medium hover:bg-gray-100"
                >
                  {t('adminDashboard.manage')}
                </button>
              </div>
              <FaUsers className="icon" />
            </div>

            <div className="dashboard-card bg-cyan">
              <div className="info">
                <h3>{stats.sensors}</h3>
                <p>{t('adminDashboard.sensors')}</p>
              </div>
              <FaWater className="icon" />
            </div>

            <div className="dashboard-card bg-green">
              <div className="info">
                <h3>{stats.approved}</h3>
                <p>{t('adminDashboard.approvedPosts')}</p>
                <button
                  onClick={() => navigate("/admin/approved")}
                  className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-sm font-medium hover:bg-gray-100"
                >
                  {t('adminDashboard.manageApproved')}
                </button>
              </div>
              <FaCheckCircle className="icon" />
            </div>

            <div className="dashboard-card bg-yellow">
              <div className="info">
                <h3>{stats.pending}</h3>
                <p>{t('adminDashboard.pendingPosts')}</p>
                <button
                  onClick={() => navigate("/admin/pending")}
                  className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-sm font-medium hover:bg-gray-100"
                >
                  {t('adminDashboard.managePending')}
                </button>
              </div>
              <FaHourglassHalf className="icon" />
            </div>

            <div className="dashboard-card bg-red">
              <div className="info">
                <h3>{stats.rejected}</h3>
                <p>{t('adminDashboard.rejectedPosts')}</p>
                <button
                  onClick={() => navigate("/admin/rejected")}
                  className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-sm font-medium hover:bg-gray-100"
                >
                  {t('adminDashboard.manageRejected')}
                </button>
              </div>
              <FaTimesCircle className="icon" />
            </div>
          </div>

          <div className="mt-8">
            <h3 className="font-semibold mb-4">📈 {t('adminDashboard.userStats')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { name: t('adminDashboard.week'), value: userStats.week },
                  { name: t('adminDashboard.month'), value: userStats.month },
                  { name: t('adminDashboard.year'), value: userStats.year },
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

          <div className="mt-8">
            <h3 className="font-semibold mb-4">📰 {t('adminDashboard.postStats')}</h3>
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

          <OperationDashboard />
        </>
      )}
    </div>
  );
}

export default AdminDashboard;
