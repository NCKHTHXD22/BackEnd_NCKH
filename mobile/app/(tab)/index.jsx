// app/(tab)/index.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
  TextInput,
  Linking,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Circle, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";
import { useRouter } from "expo-router";
import mapStyles from "../../assets/styles/home.styles.js";
import { COLORS } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/env";

const OWM_KEY = "c41fa113b3691968f275c36bcadebe29";
const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const DESC_VI = {
  "clear sky": "Quang đãng", "few clouds": "Ít mây", "scattered clouds": "Mây rải rác",
  "broken clouds": "Nhiều mây", "overcast clouds": "Trời âm u", "light rain": "Mưa nhỏ",
  "moderate rain": "Mưa vừa", "heavy intensity rain": "Mưa lớn", "thunderstorm": "Giông bão",
  "drizzle": "Mưa phùn", "snow": "Tuyết", "mist": "Sương mù", "haze": "Khói mù", "fog": "Sương dày",
};
const toVi = (d) => DESC_VI[d?.toLowerCase()] || d || "—";

const getRainLevelColor = (mm) => {
  if (!mm || mm === 0) return { color: "#78909C", label: "Không mưa", bg: "#ECEFF1" };
  if (mm < 5)  return { color: "#42A5F5", label: "Mưa nhẹ",     bg: "#E3F2FD" };
  if (mm < 15) return { color: "#1565C0", label: "Mưa vừa",     bg: "#BBDEFB" };
  if (mm < 30) return { color: "#FB8C00", label: "Mưa lớn",     bg: "#FFF3E0" };
  return             { color: "#EF5350", label: "Mưa rất lớn", bg: "#FFEBEE" };
};

// ── Haversine distance (km) ───────────────────────────────────────────────────
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Lọc tòa nhà: giữ max 15 cái gần nhất, không trùng (>80m), trong 5km ───────────
function filterBuildings(buildings, centerLat, centerLng, max = 15) {
  const sorted = [...buildings].sort(
    (a, b) =>
      getDistanceKm(centerLat, centerLng, a.lat, a.lng) -
      getDistanceKm(centerLat, centerLng, b.lat, b.lng)
  );
  const result = [];
  for (const b of sorted) {
    if (getDistanceKm(centerLat, centerLng, b.lat, b.lng) > 5) break; // ngoài 5km → dừng
    const duplicate = result.some(
      (r) => getDistanceKm(r.lat, r.lng, b.lat, b.lng) < 0.08 // < 80m
    );
    if (!duplicate) result.push(b);
    if (result.length >= max) break;
  }
  return result;
}

// ── Giải mã polyline Google Directions (encoded polyline algorithm) ────────────
function decodePolyline(encoded) {
  if (!encoded) return [];
  const pts = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let shift = 0, result = 0, b;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; }
    while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; }
    while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    const la = lat / 1e5, lo = lng / 1e5;
    // Bỏ tọa độ NaN / ngoài phạm vi → tránh crash Google Maps Android
    if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
      pts.push({ latitude: la, longitude: lo });
    }
  }
  return pts;
}

// ── Hiển thị thời gian tương đối (vd: "2 giờ trước") ─────────────────────────
function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60)          return "Vừa xong";
  if (s < 3600)        return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400)       return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

const AREA_TYPE_LABEL = { "Trong nhà": "Trong nhà", "Ngoài đường": "Ngoài đường", "Khác": "Khu vực khác" };

// ── Cloudinary thumbnail: chuyển ảnh gốc → thumbnail 280×180 để tiết kiệm RAM ──
function cloudinaryThumb(url) {
  if (!url || !url.includes("cloudinary.com")) return url;
  // Chèn transformation sau /upload/  →  /upload/w_280,h_180,c_fill,q_auto,f_webp/
  return url.replace("/upload/", "/upload/w_280,h_180,c_fill,q_auto,f_webp/");
}

// ── Google Places fallback — dùng Places API (New) vì Nearby Search cũ bị tắt ────────
// Endpoint: https://places.googleapis.com/v1/places:searchNearby (POST, JSON)
async function fetchBuildingsFromGooglePlaces(lat, lng, gmapsKey) {
  // Các loại công trình cần tìm (Places API New dùng "includedTypes")
  const typeSets = [
    ["lodging"],           // khách sạn
    ["office"],            // tòa văn phòng
    ["apartment_complex"], // chung cư
  ];
  const seen    = new Set();
  const results = [];

  for (const includedTypes of typeSets) {
    try {
      const body = {
        includedTypes,
        maxResultCount: 10,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 3000.0,
          },
        },
      };

      const res = await fetch(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method:  "POST",
          headers: {
            "Content-Type":     "application/json",
            "X-Goog-Api-Key":   gmapsKey,
            // Chỉ lấy những field cần thiết (tránh billing tốn kém)
            "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types",
          },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json();

      if (data.error) {
        console.warn(`Google Places New (${includedTypes}): ${data.error.status} — ${data.error.message}`);
        continue;
      }

      (data.places || []).forEach((p) => {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          const pTypes = p.types || [];
          const buildingType = pTypes.includes("lodging")           ? "hotel"
                             : pTypes.includes("apartment_complex") ? "apartments"
                             : "office";
          results.push({
            id:           `gp-${p.id}`,
            lat:          p.location?.latitude,
            lng:          p.location?.longitude,
            name:         p.displayName?.text || p.displayName || "Tòa nhà",
            levels:       null,
            height:       null,
            buildingType,
            type:         "building",
          });
        }
      });
    } catch (e) {
      console.warn(`Google Places New (${includedTypes}) lỗi: ${e.message}`);
    }
  }
  console.log(`[Buildings] Google Places New: tìm được ${results.length} công trình`);
  return results;
}


export default function HomeScreen() {
  const router = useRouter();
  const [location, setLocation] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [rainStations, setRainStations] = useState([]);
  const [reservoirs, setReservoirs] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [viewMode, setViewMode] = useState("status");
  const [showReservoirs, setShowReservoirs] = useState(true);
  // tracksViewChanges: true lúc đầu để Ionicons render xong, sau 800ms tắt để tiết kiệm RAM
  const [markerTracking, setMarkerTracking] = useState(true);
  const [showRainStations, setShowRainStations] = useState(true);
  const [miniWeather, setMiniWeather] = useState(null);
  const [popupWeather, setPopupWeather] = useState(null);
  const [loadingPopup, setLoadingPopup] = useState(false);

  // ── Function panel ──────────────────────────────────────────────────────────
  const [showFunctionPanel, setShowFunctionPanel] = useState(false);

  // ── Tall buildings ──────────────────────────────────────────────────────────
  const [showBuildings, setShowBuildings] = useState(false);
  const [tallBuildings, setTallBuildings] = useState([]);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [buildingCenter, setBuildingCenter] = useState(null); // tọa độ tâm vòng tròn
  // ── Route polyline ──────────────────────────────────────────────────────────
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo]   = useState(null); // { distance, duration }

  // ── Address search ──────────────────────────────────────────────────────────
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchPin, setSearchPin] = useState(null);
  const searchTimeout = useRef(null);

  // ── In-app alert banners ─────────────────────────────────────────────────────
  const [localAlerts, setLocalAlerts] = useState([]);
  // Map<id, dismissTimestamp> — lưu thời điểm dismiss để tính cooldown 30 phút
  const dismissedAlertsRef  = useRef(new Map());
  // Timestamp lần check cuối — debounce 5 phút, tránh chạy liên tục theo GPS
  const lastAlertCheckRef   = useRef(0);

  // Ngưỡng và cooldown
  const ALERT_COOLDOWN_MS   = 30 * 60 * 1000; // 30 phút: dismiss xong không hiện lại
  const ALERT_CHECK_DELAY   =  5 * 60 * 1000; // 5 phút: debounce check
  const FLOOD_RADIUS_KM     = 0.3;             // 300m (trước 500m)
  const FLOOD_LEVEL_CM      = 30;              // chỉ cảnh báo khi ngập > 30cm
  const RAIN_HEAVY_MM       = 50;              // ≥50mm/h = cực kỳ nặng
  const RAIN_RADIUS_KM      = 5;

  // ── Caches (tránh refetch không cần thiết) ──────────────────────────────────
  const buildingCacheRef = useRef({}); // key: "lat2,lng2" → buildings[]
  const routeCacheRef    = useRef({}); // key: "destLat3,destLng3" → {coords, info}

  const mapRef = useRef(null);
  const mapStyle = [
    { featureType: "poi.business",       stylers: [{ visibility: "off" }] },
    { featureType: "poi.attraction",     stylers: [{ visibility: "off" }] },
    { featureType: "poi.medical",        stylers: [{ visibility: "off" }] },
    { featureType: "poi.school",         stylers: [{ visibility: "off" }] },
    { featureType: "poi.place_of_worship", stylers: [{ visibility: "off" }] },
    { featureType: "transit.station",   stylers: [{ visibility: "off" }] },
  ];

  // ── Mini weather ────────────────────────────────────────────────────────────
  const fetchMiniWeather = useCallback(async (lat, lon) => {
    try {
      const res = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
        params: { lat, lon, units: "metric", appid: OWM_KEY },
      });
      setMiniWeather({
        temp: Math.round(res.data.main?.temp),
        humidity: res.data.main?.humidity,
        wind: Math.round((res.data.wind?.speed || 0) * 3.6),
        icon: res.data.weather?.[0]?.icon,
      });
    } catch { /* ignore */ }
  }, []);

  // ── Popup weather ───────────────────────────────────────────────────────────
  const fetchPopupWeather = useCallback(async (lat, lon) => {
    setLoadingPopup(true);
    setPopupWeather(null);
    try {
      const res = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
        params: { lat, lon, units: "metric", appid: OWM_KEY },
      });
      setPopupWeather({
        temp: Math.round(res.data.main?.temp),
        feelsLike: Math.round(res.data.main?.feels_like),
        humidity: res.data.main?.humidity,
        wind: Math.round((res.data.wind?.speed || 0) * 3.6),
        desc: res.data.weather?.[0]?.description || "",
        icon: res.data.weather?.[0]?.icon || "01d",
        rainMm: res.data.rain?.["1h"] || 0,
      });
    } catch { setPopupWeather(null); }
    setLoadingPopup(false);
  }, []);

  // ── Fetch tall buildings: cache → Overpass SONG SONG → Google Places ──────────────────
  const fetchTallBuildings = useCallback(async (lat, lng) => {
    // Cache (precision 2 ≈ 1.1km) — không refetch khi user ở gần vị trí đã tìm
    const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    console.log(`[Buildings] fetch tại (${lat.toFixed(4)}, ${lng.toFixed(4)}), cacheKey=${cacheKey}`);

    if (buildingCacheRef.current[cacheKey]) {
      const cached = buildingCacheRef.current[cacheKey];
      const filtered = filterBuildings(cached, lat, lng);
      console.log(`[Buildings] Cache hit: ${cached.length} raw → ${filtered.length} filtered`);
      setTallBuildings(filtered);
      setLoadingBuildings(false);
      return;
    }

    setLoadingBuildings(true);
    setTallBuildings([]);

    // ―― Overpass: chạy TẤT CẢ mirrors SONG SONG, lấy cái nào trả về trước ――
    const OVERPASS_MIRRORS = [
      "https://z.overpass-api.de/api/interpreter",
      "https://lz4.overpass-api.de/api/interpreter",
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    const query =
      `[out:json][timeout:15];` +
      `(` +
      `way["building:levels"](around:3000,${lat},${lng});` +
      `way["building"~"hotel|office|apartments|commercial"](around:3000,${lat},${lng});` +
      `way["tourism"="hotel"](around:3000,${lat},${lng});` +
      `);out center tags 30;`;

    const nameOf = (tags) => {
      if (tags?.["name:vi"] || tags?.name) return tags?.["name:vi"] || tags?.name;
      if (tags?.building === "hotel" || tags?.tourism === "hotel") return "Khách sạn";
      if (tags?.building === "office")     return "Tòa văn phòng";
      if (tags?.building === "apartments") return "Chung cư cao tầng";
      if (tags?.building === "commercial") return "Tòa thương mại";
      return "Tòa nhà cao tầng";
    };

    const parseOverpass = (data) =>
      (data.elements || [])
        .filter((el) => el.center)
        .map((el) => ({
          id:           el.id,
          lat:          el.center.lat,
          lng:          el.center.lon,
          name:         nameOf(el.tags),
          levels:       el.tags?.["building:levels"] || null,
          height:       el.tags?.height || null,
          buildingType: el.tags?.building || el.tags?.tourism || null,
          type:         "building",
        }));

    const tryMirror = (endpoint) => new Promise(async (resolve, reject) => {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(endpoint, {
          method:  "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body:    `data=${encodeURIComponent(query)}`,
          signal:  ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) { reject(new Error(`HTTP ${res.status}`)); return; }
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("json")) { reject(new Error("non-JSON")); return; }
        const data = await res.json();
        const list = parseOverpass(data);
        if (list.length === 0) { reject(new Error("empty result")); return; }
        console.log(`[Buildings] Overpass OK (${endpoint.split("/")[2]}): ${list.length} records`);
        resolve(list);
      } catch (e) {
        clearTimeout(timer);
        console.log(`[Buildings] Overpass FAIL (${endpoint.split("/")[2]}): ${e.message}`);
        reject(e);
      }
    });

    let buildings = null;
    try {
      buildings = await Promise.any(OVERPASS_MIRRORS.map(tryMirror));
      console.log(`[Buildings] Overpass tổng: ${buildings.length} buildings`);
    } catch {
      console.log("[Buildings] Tất cả Overpass mirrors thất bại → Google Places");
    }

    // Fallback: Google Places Nearby Search
    if (!buildings || buildings.length === 0) {
      buildings = await fetchBuildingsFromGooglePlaces(lat, lng, GMAPS_KEY);
      console.log(`[Buildings] Google Places trả về: ${buildings.length} buildings`);
    }

    const filtered = filterBuildings(buildings || [], lat, lng);
    console.log(`[Buildings] Sau filterBuildings: ${filtered.length} hiển thị (từ ${(buildings||[]).length} raw)`);

    buildingCacheRef.current[cacheKey] = buildings || [];
    setTallBuildings(filtered);
    setLoadingBuildings(false);
  }, []);


  // ── Fetch route ──────────────────────────────────────────────────────────────
  // Tối ưu: bỏ alternatives=true (chậm 2-3x), bỏ avoid=flooding (không hợp lệ),
  // thêm timeout 8s, cache theo origin+dest
  const routeFetchingRef = useRef(false); // tránh fetch trùng khi user nhấn nhanh

  const fetchRoute = useCallback(async (originLat, originLng, destLat, destLng) => {
    // Cache key theo cả origin + dest (precision 3 = ~111m)
    const cacheKey = `${originLat.toFixed(3)},${originLng.toFixed(3)}|${destLat.toFixed(3)},${destLng.toFixed(3)}`;
    const cached   = routeCacheRef.current[cacheKey];
    if (cached) {
      setRouteCoords(cached.coords);
      setRouteInfo(cached.info);
      mapRef.current?.fitToCoordinates(
        [{ latitude: originLat, longitude: originLng }, { latitude: destLat, longitude: destLng }],
        { edgePadding: { top: 80, right: 40, bottom: 280, left: 40 }, animated: true }
      );
      return;
    }

    if (routeFetchingRef.current) return; // đang fetch → bỏ qua
    routeFetchingRef.current = true;

    setRouteCoords([]);
    setRouteInfo({ loading: true }); // loading state cho UI

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000); // timeout 8s

    try {
      const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
      const body = {
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        languageCode: "vi-VN",
        units: "METRIC"
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GMAPS_KEY,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data = await res.json();

      if (data.error) {
        setRouteInfo({ error: Math.floor(data.error.code) === 403 ? "Lỗi truy cập (REQUEST_DENIED)" : (data.error.message || "Lỗi khi tìm đường") });
      } else if (data.routes?.length > 0) {
        const best = data.routes[0];
        const coords = decodePolyline(best.polyline?.encodedPolyline);
        
        let distanceTxt = "";
        if (best.distanceMeters) {
          distanceTxt = best.distanceMeters >= 1000 
            ? (best.distanceMeters / 1000).toFixed(1) + " km" 
            : best.distanceMeters + " m";
        }

        let durationTxt = "";
        if (best.duration) {
          const seconds = parseInt(best.duration.replace("s", ""), 10);
          durationTxt = Math.ceil(seconds / 60) + " phút";
        }

        const info = {
          distance: distanceTxt,
          duration: durationTxt,
          loading: false,
        };
        
        routeCacheRef.current[cacheKey] = { coords, info };
        setRouteCoords(coords);
        setRouteInfo(info);
        mapRef.current?.fitToCoordinates(
          [{ latitude: originLat, longitude: originLng }, { latitude: destLat, longitude: destLng }],
          { edgePadding: { top: 80, right: 40, bottom: 280, left: 40 }, animated: true }
        );
      } else {
        setRouteInfo({ error: "Không tìm được đường" });
      }
    } catch (e) {
      clearTimeout(timeout);
      const msg = e.name === "AbortError" ? "Hết thời gian chờ (8s)" : e.message;
      console.warn("Route fetch:", msg);
      setRouteInfo({ error: msg });
    } finally {
      routeFetchingRef.current = false;
    }
  }, []);

  // ── Address search (Google Places Autocomplete) ─────────────────────────────
  const searchAddress = useCallback(async (query) => {
    if (!query || query.length < 3) { setSearchResults([]); return; }
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(query)}` +
        `&components=country:vn` +
        `&location=16.0544,108.2022` +
        `&radius=30000` +
        `&language=vi` +
        `&key=${GMAPS_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      setSearchResults(data.predictions || []);
    } catch { setSearchResults([]); }
  }, []);

  const handleSearchChange = (text) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchAddress(text), 350);
  };

  // ── Select place → get coordinates ─────────────────────────────────────────
  const selectPlace = useCallback(async (placeId, description) => {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${placeId}` +
        `&fields=geometry,name` +
        `&key=${GMAPS_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      const loc = data.result?.geometry?.location;
      if (loc) {
        setSearchPin({ lat: loc.lat, lng: loc.lng, name: description, type: "pin" });
        setSearchResults([]);
        setSearchQuery(description.split(",")[0]);
        mapRef.current?.animateToRegion(
          { latitude: loc.lat, longitude: loc.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 },
          1000
        );
      }
    } catch (e) { console.error("Place details:", e); }
  }, []);

  // ── Open Google Maps for turn-by-turn navigation ────────────────────────────
  const openDirections = (destLat, destLng) => {
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${destLat},${destLng}` +
      `&travelmode=driving`;
    Linking.openURL(url);
  };

  // ── Toggle buildings layer ──────────────────────────────────────────────────
  // Tọa độ test Đà Nẵng (dùng khi chưa có GPS)
  const TEST_CENTER = { latitude: 16.06056, longitude: 108.21306 };

  const toggleBuildings = () => {
    const next = !showBuildings;
    setShowBuildings(next);
    if (next) {
      const center = location
        ? { latitude: location.latitude, longitude: location.longitude }
        : TEST_CENTER;
      setBuildingCenter(center);
      // Zoom bản đồ vào vùng tìm kiếm
      mapRef.current?.animateToRegion(
        { latitude: center.latitude, longitude: center.longitude, latitudeDelta: 0.09, longitudeDelta: 0.09 },
        800
      );
      // Luôn fetch lại khi bật (để cập nhật theo vị trí mới)
      fetchTallBuildings(center.latitude, center.longitude);
    } else {
      setBuildingCenter(null);
    }
    setShowFunctionPanel(false);
  };

  // ── GPS watch ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let subscription;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
          (loc) => setLocation(loc.coords)
        );
      } catch (err) { console.error("❌ GPS:", err); }
    })();
    return () => subscription?.remove();
  }, []);

  // ── Mini weather when GPS ready ─────────────────────────────────────────────
  useEffect(() => {
    if (!location) return;
    fetchMiniWeather(location.latitude, location.longitude);
    const id = setInterval(
      () => fetchMiniWeather(location.latitude, location.longitude),
      30 * 60 * 1000
    );
    return () => clearInterval(id);
  }, [location, fetchMiniWeather]);

  // ── Fetch map data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [postRes, rainRes, reservoirRes] = await Promise.all([
        fetch(`${API_URL}/api/posts`,       { headers: { Accept: "application/json" } }),
        fetch(`${API_URL}/api/rain-station`, { headers: { Accept: "application/json" } }),
        fetch(`${API_URL}/api/inflowLake`,   { headers: { Accept: "application/json" } }),
      ]);
      const safeJson = async (res, name) => {
        const text = await res.text();
        try { return JSON.parse(text); }
        catch { throw new Error(`Parse error: ${name}`); }
      };
      const postsData    = await safeJson(postRes,    "posts");
      const rainData     = await safeJson(rainRes,    "rain");
      const reservoirData = await safeJson(reservoirRes, "reservoir");

      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      setMarkers(
        (postsData || [])
          .filter((p) => {
            if (!p.createdAt) return true;
            return now - new Date(p.createdAt).getTime() <= SEVEN_DAYS;
          })
          .map((p) => ({
            ...p, type: "post",
            coordinates: { lat: p.location?.latitude || 0, lng: p.location?.longitude || 0 },
            locationName: p.location?.address || "Ch\u01b0a x\u00e1c \u0111\u1ecbnh",
            content: p.description || "",
          }))
      );
      setRainStations((rainData || []).map((r) => ({
        ...r, type: "rain",
        coordinates: { lat: r.location?.lat || 0, lng: r.location?.lng || 0 },
      })));
      setReservoirs((reservoirData || []).map((r) => ({
        ...r, type: "reservoir",
        coordinates: { lat: r.lat || r.location?.lat || 0, lng: r.lon || r.location?.lng || 0 },
      })));
    } catch (error) { console.error("❌ Map fetch:", error); }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Tắt tracksViewChanges sau 800ms để Ionicons có đủ thời gian render trước
  useEffect(() => {
    if (markers.length > 0 || rainStations.length > 0 || reservoirs.length > 0) {
      const t = setTimeout(() => setMarkerTracking(false), 800);
      return () => clearTimeout(t);
    }
  }, [markers, rainStations, reservoirs]);

  // Khi buildings load xong (thường sau 5-15s do Overpass timeout), bật lại
  // tracksViewChanges 1.2s để Ionicons có thời gian render, rồi tắt lại
  useEffect(() => {
    if (tallBuildings.length > 0) {
      setMarkerTracking(true);
      const t = setTimeout(() => setMarkerTracking(false), 1200);
      return () => clearTimeout(t);
    }
  }, [tallBuildings]);

  // ── Kiểm tra cảnh báo — debounce 5 phút, ngưỡng cao, cooldown 30 phút ────────
  useEffect(() => {
    if (!location) return;

    const now = Date.now();

    // DEBOUNCE: bỏ qua nếu chưa đủ 5 phút kể từ lần check cuối
    // (location thay đổi mỗi 5s, markers mỗi 60s → check liên tục nếu không debounce)
    if (now - lastAlertCheckRef.current < ALERT_CHECK_DELAY) return;
    lastAlertCheckRef.current = now;

    // Helper: alert có thể hiện không? (chưa dismiss, hoặc cooldown đã hết)
    const canShow = (id) => {
      const ts = dismissedAlertsRef.current.get(id);
      return !ts || (now - ts) >= ALERT_COOLDOWN_MS;
    };

    const newAlerts = [];

    // 1. NGẬP: chỉ cảnh báo khi có bài ngập THỰC SỰ nghiêm trọng trong bán kính 300m
    //    Tiêu chí: floodLevel > 30cm HOẶC được đánh dấu là khu vực thường xuyên ngập
    const seriousFloodPosts = markers.filter((m) => {
      if (!m.coordinates?.lat) return false;
      if (getDistanceKm(location.latitude, location.longitude, m.coordinates.lat, m.coordinates.lng) > FLOOD_RADIUS_KM) return false;
      return (m.floodLevel >= FLOOD_LEVEL_CM) || m.isFrequentFlood;
    });
    if (seriousFloodPosts.length > 0 && canShow("flood-nearby")) {
      const maxLevel = Math.max(...seriousFloodPosts.map((p) => p.floodLevel || 0));
      newAlerts.push({
        id: "flood-nearby",
        type: "flood",
        icon: "water",
        color: "#1565C0",
        bg: "#E3F2FD",
        title: `🌊 Ngập nghiêm trọng trong 300m${maxLevel > 0 ? ` (${maxLevel}cm)` : ""}`,
        message: `${seriousFloodPosts.length} điểm ngập gần bạn. Hãy cẩn thận khi di chuyển!`,
      });
    }

    // 2. MƯA: chỉ cảnh báo khi MƯA CỰC KỲ NẶNG ≥50mm/h trong 5km
    //    Ngưỡng 50mm/h = mưa to đặc biệt, nguy cơ ngập rất cao
    const extremeRainStations = rainStations.filter((r) => {
      if ((r.sumDepth || 0) < RAIN_HEAVY_MM) return false;
      if (!r.coordinates?.lat) return false;
      return getDistanceKm(location.latitude, location.longitude, r.coordinates.lat, r.coordinates.lng) <= RAIN_RADIUS_KM;
    });
    if (extremeRainStations.length > 0 && canShow("rain-extreme")) {
      const maxRain = Math.max(...extremeRainStations.map((r) => r.sumDepth || 0));
      newAlerts.push({
        id: "rain-extreme",
        type: "rain",
        icon: "rainy",
        color: "#B71C1C",
        bg: "#FFEBEE",
        title: `🌧 Mưa đặc biệt lớn ${maxRain}mm/h — ${extremeRainStations.length} trạm`,
        message: "Nguy cơ ngập cao. Không di chuyển vào vùng trũng thấp ngay lúc này.",
      });
    }

    // Chỉ cập nhật state nếu danh sách alert thực sự thay đổi
    setLocalAlerts((prev) => {
      const prevIds = prev.map((a) => a.id).sort().join(",");
      const newIds  = newAlerts.map((a) => a.id).sort().join(",");
      return prevIds === newIds ? prev : newAlerts;
    });
  }, [location, markers, rainStations]); // reservoirs đã bỏ khỏi banner map



  // dismiss lưu timestamp để tính cooldown 30 phút (không phải vĩnh viễn trong session)
  const dismissAlert = (id) => {
    dismissedAlertsRef.current.set(id, Date.now());
    setLocalAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleMarkerPress = (item) => {
    setSelectedMarker(item);
    setPopupWeather(null);
    setRouteCoords([]);
    setRouteInfo(null);
    setShowFunctionPanel(false);

    if (item.type === "building") {
      // Vẽ route từ vị trí người dùng đến tòa nhà (nếu có GPS)
      if (location) {
        fetchRoute(location.latitude, location.longitude, item.lat, item.lng);
      }
    } else if (item.coordinates?.lat && item.coordinates?.lng) {
      fetchPopupWeather(item.coordinates.lat, item.coordinates.lng);
    }
  };

  const handleZoomToCurrentLocation = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(
        { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 },
        1000
      );
    }
  };

  const vietnamRegion = { latitude: 16.0544, longitude: 108.2022, latitudeDelta: 10.0, longitudeDelta: 10.0 };

  return (
    <View style={{ flex: 1 }}>
      {/* ── Mini Weather Widget ── */}
      {miniWeather && (
        <TouchableOpacity style={miniStyles.widget} onPress={() => router.push("/(tab)/weather")} activeOpacity={0.85}>
          {miniWeather.icon && (
            <Image source={{ uri: `https://openweathermap.org/img/wn/${miniWeather.icon}@2x.png` }} style={miniStyles.icon} />
          )}
          <Text style={miniStyles.temp}>{miniWeather.temp}°C</Text>
          <View style={miniStyles.sep} />
          <Ionicons name="water-outline" size={13} color="rgba(255,255,255,0.85)" />
          <Text style={miniStyles.stat}>{miniWeather.humidity}%</Text>
          <View style={miniStyles.sep} />
          <Ionicons name="speedometer-outline" size={13} color="rgba(255,255,255,0.85)" />
          <Text style={miniStyles.stat}>{miniWeather.wind} km/h</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}

      {/* ── Search Input Box ── */}
      {searchMode && (
        <View style={searchStyles.inputBox}>
          <Ionicons name="search-outline" size={16} color="#9E9E9E" />
          <TextInput
            style={searchStyles.input}
            placeholder="Tìm địa chỉ tại Đà Nẵng..."
            placeholderTextColor="#B0BEC5"
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => searchAddress(searchQuery)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => { setSearchQuery(""); setSearchResults([]); setSearchPin(null); }}
              style={{ padding: 2 }}
            >
              <Ionicons name="close-circle" size={16} color="#BDBDBD" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={searchStyles.searchBtn}
            onPress={() => searchAddress(searchQuery)}
          >
            <Ionicons name="search" size={15} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Search Results Dropdown (sibling, không bị clip) ── */}
      {searchMode && searchResults.length > 0 && (
        <View style={searchStyles.dropdown}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 220 }}
          >
            {searchResults.map((item, idx) => (
              <TouchableOpacity
                key={item.place_id}
                style={[
                  searchStyles.resultItem,
                  idx === searchResults.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => selectPlace(item.place_id, item.description)}
              >
                <View style={searchStyles.resultIconWrap}>
                  <Ionicons name="location" size={14} color="#7B1FA2" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={searchStyles.resultMain} numberOfLines={1}>
                    {item.structured_formatting?.main_text || item.description.split(",")[0]}
                  </Text>
                  <Text style={searchStyles.resultSub} numberOfLines={1}>
                    {item.structured_formatting?.secondary_text || item.description.split(",").slice(1).join(",")}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── FAB: Nút chức năng (top-left) ── */}
      <View style={fabStyles.container}>
        <TouchableOpacity
          style={[fabStyles.mainBtn, showFunctionPanel && fabStyles.mainBtnActive]}
          onPress={() => { setShowFunctionPanel(!showFunctionPanel); setSelectedMarker(null); }}
        >
          <Ionicons name={showFunctionPanel ? "close" : "layers"} size={20} color="white" />
        </TouchableOpacity>

        {showFunctionPanel && (
          <View style={fabStyles.panel}>
            {/* Hiện trạng */}
            <TouchableOpacity
              style={[fabStyles.option, viewMode === "status" && fabStyles.optionStatus]}
              onPress={() => { setViewMode("status"); setShowFunctionPanel(false); }}
            >
              <Ionicons name="map-outline" size={15} color={viewMode === "status" ? "#fff" : "#37474F"} />
              <Text style={[fabStyles.optionText, viewMode === "status" && { color: "#fff" }]}>Hiện trạng</Text>
              {viewMode === "status" && <View style={fabStyles.activeDot} />}
            </TouchableOpacity>

            {/* Ngập gần đây */}
            <TouchableOpacity
              style={[fabStyles.option, viewMode === "flood" && fabStyles.optionFlood]}
              onPress={() => { setViewMode("flood"); handleZoomToCurrentLocation(); setShowFunctionPanel(false); }}
            >
              <Ionicons name="water-outline" size={15} color={viewMode === "flood" ? "#fff" : "#37474F"} />
              <Text style={[fabStyles.optionText, viewMode === "flood" && { color: "#fff" }]}>Ngập gần đây</Text>
              {viewMode === "flood" && <View style={fabStyles.activeDot} />}
            </TouchableOpacity>

            {/* Tìm kiếm địa chỉ */}
            <TouchableOpacity
              style={[fabStyles.option, searchMode && fabStyles.optionSearch]}
              onPress={() => { setSearchMode(!searchMode); setShowFunctionPanel(false); }}
            >
              <Ionicons name="search-outline" size={15} color={searchMode ? "#fff" : "#37474F"} />
              <Text style={[fabStyles.optionText, searchMode && { color: "#fff" }]}>Tìm địa chỉ</Text>
              {searchMode && <View style={fabStyles.activeDot} />}
            </TouchableOpacity>

            {/* Tòa nhà cao tầng */}
            <TouchableOpacity
              style={[fabStyles.option, showBuildings && fabStyles.optionBuilding]}
              onPress={toggleBuildings}
            >
              {loadingBuildings ? (
                <ActivityIndicator size="small" color={showBuildings ? "#fff" : "#5C6BC0"} />
              ) : (
                <Ionicons name="business-outline" size={15} color={showBuildings ? "#fff" : "#37474F"} />
              )}
              <Text style={[fabStyles.optionText, showBuildings && { color: "#fff" }]}>
                {"Tòa nhà cao"}
                {tallBuildings.length > 0 ? `  (${tallBuildings.length})` : ""}
              </Text>
              {showBuildings && <View style={fabStyles.activeDot} />}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Layer toggles top-right ── */}
      <View style={uiStyles.layerButtons}>
        <TouchableOpacity
          onPress={() => setShowReservoirs(!showReservoirs)}
          style={[uiStyles.layerBtn, { backgroundColor: showReservoirs ? "#009688" : "#ccc" }]}
        >
          <Ionicons name="water" size={20} color="white" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowRainStations(!showRainStations)}
          style={[uiStyles.layerBtn, { backgroundColor: showRainStations ? "#fb8c00" : "#ccc" }]}
        >
          <Ionicons name="rainy" size={20} color="white" />
        </TouchableOpacity>
      </View>

      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        customMapStyle={mapStyle}
        initialRegion={vietnamRegion}
        showsUserLocation={!!location}
        onPress={() => {
          setSelectedMarker(null);
          setPopupWeather(null);
          setRouteCoords([]);
          setRouteInfo(null);
          setShowFunctionPanel(false);
          setSearchResults([]);
        }}
      >
        {/* Flood radius circle */}
        {viewMode === "flood" && location && (
          <Circle
            center={{ latitude: location.latitude, longitude: location.longitude }}
            radius={800}
            strokeColor="rgba(33,150,243,0.8)"
            fillColor="rgba(33,150,243,0.2)"
          />
        )}

        {/* Buildings radius circle — dùng buildingCenter (không phụ thuộc GPS) */}
        {showBuildings && buildingCenter && (
          <Circle
            center={{ latitude: buildingCenter.latitude, longitude: buildingCenter.longitude }}
            radius={5000}
            strokeColor="rgba(92,107,192,0.6)"
            fillColor="rgba(92,107,192,0.06)"
            strokeWidth={2}
          />
        )}

        {/* Flood post markers */}
        {markers
          .filter((item) => {
            if (viewMode === "flood" && location)
              return getDistanceKm(location.latitude, location.longitude, item.coordinates.lat, item.coordinates.lng) <= 0.8;
            return true;
          })
          .map((item, idx) => (
            <Marker
              key={`post-${idx}`}
              coordinate={{ latitude: item.coordinates.lat, longitude: item.coordinates.lng }}
              onPress={(e) => { e.stopPropagation(); handleMarkerPress(item); }}
              tracksViewChanges={markerTracking}
            >
              <Ionicons name="information-circle" size={28} color="#f9a825" />
            </Marker>
          ))}

        {/* Reservoir markers */}
        {showReservoirs && reservoirs.map((item, idx) => (
          <Marker
            key={`res-${idx}`}
            coordinate={{ latitude: item.coordinates.lat, longitude: item.coordinates.lng }}
            onPress={(e) => { e.stopPropagation(); handleMarkerPress(item); }}
            tracksViewChanges={markerTracking}
          >
            <Ionicons name="water" size={30} color="#009688" />
          </Marker>
        ))}

        {/* Rain station markers */}
        {showRainStations && rainStations.map((item, idx) => (
          <Marker
            key={`rain-${idx}`}
            coordinate={{ latitude: item.coordinates.lat, longitude: item.coordinates.lng }}
            onPress={(e) => { e.stopPropagation(); handleMarkerPress(item); }}
            tracksViewChanges={markerTracking}
          >
            <Ionicons name="rainy" size={26} color="#fb8c00" />
          </Marker>
        ))}

        {/* Tall building markers */}
        {showBuildings && tallBuildings.map((b) => {
          const isHotel = b.buildingType === "hotel" || b.buildingType === "lodging";
          const iconName = isHotel ? "bed" : b.buildingType === "office" ? "briefcase" : "business";
          const iconColor = isHotel ? "#E91E63" : b.buildingType === "office" ? "#1976D2" : "#5C6BC0";
          const borderColor = isHotel ? "#E91E63" : b.buildingType === "office" ? "#1976D2" : "#5C6BC0";
          return (
            <Marker
              key={`bld-${b.id}`}
              coordinate={{ latitude: b.lat, longitude: b.lng }}
              onPress={(e) => { e.stopPropagation(); handleMarkerPress(b); }}
              tracksViewChanges={markerTracking}
            >
              <View style={[markerStyles.buildingWrapper, { borderColor }]}>
                <Ionicons name={iconName} size={24} color={iconColor} />
                {(b.levels || b.height) && (
                  <View style={[markerStyles.buildingBadge, { backgroundColor: borderColor }]}>
                    <Text style={markerStyles.buildingBadgeText}>
                      {b.levels ? `${b.levels}T` : b.height ? b.height : ""}
                    </Text>
                  </View>
                )}
              </View>
            </Marker>
          );
        })}

        {/* Search pin marker */}
        {searchPin && (
          <Marker
            coordinate={{ latitude: searchPin.lat, longitude: searchPin.lng }}
            tracksViewChanges={markerTracking}
          >
            <View style={markerStyles.pinWrapper}>
              <Ionicons name="location" size={34} color="#7B1FA2" />
            </View>
          </Marker>
        )}

        {/* Route polyline (hiển thị khi nhấn tòa nhà) */}
        {routeCoords.length > 1 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#1976D2"
            strokeWidth={4}
            geodesic={true}
          />
        )}
      </MapView>

      {/* ── Local Alert Banners (nằm trên popup nếu popup đang hiện) ── */}
      {localAlerts.length > 0 && (
        <View style={[alertStyles.stack, { bottom: selectedMarker ? 360 : 16 }]}>
          {localAlerts.map((a) => (
            <View key={a.id} style={[alertStyles.banner, { backgroundColor: a.bg, borderLeftColor: a.color }]}>
              <Ionicons name={a.icon} size={17} color={a.color} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[alertStyles.title, { color: a.color }]}>{a.title}</Text>
                <Text style={alertStyles.msg}>{a.message}</Text>
              </View>
              <TouchableOpacity onPress={() => dismissAlert(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={15} color={a.color} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* ── Info Popup ── */}
      {selectedMarker && (
        <View style={popupStyles.container}>
          <View style={popupStyles.header}>
            <Ionicons
              name={
                selectedMarker.type === "reservoir" ? "water" :
                selectedMarker.type === "rain"      ? "rainy" :
                selectedMarker.type === "building"  ? "business" :
                "document-text"
              }
              size={20}
              color={
                selectedMarker.type === "reservoir" ? "#0277BD" :
                selectedMarker.type === "rain"      ? "#FB8C00" :
                selectedMarker.type === "building"  ? "#5C6BC0" :
                "#F9A825"
              }
              style={{ marginRight: 8 }}
            />
            <Text style={popupStyles.title} numberOfLines={1}>
              {selectedMarker.name ||
                (selectedMarker.type === "building" ? "Tòa nhà cao tầng" : "Báo cáo")}
            </Text>
            <TouchableOpacity
              onPress={() => { setSelectedMarker(null); setPopupWeather(null); setRouteCoords([]); setRouteInfo(null); }}
              style={popupStyles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={22} color="#B0BEC5" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
            {selectedMarker.type === "reservoir" && (
              <ReservoirPopup item={selectedMarker} weather={popupWeather} loading={loadingPopup} />
            )}
            {selectedMarker.type === "rain" && (
              <RainStationPopup item={selectedMarker} weather={popupWeather} loading={loadingPopup} />
            )}
            {selectedMarker.type === "building" && (
              <BuildingPopup
                item={selectedMarker}
                userLocation={location}
                onNavigate={openDirections}
                routeInfo={routeInfo}
              />
            )}
            {selectedMarker.type === "post" && (
              <FloodPostPopup item={selectedMarker} />
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Zoom button ── */}
      <View style={mapStyles.zoomMap}>
        <TouchableOpacity onPress={handleZoomToCurrentLocation} style={mapStyles.zoomlocation}>
          <Image source={require("../../assets/images/navigation.png")} style={mapStyles.zoomIcon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Building Popup ─────────────────────────────────────────────────────────────
const BUILDING_TYPE_LABEL = {
  hotel:       { label: "Khách sạn",        icon: "bed",       color: "#E91E63" },
  lodging:     { label: "Khách sạn",        icon: "bed",       color: "#E91E63" },
  office:      { label: "Văn phòng",        icon: "briefcase", color: "#1976D2" },
  apartments:  { label: "Chung cư",         icon: "home",      color: "#7B1FA2" },
  commercial:  { label: "Thương mại",       icon: "storefront",color: "#E65100" },
};

function BuildingPopup({ item, userLocation, onNavigate, routeInfo }) {
  const dist = userLocation
    ? getDistanceKm(userLocation.latitude, userLocation.longitude, item.lat, item.lng)
    : null;
  const typeInfo = BUILDING_TYPE_LABEL[item.buildingType] ||
    { label: "Tòa nhà cao tầng", icon: "business", color: "#5C6BC0" };

  return (
    <View style={popupStyles.section}>
      {/* Loại công trình */}
      <View style={[bldStyles.typeBadge, { backgroundColor: typeInfo.color + "18", borderColor: typeInfo.color + "55" }]}>
        <Ionicons name={typeInfo.icon} size={14} color={typeInfo.color} />
        <Text style={[bldStyles.typeLabel, { color: typeInfo.color }]}>{typeInfo.label}</Text>
      </View>

      {/* Thông số tòa nhà */}
      <View style={bldStyles.infoGrid}>
        {item.levels && (
          <View style={bldStyles.infoBox}>
            <Ionicons name="layers-outline" size={18} color="#5C6BC0" />
            <Text style={bldStyles.infoValue}>{item.levels}</Text>
            <Text style={bldStyles.infoLabel}>tầng</Text>
          </View>
        )}
        {item.height && (
          <View style={bldStyles.infoBox}>
            <Ionicons name="trending-up-outline" size={18} color="#5C6BC0" />
            <Text style={bldStyles.infoValue}>{item.height}m</Text>
            <Text style={bldStyles.infoLabel}>chiều cao</Text>
          </View>
        )}
        {dist != null && (
          <View style={bldStyles.infoBox}>
            <Ionicons name="walk-outline" size={18} color="#5C6BC0" />
            <Text style={bldStyles.infoValue}>
              {dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
            </Text>
            <Text style={bldStyles.infoLabel}>đường thẳng</Text>
          </View>
        )}
        {!item.levels && !item.height && dist == null && (
          <View style={[bldStyles.infoBox, { flex: 3 }]}>
            <Ionicons name="business-outline" size={18} color="#5C6BC0" />
            <Text style={bldStyles.infoValue}>—</Text>
            <Text style={bldStyles.infoLabel}>Chưa có dữ liệu</Text>
          </View>
        )}
      </View>

      {/* Thông tin đường đi */}
      {routeInfo?.loading ? (
        <View style={bldStyles.routeLoading}>
          <ActivityIndicator size="small" color="#1976D2" />
          <Text style={{ fontSize: 12, color: "#1976D2", marginLeft: 8, fontWeight: "600" }}>
            Đang tính đường đi...
          </Text>
        </View>
      ) : routeInfo?.error ? (
        <View style={bldStyles.routeLoading}>
          <Ionicons name="warning-outline" size={14} color="#E65100" />
          <Text style={{ fontSize: 12, color: "#E65100", marginLeft: 6 }}>
            {routeInfo.error}
          </Text>
        </View>
      ) : routeInfo?.distance ? (
        <View style={bldStyles.routeCard}>
          <View style={bldStyles.routeItem}>
            <Ionicons name="car-outline" size={16} color="#1976D2" />
            <Text style={bldStyles.routeValue}>{routeInfo.distance}</Text>
            <Text style={bldStyles.routeLabel}>lái xe</Text>
          </View>
          <View style={bldStyles.routeDivider} />
          <View style={bldStyles.routeItem}>
            <Ionicons name="time-outline" size={16} color="#1976D2" />
            <Text style={bldStyles.routeValue}>{routeInfo.duration}</Text>
            <Text style={bldStyles.routeLabel}>thời gian</Text>
          </View>
        </View>
      ) : null}


      <View style={bldStyles.hint}>
        <Ionicons name="shield-checkmark-outline" size={14} color="#388E3C" />
        <Text style={bldStyles.hintText}>Nơi trú ẩn an toàn khi xảy ra ngập lụt</Text>
      </View>

      <TouchableOpacity
        style={[bldStyles.navBtn, { backgroundColor: typeInfo.color }]}
        onPress={() => onNavigate(item.lat, item.lng)}
        activeOpacity={0.8}
      >
        <Ionicons name="navigate" size={16} color="white" style={{ marginRight: 6 }} />
        <Text style={bldStyles.navBtnText}>Mở Google Maps chỉ đường</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Reservoir Popup ────────────────────────────────────────────────────────────
function ReservoirPopup({ item, weather, loading }) {
  const htl       = item.htl ?? null;
  const qvao      = item.qvao ?? null;
  const luuluongxa = item.luuluongxa ?? null;
  const rainLevel = item.sumDepth != null ? getRainLevelColor(item.sumDepth) : null;

  return (
    <View style={popupStyles.section}>
      <View style={popupStyles.hydroGrid}>
        <HydroBox icon="trending-up"       iconColor="#0277BD" label="Mực nước (HTL)"  value={htl != null        ? `${htl.toFixed(2)} m`        : "—"} highlight={htl != null} />
        <HydroBox icon="arrow-down-circle" iconColor="#26A69A" label="Lưu lượng đến"   value={qvao != null       ? `${qvao.toFixed(1)} m³/s`    : "—"} highlight={qvao != null} />
        <HydroBox icon="arrow-up-circle"   iconColor="#EF5350" label="Lưu lượng xả"    value={luuluongxa != null ? `${luuluongxa.toFixed(1)} m³/s` : "—"} highlight={luuluongxa != null} />
      </View>
      {rainLevel && (
        <View style={[popupStyles.rainBadgeRow, { backgroundColor: rainLevel.bg }]}>
          <Ionicons name="rainy" size={14} color={rainLevel.color} />
          <Text style={[popupStyles.rainBadgeText, { color: rainLevel.color }]}>
            {item.sumDepth > 0 ? `Mưa: ${item.sumDepth} mm/h` : "Hiện không có mưa"}
            {" · "}{rainLevel.label}
          </Text>
        </View>
      )}
      <WeatherInline weather={weather} loading={loading} />
      {item.lastUpdate && (
        <Text style={popupStyles.updateText}>🕐 Cập nhật: {new Date(item.lastUpdate).toLocaleString("vi-VN")}</Text>
      )}
    </View>
  );
}

// ── Rain Station Popup ─────────────────────────────────────────────────────────
function RainStationPopup({ item, weather, loading }) {
  const rainLevel = getRainLevelColor(item.sumDepth);
  return (
    <View style={popupStyles.section}>
      <View style={[popupStyles.rainHero, { backgroundColor: rainLevel.bg, borderColor: rainLevel.color }]}>
        <Ionicons name="rainy" size={28} color={rainLevel.color} />
        <View style={{ marginLeft: 12 }}>
          <Text style={[popupStyles.rainHeroValue, { color: rainLevel.color }]}>
            {item.sumDepth != null ? `${item.sumDepth} mm/h` : "0 mm/h"}
          </Text>
          <View style={[popupStyles.levelPill, { backgroundColor: rainLevel.color }]}>
            <Text style={popupStyles.levelPillText}>{rainLevel.label}</Text>
          </View>
        </View>
      </View>
      <View style={popupStyles.infoRow}>
        <Ionicons name="location-outline" size={14} color="#78909C" />
        <Text style={popupStyles.infoLabel}> Vị trí</Text>
        <Text style={popupStyles.infoValue} numberOfLines={1}>{item.address || item.name}</Text>
      </View>
      <WeatherInline weather={weather} loading={loading} />
      {item.lastUpdate && (
        <Text style={popupStyles.updateText}>🕐 Cập nhật: {new Date(item.lastUpdate).toLocaleString("vi-VN")}</Text>
      )}
    </View>
  );
}

// ── Weather Inline ─────────────────────────────────────────────────────────────
function WeatherInline({ weather, loading }) {
  if (loading) return (
    <View style={popupStyles.weatherRow}>
      <ActivityIndicator size="small" color={COLORS.primary} />
      <Text style={{ marginLeft: 8, fontSize: 12, color: "#90A4AE" }}>Đang tải thời tiết...</Text>
    </View>
  );
  if (!weather) return null;
  return (
    <View style={popupStyles.weatherCard}>
      <Image
        source={{ uri: `https://openweathermap.org/img/wn/${weather.icon}@2x.png` }}
        style={popupStyles.weatherIcon}
      />
      <View style={{ flex: 1 }}>
        <View style={popupStyles.weatherTopRow}>
          <Text style={popupStyles.weatherTemp}>{weather.temp}°C</Text>
          <Text style={popupStyles.weatherDesc}>{toVi(weather.desc)}</Text>
        </View>
        <View style={popupStyles.weatherStats}>
          <WeatherStat icon="water-outline"       value={`${weather.humidity}%`}         label="Độ ẩm" />
          <WeatherStat icon="speedometer-outline" value={`${weather.wind} km/h`}          label="Gió" />
          {weather.rainMm > 0 && <WeatherStat icon="rainy-outline" value={`${weather.rainMm.toFixed(1)}mm`} label="Mưa 1h" />}
        </View>
      </View>
    </View>
  );
}

function WeatherStat({ icon, value, label }) {
  return (
    <View style={popupStyles.wStat}>
      <Ionicons name={icon} size={12} color="#78909C" />
      <Text style={popupStyles.wStatVal}>{value}</Text>
      <Text style={popupStyles.wStatLabel}>{label}</Text>
    </View>
  );
}

function HydroBox({ icon, iconColor, label, value, highlight }) {
  return (
    <View style={[popupStyles.hydroBox, highlight && popupStyles.hydroBoxHighlight]}>
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text style={popupStyles.hydroValue}>{value}</Text>
      <Text style={popupStyles.hydroLabel}>{label}</Text>
    </View>
  );
}

// ── Flood Post Popup ───────────────────────────────────────────────────────────
function FloodPostPopup({ item }) {
  const imgs      = (Array.isArray(item.imageUrls) ? item.imageUrls : []).slice(0, 3);
  const userName  = item.user?.name || "Người dùng ẩn danh";
  const district  = item.location?.district || "";
  const address   = item.location?.address  || item.locationName || "Chưa xác định";
  const fullAddr  = district ? `${address}, ${district}` : address;
  const floodLevel = item.floodLevel;
  const areaType  = item.areaType ? (AREA_TYPE_LABEL[item.areaType] || item.areaType) : null;
  const floodTime = item.floodTime ? new Date(item.floodTime) : null;

  return (
    <View style={postStyles.root}>
      {/* ── Ảnh báo cáo ── */}
      {imgs.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={postStyles.imgScroll}
          contentContainerStyle={{ gap: 8 }}
          removeClippedSubviews
        >
          {imgs.map((url, i) => (
            <Image
              key={i}
              source={{ uri: cloudinaryThumb(url) }}
              style={postStyles.img}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      )}

      {/* ── Người báo cáo + thời gian ── */}
      <View style={postStyles.userRow}>
        <View style={postStyles.avatar}>
          <Ionicons name="person" size={13} color="#fff" />
        </View>
        <Text style={postStyles.userName} numberOfLines={1}>{userName}</Text>
        {item.createdAt && (
          <Text style={postStyles.timeAgo}>{timeAgo(item.createdAt)}</Text>
        )}
      </View>

      {/* ── Địa điểm ── */}
      <View style={postStyles.infoRow}>
        <Ionicons name="location" size={14} color="#E53935" />
        <Text style={postStyles.infoText} numberOfLines={2}>{fullAddr}</Text>
      </View>

      {/* ── Mức ngập + loại khu vực ── */}
      {(floodLevel || areaType) && (
        <View style={postStyles.badgeRow}>
          {!!floodLevel && (
            <View style={postStyles.floodBadge}>
              <Ionicons name="water" size={12} color="#0D47A1" />
              <Text style={postStyles.floodBadgeText}>Ngập {floodLevel} cm</Text>
            </View>
          )}
          {!!areaType && (
            <View style={postStyles.areaBadge}>
              <Text style={postStyles.areaBadgeText}>{areaType}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Mô tả ── */}
      {!!item.content && (
        <View style={postStyles.descBox}>
          <Text style={postStyles.descText}>{item.content}</Text>
        </View>
      )}

      {/* ── Khu vực thường xuyên ngập ── */}
      {item.isFrequentFlood && (
        <View style={postStyles.frequentBadge}>
          <Ionicons name="warning" size={13} color="#E65100" />
          <Text style={postStyles.frequentText}>Khu vực này thường xuyên bị ngập</Text>
        </View>
      )}

      {/* ── Thời điểm xảy ra ── */}
      {floodTime && (
        <Text style={postStyles.floodTime}>
          🕐 Xảy ra lúc: {floodTime.toLocaleString("vi-VN")}
        </Text>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const miniStyles = StyleSheet.create({
  widget: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000,
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(1,87,155,0.9)",
    paddingHorizontal: 12, paddingVertical: 6, gap: 6,
  },
  icon: { width: 28, height: 28 },
  temp: { color: "#fff", fontSize: 15, fontWeight: "800" },
  stat: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "600" },
  sep: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.3)", marginHorizontal: 2 },
});

const fabStyles = StyleSheet.create({
  container: {
    position: "absolute", top: 44, left: 10, zIndex: 999,
  },
  mainBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "#1976d2",
    alignItems: "center", justifyContent: "center",
    elevation: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  mainBtnActive: { backgroundColor: "#455A64" },
  panel: {
    marginTop: 6, backgroundColor: "white",
    borderRadius: 14, padding: 6, gap: 4,
    elevation: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
    minWidth: 168,
  },
  option: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, backgroundColor: "#F5F5F5",
  },
  optionText: { fontSize: 13, fontWeight: "600", color: "#37474F", flex: 1 },
  optionStatus:   { backgroundColor: "#1976d2" },
  optionFlood:    { backgroundColor: "#388e3c" },
  optionSearch:   { backgroundColor: "#7B1FA2" },
  optionBuilding: { backgroundColor: "#5C6BC0" },
  activeDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.7)",
  },
});

const searchStyles = StyleSheet.create({
  // Input box — không có overflow hidden để dropdown không bị clip
  inputBox: {
    position: "absolute", top: 44, left: 62, right: 62,
    zIndex: 1001,
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "white",
    borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    elevation: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6,
  },
  input: { flex: 1, fontSize: 13, color: "#263238", paddingVertical: 2 },
  searchBtn: {
    backgroundColor: "#7B1FA2",
    borderRadius: 8, padding: 7,
    alignItems: "center", justifyContent: "center",
  },
  // Dropdown — element riêng, không bị clip bởi inputBox
  dropdown: {
    position: "absolute", top: 92, left: 62, right: 62,
    zIndex: 1000,
    backgroundColor: "white",
    borderRadius: 12,
    elevation: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
    overflow: "hidden",
  },
  resultItem: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: "#F5F5F5", gap: 10,
  },
  resultIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#F3E5F5",
    alignItems: "center", justifyContent: "center",
  },
  resultMain: { fontSize: 13, fontWeight: "600", color: "#212121" },
  resultSub:  { fontSize: 11, color: "#9E9E9E", marginTop: 1 },
  // kept for backwards compat
  resultText: { flex: 1, fontSize: 12, color: "#455A64" },
});

const uiStyles = StyleSheet.create({
  layerButtons: { position: "absolute", top: 44, right: 10, zIndex: 999, gap: 6 },
  layerBtn: { padding: 10, borderRadius: 10, elevation: 2 },
});

const markerStyles = StyleSheet.create({
  buildingWrapper: {
    backgroundColor: "white", borderRadius: 10, padding: 5,
    borderWidth: 2, borderColor: "#5C6BC0", elevation: 4,
    alignItems: "center",
    shadowColor: "#5C6BC0", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  buildingBadge: {
    position: "absolute", bottom: -6, right: -6,
    backgroundColor: "#5C6BC0", borderRadius: 6,
    paddingHorizontal: 4, paddingVertical: 1,
    borderWidth: 1, borderColor: "white",
  },
  buildingBadgeText: { color: "white", fontSize: 9, fontWeight: "800" },
  pinWrapper: { alignItems: "center" },
});

const popupStyles = StyleSheet.create({
  container: {
    position: "absolute", bottom: 16, left: 10, right: 10,
    backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14,
    elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
  },
  header:   { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  title:    { flex: 1, fontSize: 16, fontWeight: "800", color: "#1A237E" },
  closeBtn: { padding: 2 },
  section:  { gap: 8 },

  hydroGrid: { flexDirection: "row", gap: 8, marginBottom: 4 },
  hydroBox: {
    flex: 1, alignItems: "center", backgroundColor: "#F5F7FA",
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 4,
    borderWidth: 1, borderColor: "#E8EAF6",
  },
  hydroBoxHighlight: { backgroundColor: "#E3F2FD", borderColor: "#90CAF9" },
  hydroValue: { fontSize: 14, fontWeight: "800", color: "#1A237E", marginTop: 4, textAlign: "center" },
  hydroLabel: { fontSize: 9, color: "#78909C", marginTop: 2, textAlign: "center" },

  rainBadgeRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  rainBadgeText: { fontSize: 12, fontWeight: "600" },

  rainHero: {
    flexDirection: "row", alignItems: "center",
    padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 4,
  },
  rainHeroValue: { fontSize: 22, fontWeight: "800" },
  levelPill: {
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
    marginTop: 4, alignSelf: "flex-start",
  },
  levelPillText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  weatherCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#E3F2FD", borderRadius: 12, padding: 8, gap: 4,
  },
  weatherIcon:    { width: 48, height: 48 },
  weatherTopRow:  { flexDirection: "row", alignItems: "baseline", gap: 6 },
  weatherTemp:    { fontSize: 20, fontWeight: "800", color: "#0D47A1" },
  weatherDesc:    { fontSize: 12, color: "#1565C0", fontWeight: "600" },
  weatherStats:   { flexDirection: "row", gap: 10, marginTop: 4 },
  weatherRow:     { flexDirection: "row", alignItems: "center", padding: 8 },
  wStat:          { alignItems: "center" },
  wStatVal:       { fontSize: 12, fontWeight: "700", color: "#263238" },
  wStatLabel:     { fontSize: 9, color: "#90A4AE" },

  infoRow:   { flexDirection: "row", alignItems: "center", gap: 2 },
  infoLabel: { fontSize: 12, color: "#78909C" },
  infoValue: { flex: 1, fontSize: 12, color: "#37474F", fontWeight: "600", textAlign: "right" },
  descBox:   { backgroundColor: "#F5F5F5", borderRadius: 8, padding: 8 },
  descText:  { fontSize: 13, color: "#455A64" },
  updateText:{ fontSize: 10, color: "#B0BEC5", textAlign: "right" },
});

const bldStyles = StyleSheet.create({
  typeBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8,
    alignSelf: "flex-start",
  },
  typeLabel: { fontSize: 12, fontWeight: "700" },
  infoGrid: { flexDirection: "row", gap: 8, marginBottom: 8 },
  infoBox: {
    flex: 1, alignItems: "center", backgroundColor: "#EDE7F6",
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 4,
    borderWidth: 1, borderColor: "#D1C4E9",
  },
  infoValue: { fontSize: 15, fontWeight: "800", color: "#4527A0", marginTop: 4, textAlign: "center" },
  infoLabel: { fontSize: 10, color: "#7E57C2", marginTop: 1, textAlign: "center" },
  hint: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#E8F5E9", borderRadius: 8, padding: 8, marginBottom: 8,
  },
  hintText: { fontSize: 12, color: "#2E7D32", flex: 1 },
  routeCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#E3F2FD", borderRadius: 10, padding: 10, marginBottom: 8,
  },
  routeItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  routeValue: { fontSize: 14, fontWeight: "800", color: "#0D47A1" },
  routeLabel: { fontSize: 10, color: "#1565C0" },
  routeDivider: { width: 1, height: 28, backgroundColor: "#90CAF9", marginHorizontal: 8 },
  routeLoading: { flexDirection: "row", alignItems: "center", marginBottom: 8, paddingVertical: 4 },
  navBtn: {
    borderRadius: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 12,
  },
  navBtnText: { color: "white", fontSize: 14, fontWeight: "700" },
});

// ── Alert Banner Styles ────────────────────────────────────────────────────────
const alertStyles = StyleSheet.create({
  stack: {
    position: "absolute", bottom: 16, left: 10, right: 10,
    zIndex: 1000,
    gap: 6,
    // Nếu có popup thì banner nằm trên popup
  },
  banner: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, borderLeftWidth: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    elevation: 5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  title: { fontSize: 13, fontWeight: "800", marginBottom: 2 },
  msg:   { fontSize: 11, color: "#546E7A", lineHeight: 16 },
});

const postStyles = StyleSheet.create({
  root: { gap: 8 },

  // Ảnh
  imgScroll: { marginBottom: 4 },
  img: {
    width: 140, height: 100, borderRadius: 10,
    backgroundColor: "#ECEFF1",
  },

  // Người báo cáo
  userRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#1976D2",
    alignItems: "center", justifyContent: "center",
  },
  userName: { flex: 1, fontSize: 13, fontWeight: "700", color: "#1A237E" },
  timeAgo:  { fontSize: 11, color: "#90A4AE" },

  // Địa điểm
  infoRow:  { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  infoText: { flex: 1, fontSize: 12, color: "#37474F", lineHeight: 18 },

  // Badges
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  floodBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#E3F2FD", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "#90CAF9",
  },
  floodBadgeText: { fontSize: 12, fontWeight: "700", color: "#0D47A1" },
  areaBadge: {
    backgroundColor: "#FFF3E0", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "#FFCC80",
  },
  areaBadgeText: { fontSize: 12, fontWeight: "600", color: "#E65100" },

  // Mô tả
  descBox: { backgroundColor: "#F5F5F5", borderRadius: 8, padding: 10 },
  descText: { fontSize: 13, color: "#455A64", lineHeight: 19 },

  // Thường xuyên ngập
  frequentBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FFF3E0", borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: "#FFB74D",
  },
  frequentText: { fontSize: 12, color: "#BF360C", fontWeight: "600", flex: 1 },

  // Thời điểm
  floodTime: { fontSize: 10, color: "#B0BEC5", textAlign: "right" },
});
