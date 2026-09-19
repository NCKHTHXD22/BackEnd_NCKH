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
import { router } from "expo-router";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../constants/colors";
import { API_URL } from "@/lib/env";
import { saveCache, loadCache } from "@/lib/offlineCache";
import i18n from "@/lib/i18n";
import ReservoirStatusCard from "../../components/ReservoirStatusCard";

const { width } = Dimensions.get("window");

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

// Mô tả từ OpenWeatherMap luôn ở tiếng Anh (proxy không truyền lang) — chỉ
// dịch sang tiếng Việt khi app đang ở chế độ vi; ở chế độ en giữ nguyên gốc.
const toVi = (desc) => {
  if (i18n.language?.startsWith("en")) return desc || "—";
  return DESC_VI[desc?.toLowerCase()] || desc || "—";
};

const getUVLevel = (uvi) => {
  if (uvi == null) return { text: "—", color: "#9E9E9E" };
  const label = (key) => i18n.t(`weather.${key}`);
  if (uvi <= 2) return { text: `${uvi} ${label("uvLow")}`, color: "#43A047" };
  if (uvi <= 5) return { text: `${uvi} ${label("uvModerate")}`, color: "#FDD835" };
  if (uvi <= 7) return { text: `${uvi} ${label("uvHigh")}`, color: "#FB8C00" };
  if (uvi <= 10) return { text: `${uvi} ${label("uvVeryHigh")}`, color: "#EF5350" };
  return { text: `${uvi} ${label("uvExtreme")}`, color: "#9C27B0" };
};

const getWeekday = (dateStr) => {
  const d = new Date(dateStr);
  if (i18n.language?.startsWith("en")) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  }
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
  const { t } = useTranslation();
  const [coord, setCoord] = useState(null);
  const [locName, setLocName] = useState(t("weather.determiningLocation"));
  const [current, setCurrent] = useState(null);
  const [hourly, setHourly] = useState([]);
  const [daily, setDaily] = useState([]);
  const [uvIndex, setUvIndex] = useState(null);
  const [rainStations, setRainStations] = useState([]);
  const [reservoirs, setReservoirs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [offlineSince, setOfflineSince] = useState(null);

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
            setLocName([g.subregion || g.district, g.city].filter(Boolean).join(", ") || t("weather.yourLocation"));
          }
        } else {
          setCoord(DEFAULT_COORD);
          setLocName(t("weather.defaultLocation"));
        }
      } catch {
        setCoord(DEFAULT_COORD);
        setLocName(t("weather.defaultLocation"));
      }
    })();
  }, [t]);

  // ── Fetch thời tiết khi có tọa độ ───────────────────────────────────────────
  const fetchWeather = useCallback(async (lat, lon) => {
    try {
      // Gọi qua backend proxy (/api/weather/*) thay vì OpenWeatherMap trực
      // tiếp — key API giờ chỉ sống ở server, không còn lộ trong app bundle.
      const [curRes, foreRes, oneRes] = await Promise.all([
        axios.get(`${API_URL}/api/weather/current`, {
          params: { lat, lon, lang: "vi" },
        }),
        axios.get(`${API_URL}/api/weather/forecast`, {
          params: { lat, lon, cnt: 40 },
        }),
        axios.get(`${API_URL}/api/weather/uvi`, {
          params: { lat, lon },
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
      setIsOffline(false);
      setOfflineSince(null);
      saveCache("weather", {
        current: curRes.data,
        uvIndex: oneRes.data?.value ?? null,
        hourly: nextItems,
        daily: dailyArr,
      });
    } catch (err) {
      console.error("Weather fetch error:", err);
      // Mất mạng — dùng dữ liệu thời tiết đã cache thay vì màn hình lỗi trắng
      const cached = await loadCache("weather");
      if (cached?.data) {
        setCurrent(cached.data.current);
        setUvIndex(cached.data.uvIndex ?? null);
        setHourly(cached.data.hourly || []);
        setDaily(cached.data.daily || []);
        setOfflineSince(cached.savedAt);
        setIsOffline(true);
      } else {
        setError(t("weather.loadError"));
      }
    }
  }, [t]);

  // ── Fetch trạm quan trắc & hồ chứa ─────────────────────────────────────────
  const fetchStations = useCallback(async (lat, lon) => {
    try {
      const [rainRes, reservoirRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/rain-station`),
        axios.get(`${API_URL}/api/inflowLake`),
      ]);

      let sortedRain = null;
      if (rainRes.status === "fulfilled" && Array.isArray(rainRes.value.data)) {
        sortedRain = rainRes.value.data
          .filter((s) => s.location?.lat && s.location?.lng)
          .map((s) => ({
            ...s,
            dist: distKm(lat, lon, s.location.lat, s.location.lng),
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 5);
        setRainStations(sortedRain);
      }

      let sortedReservoirs = null;
      if (reservoirRes.status === "fulfilled" && Array.isArray(reservoirRes.value.data)) {
        sortedReservoirs = reservoirRes.value.data
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
        setReservoirs(sortedReservoirs);
      }

      if (sortedRain || sortedReservoirs) {
        saveCache("weatherStations", { rainStations: sortedRain, reservoirs: sortedReservoirs });
      }
    } catch (err) {
      console.error("Station fetch error:", err);
      const cached = await loadCache("weatherStations");
      if (cached?.data) {
        if (cached.data.rainStations) setRainStations(cached.data.rainStations);
        if (cached.data.reservoirs) setReservoirs(cached.data.reservoirs);
      }
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
          {t("weather.loading")}
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
          {error || t("weather.loadErrorGeneric")}
        </Text>
        <TouchableOpacity onPress={() => coord && fetchWeather(coord.latitude, coord.longitude)} style={styles.retryBtn}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>{t("common.retry")}</Text>
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
      {/* ── Chế độ offline — đang hiển thị dữ liệu cache do mất mạng ── */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={styles.offlineBannerText}>
            {offlineSince
              ? t("weather.offlineWithTime", { time: new Date(offlineSince).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) })
              : t("weather.offlineNoTime")}
          </Text>
        </View>
      )}

      {/* ── HERO CARD: Thời tiết hiện tại ── */}
      <LinearGradient colors={gradColors} style={styles.heroCard}>
        <View style={styles.heroTop}>
          <Ionicons name="location-sharp" size={14} color="rgba(255,255,255,0.9)" />
          <Text style={styles.heroLoc}>{locName}</Text>
        </View>
        <Text style={styles.heroDate}>
          {new Date().toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" })}
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
            <Text style={styles.heroFeels}>{t("weather.feelsLike")}: {feelsLike}°C</Text>
          </View>
        </View>

        {/* 4 chỉ số */}
        <View style={styles.statRow}>
          <StatBox icon="water-outline" label={t("weather.humidity")} value={`${humidity}%`} />
          <StatBox icon="speedometer-outline" label={t("weather.wind")} value={`${windSpeed} km/h`} />
          <StatBox icon="sunny-outline" label={t("weather.uv")} value={uv.text} valueColor={uv.color} />
          <StatBox icon="rainy-outline" label={t("weather.rain1h")} value={`${rainMm.toFixed(1)} mm`} />
        </View>
      </LinearGradient>

      {/* ── DỰ BÁO THEO GIỜ ── */}
      <SectionHeader title={t("weather.hourlyForecast")} icon="time-outline" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyList}>
        {hourly.map((item, idx) => {
          const timeLabel = new Date(item.dt * 1000).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
          const temp_ = Math.round(item.main.temp);
          const ic = item.weather[0].icon;
          const pop = Math.round((item.pop || 0) * 100);
          return (
            <View key={idx} style={styles.hourCard}>
              <Text style={styles.hourTime}>{timeLabel}</Text>
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
      <SectionHeader title={t("weather.dailyForecast")} icon="calendar-outline" />
      <View style={styles.dailyCard}>
        {daily.map((d, idx) => (
          <View key={idx} style={[styles.dailyRow, idx < daily.length - 1 && styles.dailySep]}>
            <Text style={styles.dailyDay}>{idx === 0 ? t("weather.today") : getWeekday(d.date)}</Text>
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
          <SectionHeader title={t("weather.nearbyRainStations")} icon="rainy-outline" />
          <View style={styles.stationCard}>
            {rainStations.map((s, idx) => (
              <View key={idx} style={[styles.stationRow, idx < rainStations.length - 1 && styles.dailySep]}>
                <Ionicons name="rainy" size={16} color="#1565C0" style={{ marginRight: 8 }} />
                <Text style={styles.stationName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.stationDist}>{s.dist.toFixed(1)} km</Text>
                <View style={[styles.rainLevelBadge, { backgroundColor: getRainColor(s.sumDepth) + "22", borderColor: getRainColor(s.sumDepth) }]}>
                  <Text style={[styles.rainLevelText, { color: getRainColor(s.sumDepth) }]}>
                    {s.sumDepth != null ? `${s.sumDepth} mm/h` : t("weather.noRain")}
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
          <SectionHeader title={t("weather.nearbyReservoirs")} icon="water-outline" />
          <TouchableOpacity
            style={styles.forecastCta}
            onPress={() => router.push("/(tab)/forecasting")}
          >
            <View style={styles.forecastCtaIcon}>
              <Ionicons name="analytics" size={20} color={COLORS.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.forecastCtaTitle}>{t("weather.forecastCtaTitle")}</Text>
              <Text style={styles.forecastCtaSub}>{t("weather.forecastCtaSub")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
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
  offlineBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#616161", marginHorizontal: 12, marginTop: 10,
    borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10,
  },
  offlineBannerText: { color: "#fff", fontSize: 11, fontWeight: "600", flex: 1 },
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

  // ── Forecast CTA (link sang màn Dự báo AI/LSTM) ──────────────────────────
  forecastCta: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  forecastCtaIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  forecastCtaTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  forecastCtaSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
});
