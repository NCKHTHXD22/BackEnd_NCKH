// app/(tab)/weather.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  RefreshControl,
  Dimensions,
} from "react-native";
import * as Location from "expo-location";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../../constants/colors";
import { API_URL } from "@/lib/env";
import ReservoirStatusCard from "../../components/ReservoirStatusCard";

const { width } = Dimensions.get("window");

const OWM_KEY = "c41fa113b3691968f275c36bcadebe29";
const DEFAULT_COORD = { latitude: 16.047, longitude: 108.206 }; // Đà Nẵng fallback

// Bản dịch mô tả thời tiết OpenWeatherMap → Tiếng Việt
const DESC_VI = {
  "clear sky": "Quang đãng",
  "few clouds": "Ít mây",
  "scattered clouds": "Mây rải rác",
  "broken clouds": "Nhiều mây",
  "overcast clouds": "Trời âm u",
  "light rain": "Mưa nhỏ",
  "moderate rain": "Mưa vừa",
  "heavy intensity rain": "Mưa lớn",
  "thunderstorm": "Giông bão",
  "drizzle": "Mưa phùn",
  "snow": "Tuyết",
  "mist": "Sương mù",
  "haze": "Khói mù",
  "fog": "Sương dày",
};

const toVi = (desc) => DESC_VI[desc?.toLowerCase()] || desc || "—";

const getUVLevel = (uvi) => {
  if (uvi == null) return { text: "—", color: "#9E9E9E" };
  if (uvi <= 2) return { text: `${uvi} Thấp`, color: "#43A047" };
  if (uvi <= 5) return { text: `${uvi} Trung bình`, color: "#FDD835" };
  if (uvi <= 7) return { text: `${uvi} Cao`, color: "#FB8C00" };
  if (uvi <= 10) return { text: `${uvi} Rất cao`, color: "#EF5350" };
  return { text: `${uvi} Cực cao`, color: "#9C27B0" };
};

const getWeekday = (dateStr) => {
  const d = new Date(dateStr);
  return ["CN", "T.2", "T.3", "T.4", "T.5", "T.6", "T.7"][d.getDay()];
};

// Tính khoảng cách giữa 2 tọa độ (km)
const distKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export default function WeatherScreen() {
  const [coord, setCoord] = useState(null);
  const [locName, setLocName] = useState("Đang xác định...");
  const [current, setCurrent] = useState(null);
  const [hourly, setHourly] = useState([]);
  const [daily, setDaily] = useState([]);
  const [uvIndex, setUvIndex] = useState(null);
  const [rainStations, setRainStations] = useState([]);
  const [reservoirs, setReservoirs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // ── Lấy vị trí GPS ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoord({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

          // Reverse geocode để lấy tên thành phố
          const geo = await Location.reverseGeocodeAsync(loc.coords);
          if (geo?.length > 0) {
            const g = geo[0];
            setLocName([g.subregion || g.district, g.city].filter(Boolean).join(", ") || "Vị trí của bạn");
          }
        } else {
          setCoord(DEFAULT_COORD);
          setLocName("Đà Nẵng (mặc định)");
        }
      } catch {
        setCoord(DEFAULT_COORD);
        setLocName("Đà Nẵng (mặc định)");
      }
    })();
  }, []);

  // ── Fetch thời tiết khi có tọa độ ───────────────────────────────────────────
  const fetchWeather = useCallback(async (lat, lon) => {
    try {
      const [curRes, foreRes, oneRes] = await Promise.all([
        axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
          params: { lat, lon, units: "metric", appid: OWM_KEY, lang: "vi" },
        }),
        axios.get(`https://api.openweathermap.org/data/2.5/forecast`, {
          params: { lat, lon, units: "metric", appid: OWM_KEY, cnt: 40 },
        }),
        axios.get(`https://api.openweathermap.org/data/2.5/uvi`, {
          params: { lat, lon, appid: OWM_KEY },
        }).catch(() => ({ data: { value: null } })),
      ]);

      setCurrent(curRes.data);
      setUvIndex(oneRes.data?.value ?? null);

      // Dự báo theo giờ (24h tới = 8 item x 3h)
      const nextItems = foreRes.data.list.slice(0, 8);
      setHourly(nextItems);

      // Dự báo 5 ngày: gom nhóm theo ngày
      const dayMap = {};
      foreRes.data.list.forEach((item) => {
        const date = item.dt_txt.split(" ")[0];
        if (!dayMap[date]) dayMap[date] = [];
        dayMap[date].push(item);
      });
      const dailyArr = Object.entries(dayMap)
        .slice(0, 5)
        .map(([date, items]) => {
          const temps = items.map((i) => i.main.temp);
          const rainItems = items.map((i) => i.rain?.["3h"] || 0);
          const totalRain = rainItems.reduce((a, b) => a + b, 0);
          return {
            date,
            min: Math.round(Math.min(...temps)),
            max: Math.round(Math.max(...temps)),
            icon: items[Math.floor(items.length / 2)].weather[0].icon,
            desc: items[Math.floor(items.length / 2)].weather[0].description,
            rain: totalRain,
          };
        });
      setDaily(dailyArr);
    } catch (err) {
      setError("Không thể tải dữ liệu thời tiết. Kiểm tra kết nối mạng.");
      console.error("Weather fetch error:", err);
    }
  }, []);

  // ── Fetch trạm quan trắc & hồ chứa ─────────────────────────────────────────
  const fetchStations = useCallback(async (lat, lon) => {
    try {
      const [rainRes, reservoirRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/rain-station`),
        axios.get(`${API_URL}/api/inflowLake`),
      ]);

      if (rainRes.status === "fulfilled" && Array.isArray(rainRes.value.data)) {
        const sorted = rainRes.value.data
          .filter((s) => s.location?.lat && s.location?.lng)
          .map((s) => ({
            ...s,
            dist: distKm(lat, lon, s.location.lat, s.location.lng),
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 5);
        setRainStations(sorted);
      }

      if (reservoirRes.status === "fulfilled" && Array.isArray(reservoirRes.value.data)) {
        const sorted = reservoirRes.value.data
          .filter((r) => (r.lat || r.location?.lat) && (r.lon || r.location?.lng))
          .map((r) => ({
            ...r,
            dist: distKm(
              lat, lon,
              r.lat || r.location?.lat || 0,
              r.lon || r.location?.lng || 0
            ),
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3);
        setReservoirs(sorted);
      }
    } catch (err) {
      console.error("Station fetch error:", err);
    }
  }, []);

  // ── Kích hoạt fetch khi có tọa độ ──────────────────────────────────────────
  useEffect(() => {
    if (!coord) return;
    (async () => {
      setLoading(true);
      setError(null);
      await Promise.all([
        fetchWeather(coord.latitude, coord.longitude),
        fetchStations(coord.latitude, coord.longitude),
      ]);
      setLoading(false);
    })();
  }, [coord, fetchWeather, fetchStations]);

  const onRefresh = useCallback(async () => {
    if (!coord) return;
    setRefreshing(true);
    setError(null);
    await Promise.all([
      fetchWeather(coord.latitude, coord.longitude),
      fetchStations(coord.latitude, coord.longitude),
    ]);
    setRefreshing(false);
  }, [coord, fetchWeather, fetchStations]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 12, color: "#666", fontSize: 14 }}>
          Đang tải dữ liệu thời tiết...
        </Text>
      </View>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error || !current) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={64} color="#B0BEC5" />
        <Text style={{ marginTop: 16, color: "#546E7A", fontSize: 15, textAlign: "center", paddingHorizontal: 30 }}>
          {error || "Không thể tải dữ liệu thời tiết."}
        </Text>
        <TouchableOpacity onPress={() => coord && fetchWeather(coord.latitude, coord.longitude)} style={styles.retryBtn}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const temp = Math.round(current.main?.temp);
  const feelsLike = Math.round(current.main?.feels_like);
  const humidity = current.main?.humidity;
  const windSpeed = Math.round((current.wind?.speed || 0) * 3.6); // m/s → km/h
  const description = current.weather?.[0]?.description || "—";
  const icon = current.weather?.[0]?.icon;
  const rainMm = current.rain?.["1h"] || 0;
  const uv = getUVLevel(uvIndex);

  // Gradient theo ca ngày
  const hour = new Date().getHours();
  const gradColors =
    hour >= 6 && hour < 12
      ? ["#FFF9C4", "#B3E5FC"]
      : hour >= 12 && hour < 18
      ? ["#B3E5FC", "#81D4FA"]
      : hour >= 18 && hour < 21
      ? ["#FFCC80", "#CE93D8"]
      : ["#1A237E", "#283593"];

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* ── HERO CARD: Thời tiết hiện tại ── */}
      <LinearGradient colors={gradColors} style={styles.heroCard}>
        <View style={styles.heroTop}>
          <Ionicons name="location-sharp" size={14} color="rgba(255,255,255,0.9)" />
          <Text style={styles.heroLoc}>{locName}</Text>
        </View>
        <Text style={styles.heroDate}>
          {new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
        </Text>

        <View style={styles.heroMain}>
          {icon ? (
            <Image
              source={{ uri: `https://openweathermap.org/img/wn/${icon}@4x.png` }}
              style={styles.heroIcon}
            />
          ) : null}
          <View>
            <Text style={styles.heroTemp}>{temp}°C</Text>
            <Text style={styles.heroDesc}>{toVi(description)}</Text>
            <Text style={styles.heroFeels}>Cảm giác: {feelsLike}°C</Text>
          </View>
        </View>

        {/* 4 chỉ số */}
        <View style={styles.statRow}>
          <StatBox icon="water-outline" label="Độ ẩm" value={`${humidity}%`} />
          <StatBox icon="speedometer-outline" label="Gió" value={`${windSpeed} km/h`} />
          <StatBox icon="sunny-outline" label="UV" value={uv.text} valueColor={uv.color} />
          <StatBox icon="rainy-outline" label="Mưa 1h" value={`${rainMm.toFixed(1)} mm`} />
        </View>
      </LinearGradient>

      {/* ── DỰ BÁO THEO GIỜ ── */}
      <SectionHeader title="Dự báo theo giờ (24h)" icon="time-outline" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyList}>
        {hourly.map((item, idx) => {
          const t = new Date(item.dt * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
          const temp_ = Math.round(item.main.temp);
          const ic = item.weather[0].icon;
          const pop = Math.round((item.pop || 0) * 100);
          return (
            <View key={idx} style={styles.hourCard}>
              <Text style={styles.hourTime}>{t}</Text>
              <Image source={{ uri: `https://openweathermap.org/img/wn/${ic}@2x.png` }} style={styles.hourIcon} />
              <Text style={styles.hourTemp}>{temp_}°</Text>
              {pop > 0 && (
                <View style={styles.popRow}>
                  <Ionicons name="rainy-outline" size={10} color="#1565C0" />
                  <Text style={styles.popText}>{pop}%</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── DỰ BÁO 5 NGÀY ── */}
      <SectionHeader title="Dự báo 5 ngày tới" icon="calendar-outline" />
      <View style={styles.dailyCard}>
        {daily.map((d, idx) => (
          <View key={idx} style={[styles.dailyRow, idx < daily.length - 1 && styles.dailySep]}>
            <Text style={styles.dailyDay}>{idx === 0 ? "Hôm nay" : getWeekday(d.date)}</Text>
            <Image source={{ uri: `https://openweathermap.org/img/wn/${d.icon}@2x.png` }} style={styles.dailyIcon} />
            <Text style={styles.dailyDesc} numberOfLines={1}>{toVi(d.desc)}</Text>
            <View style={styles.dailyTemps}>
              <Text style={styles.dailyMax}>{d.max}°</Text>
              <Text style={styles.dailyMin}>{d.min}°</Text>
            </View>
            {d.rain > 0 && (
              <View style={styles.rainBadge}>
                <Text style={styles.rainBadgeText}>{d.rain.toFixed(1)}mm</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* ── TRẠM QUAN TRẮC MƯA ── */}
      {rainStations.length > 0 && (
        <>
          <SectionHeader title="Trạm quan trắc mưa gần đây" icon="rainy-outline" />
          <View style={styles.stationCard}>
            {rainStations.map((s, idx) => (
              <View key={idx} style={[styles.stationRow, idx < rainStations.length - 1 && styles.dailySep]}>
                <Ionicons name="rainy" size={16} color="#1565C0" style={{ marginRight: 8 }} />
                <Text style={styles.stationName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.stationDist}>{s.dist.toFixed(1)} km</Text>
                <View style={[styles.rainLevelBadge, { backgroundColor: getRainColor(s.sumDepth) + "22", borderColor: getRainColor(s.sumDepth) }]}>
                  <Text style={[styles.rainLevelText, { color: getRainColor(s.sumDepth) }]}>
                    {s.sumDepth != null ? `${s.sumDepth} mm/h` : "Không mưa"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── HỒ CHỨA GẦN NHẤT ── */}
      {reservoirs.length > 0 && (
        <>
          <SectionHeader title="Hồ chứa gần vị trí" icon="water-outline" />
          <View style={styles.reservoirWrapper}>
            {reservoirs.map((r, idx) => (
              <ReservoirStatusCard
                key={idx}
                name={r.name}
                htl={r.htl ?? null}
                mndbt={r.mndbt ?? null}
                mngc={r.mngc ?? null}
                qvao={r.qvao ?? null}
                luuluongxa={r.luuluongxa ?? null}
                sumDepth={r.sumDepth ?? null}
                trend={r.trend ?? null}
                lastUpdate={r.lastUpdate ?? null}
              />
            ))}
          </View>
        </>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatBox({ icon, label, value, valueColor }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={20} color="rgba(255,255,255,0.85)" />
      <Text numberOfLines={1} style={[styles.statValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, icon }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function getRainColor(mm) {
  if (!mm || mm === 0) return "#90A4AE";
  if (mm < 5) return "#42A5F5";
  if (mm < 15) return "#1565C0";
  if (mm < 30) return "#FB8C00";
  return "#EF5350";
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F6FA" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  retryBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },

  // ── Hero
  heroCard: {
    margin: 12,
    borderRadius: 20,
    padding: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  heroTop: { flexDirection: "row", alignItems: "center" },
  heroLoc: { color: "rgba(255,255,255,0.95)", fontSize: 13, fontWeight: "600", marginLeft: 4 },
  heroDate: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2, marginBottom: 12 },
  heroMain: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  heroIcon: { width: 90, height: 90, marginRight: 8 },
  heroTemp: { fontSize: 56, fontWeight: "800", color: "#fff", lineHeight: 60 },
  heroDesc: { fontSize: 16, color: "rgba(255,255,255,0.9)", fontWeight: "600", marginTop: 2 },
  heroFeels: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  statRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  statBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingVertical: 8,
    marginHorizontal: 3,
  },
  statValue: { color: "#fff", fontWeight: "700", fontSize: 13, marginTop: 4, textAlign: "center" },
  statLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10, marginTop: 2 },

  // ── Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#37474F" },

  // ── Hourly
  hourlyList: { paddingHorizontal: 10, paddingBottom: 4 },
  hourCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginHorizontal: 4,
    width: 68,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  hourTime: { fontSize: 11, color: "#546E7A", fontWeight: "600" },
  hourIcon: { width: 36, height: 36, marginVertical: 2 },
  hourTemp: { fontSize: 15, fontWeight: "700", color: "#1A237E" },
  popRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  popText: { fontSize: 10, color: "#1565C0", marginLeft: 2, fontWeight: "600" },

  // ── Daily
  dailyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    marginHorizontal: 12,
    paddingVertical: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  dailyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dailySep: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F8",
  },
  dailyDay: { width: 54, fontSize: 13, fontWeight: "700", color: "#263238" },
  dailyIcon: { width: 36, height: 36 },
  dailyDesc: { flex: 1, fontSize: 12, color: "#607D8B", marginLeft: 4 },
  dailyTemps: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 4 },
  dailyMax: { fontSize: 14, fontWeight: "700", color: "#E64A19" },
  dailyMin: { fontSize: 13, color: "#78909C" },
  rainBadge: {
    backgroundColor: "#E3F2FD",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  rainBadgeText: { fontSize: 10, color: "#1565C0", fontWeight: "600" },

  // ── Stations
  stationCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    marginHorizontal: 12,
    paddingVertical: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  stationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stationName: { flex: 1, fontSize: 13, color: "#263238", fontWeight: "500" },
  stationDist: { fontSize: 11, color: "#90A4AE", marginRight: 8 },
  rainLevelBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rainLevelText: { fontSize: 11, fontWeight: "700" },

  // ── Reservoirs
  reservoirWrapper: { marginHorizontal: 12 },
});
