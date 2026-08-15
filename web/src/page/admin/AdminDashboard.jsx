import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import adminApi from "../../api/adminApi";
import {
  FaUsers,
  FaWater,
  FaCheckCircle,
  FaTimesCircle,
  FaHourglassHalf,
  FaSync,
  FaChartBar,
  FaNewspaper,
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

/* ── KPI card ────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, icon: Icon, color, light, actionLabel, onAction }) {
  return (
    <div className="card-hover bg-white dark:bg-gray-800 rounded-2xl p-5 border border-slate-100 dark:border-gray-700 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[2.1rem] font-black leading-none" style={{ color }}>{value}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-400 mt-2">{label}</p>
        </div>
        <div
          className="shrink-0 rounded-2xl flex items-center justify-center"
          style={{ width: 48, height: 48, background: light, boxShadow: `inset 0 0 0 1px ${color}22` }}
        >
          <Icon size={20} style={{ color }} />
        </div>
      </div>
      {actionLabel && (
        <button
          onClick={onAction}
          className="mt-3.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-95"
          style={{ color, background: light }}
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}

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

  const COLORS = ["#16a34a", "#d97706", "#dc2626"];

  return (
    <div className="w-full flex flex-col px-4 pt-6 pb-6 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2.5 m-0">
          <FaChartBar className="text-blue-600" /> {t('adminDashboard.title')}
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchStats()}
            disabled={loading}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-xl font-bold shadow-md shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50 bg-header"
          >
            <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? t('adminDashboard.refreshing') : t('adminDashboard.refresh')}
          </button>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="p-3 shadow-sm rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md transition"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">{t('adminDashboard.loading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiCard
              label={t('adminDashboard.users')} value={stats.users}
              icon={FaUsers} color="#2563eb" light="linear-gradient(135deg,#dbeafe,#bfdbfe)"
              actionLabel={t('adminDashboard.manage')} onAction={() => navigate("/admin/users")}
            />
            <KpiCard
              label={t('adminDashboard.sensors')} value={stats.sensors}
              icon={FaWater} color="#0891b2" light="linear-gradient(135deg,#cffafe,#a5f3fc)"
            />
            <KpiCard
              label={t('adminDashboard.approvedPosts')} value={stats.approved}
              icon={FaCheckCircle} color="#16a34a" light="linear-gradient(135deg,#dcfce7,#bbf7d0)"
              actionLabel={t('adminDashboard.manageApproved')} onAction={() => navigate("/admin/approved")}
            />
            <KpiCard
              label={t('adminDashboard.pendingPosts')} value={stats.pending}
              icon={FaHourglassHalf} color="#d97706" light="linear-gradient(135deg,#fef3c7,#fde68a)"
              actionLabel={t('adminDashboard.managePending')} onAction={() => navigate("/admin/pending")}
            />
            <KpiCard
              label={t('adminDashboard.rejectedPosts')} value={stats.rejected}
              icon={FaTimesCircle} color="#dc2626" light="linear-gradient(135deg,#fee2e2,#fecaca)"
              actionLabel={t('adminDashboard.manageRejected')} onAction={() => navigate("/admin/rejected")}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-slate-100 dark:border-gray-700 shadow-sm">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-white mb-4">
                <FaChartBar className="text-blue-500" /> {t('adminDashboard.userStats')}
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={[
                    { name: t('adminDashboard.week'), value: userStats.week },
                    { name: t('adminDashboard.month'), value: userStats.month },
                    { name: t('adminDashboard.year'), value: userStats.year },
                  ]}
                  barCategoryGap="32%"
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="userBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#1d4ed8" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(37, 99, 235,0.06)', radius: 6 }} />
                  <Bar dataKey="value" fill="url(#userBarGrad)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-slate-100 dark:border-gray-700 shadow-sm">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-white mb-4">
                <FaNewspaper className="text-blue-500" /> {t('adminDashboard.postStats')}
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={postData} barCategoryGap="32%" margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(37, 99, 235,0.06)', radius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={56}>
                    {postData.map((entry, index) => (
                      <Cell key={index} fill={COLORS[index]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6">
            <OperationDashboard />
          </div>
        </>
      )}
    </div>
  );
}

export default AdminDashboard;
