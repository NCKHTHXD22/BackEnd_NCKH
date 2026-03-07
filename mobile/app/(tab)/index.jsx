import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Circle } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";
import styles from "../../assets/styles/home.styles.js";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { API_URL } from "@/lib/env";

const { width } = Dimensions.get("window");

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [rainStations, setRainStations] = useState([]);
  const [reservoirs, setReservoirs] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [weatherDaily, setWeatherDaily] = useState([]);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState("status"); // "status" hoặc "flood"
  const [showReservoirs, setShowReservoirs] = useState(true);
  const [showRainStations, setShowRainStations] = useState(true);

  const mapRef = React.useRef(null);
  const mapStyle = [
    { featureType: "poi.business", stylers: [{ visibility: "off" }] },
    { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
    { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
    { featureType: "poi.school", stylers: [{ visibility: "off" }] },
    { featureType: "poi.place_of_worship", stylers: [{ visibility: "off" }] },
    { featureType: "transit.station", stylers: [{ visibility: "off" }] }
  ];

  const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    let subscription;
    const startWatching = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
          (loc) => setLocation(loc.coords)
        );
      } catch (err) { console.error("❌ Lỗi lấy vị trí GPS:", err); }
    };
    startWatching();
    return () => subscription?.remove();
  }, []);

  const fetchData = async () => {
    try {
      const [postRes, rainRes, reservoirRes] = await Promise.all([
        fetch(`${API_URL}/api/posts`, { headers: { 'Accept': 'application/json' } }),
        fetch(`${API_URL}/api/rain-station`, { headers: { 'Accept': 'application/json' } }),
        fetch(`${API_URL}/api/inflowLake`, { headers: { 'Accept': 'application/json' } }),
      ]);

      const safeJson = async (res, name) => {
        const text = await res.text();
        try { return JSON.parse(text); }
        catch (e) { throw new Error(`Lỗi parse JSON cho ${name}`); }
      };

      const postsData = await safeJson(postRes, "posts");
      const rainData = await safeJson(rainRes, "rain");
      const reservoirData = await safeJson(reservoirRes, "reservoir");

      const mappedPosts = (postsData || []).map(p => ({
        ...p,
        type: 'post',
        coordinates: { lat: p.location?.latitude || 0, lng: p.location?.longitude || 0 },
        locationName: p.location?.address || "Chưa xác định",
        content: p.description || ""
      }));
      setMarkers(mappedPosts);

      const mappedRain = (rainData || []).map(r => ({
        ...r,
        type: 'rain',
        coordinates: { lat: r.location?.lat || 0, lng: r.location?.lng || 0 }
      }));
      setRainStations(mappedRain);

      const mappedReservoirs = (reservoirData || []).map(r => ({
        ...r,
        type: 'reservoir',
        // Backend inflowLake trả về lat/lon trực tiếp hoặc trong location
        coordinates: { lat: r.lat || r.location?.lat || 0, lng: r.lon || r.location?.lng || 0 }
      }));
      setReservoirs(mappedReservoirs);

    } catch (error) {
      console.error("❌ Lỗi fetch dữ liệu Map:", error);
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 60000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchForecast = async (lat, lng) => {
    setLoadingWeather(true);
    try {
      const res = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=c41fa113b3691968f275c36bcadebe29`
      );
      const dailyMap = {};
      res.data.list.forEach((item) => {
        const date = item.dt_txt.split(" ")[0];
        if (!dailyMap[date]) dailyMap[date] = [];
        dailyMap[date].push(item);
      });
      const dailyArr = Object.entries(dailyMap).slice(0, 5).map(([date, items]) => {
        const temps = items.map((i) => i.main.temp);
        return { date, items, min: Math.round(Math.min(...temps)), max: Math.round(Math.max(...temps)), icon: items[0].weather[0].icon };
      });
      setWeatherDaily(dailyArr);
      setSelectedDayIndex(0);
    } catch (err) { console.log("Lỗi dự báo:", err); }
    setLoadingWeather(false);
  };

  const handleMarkerPress = (item) => {
    setSelectedMarker(item);
    if (item.type === "reservoir" || item.type === "rain") {
      fetchForecast(item.coordinates.lat, item.coordinates.lng);
    }
  };

  const handleZoomToCurrentLocation = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }, 1000);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: "absolute", top: 40, left: 10, zIndex: 999 }}>
        <TouchableOpacity
          onPress={() => setViewMode("status")}
          style={{ backgroundColor: viewMode === "status" ? "#1976d2" : "#ccc", padding: 8, borderRadius: 8, marginBottom: 6 }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Hiện trạng</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setViewMode("flood"); handleZoomToCurrentLocation(); }}
          style={{ backgroundColor: viewMode === "flood" ? "#388e3c" : "#ccc", padding: 8, borderRadius: 8 }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Ngập gần đây</Text>
        </TouchableOpacity>
      </View>

      <View style={{ position: "absolute", top: 40, right: 10, zIndex: 999 }}>
        <TouchableOpacity onPress={() => setShowReservoirs(!showReservoirs)} style={{ backgroundColor: showReservoirs ? "#009688" : "#ccc", padding: 8, borderRadius: 8, marginBottom: 6 }}>
          <Ionicons name="water" size={20} color="white" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowRainStations(!showRainStations)} style={{ backgroundColor: showRainStations ? "#fb8c00" : "#ccc", padding: 8, borderRadius: 8 }}>
          <Ionicons name="rainy" size={20} color="white" />
        </TouchableOpacity>
      </View>

      {location && (
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={{ flex: 1 }}
          customMapStyle={mapStyle}
          initialRegion={{ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
          showsUserLocation
          onPress={() => setSelectedMarker(null)}
        >
          {viewMode === "flood" && (
            <Circle center={{ latitude: location.latitude, longitude: location.longitude }} radius={800} strokeColor="rgba(33, 150, 243, 0.8)" fillColor="rgba(33, 150, 243, 0.2)" />
          )}

          {markers.filter(item => {
            if (viewMode === "flood" && location) {
              return getDistanceKm(location.latitude, location.longitude, item.coordinates.lat, item.coordinates.lng) <= 0.8;
            }
            return true;
          }).map((item, idx) => (
            <Marker key={`post-${idx}`} coordinate={{ latitude: item.coordinates.lat, longitude: item.coordinates.lng }} onPress={(e) => { e.stopPropagation(); handleMarkerPress(item); }}>
              <Ionicons name="information-circle" size={28} color="#f9a825" />
            </Marker>
          ))}

          {showReservoirs && reservoirs.map((item, idx) => (
            <Marker key={`res-${idx}`} coordinate={{ latitude: item.coordinates.lat, longitude: item.coordinates.lng }} onPress={(e) => { e.stopPropagation(); handleMarkerPress(item); }}>
              <Ionicons name="water" size={30} color="#009688" />
            </Marker>
          ))}

          {showRainStations && rainStations.map((item, idx) => (
            <Marker key={`rain-${idx}`} coordinate={{ latitude: item.coordinates.lat, longitude: item.coordinates.lng }} onPress={(e) => { e.stopPropagation(); handleMarkerPress(item); }}>
              <Ionicons name="rainy" size={26} color="#fb8c00" />
            </Marker>
          ))}
        </MapView>
      )}

      {selectedMarker && (
        <View style={styles.infoBox}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: COLORS.primary, marginBottom: 5 }}>
            {selectedMarker.type === 'reservoir' ? '🌊 ' + selectedMarker.name :
              selectedMarker.type === 'rain' ? '🌧️ ' + selectedMarker.name : '📝 Báo cáo'}
          </Text>

          <Text style={styles.detailText}>📍 Vị trí: <Text style={{ fontWeight: "bold" }}>{selectedMarker.locationName || selectedMarker.name || "Chưa xác định"}</Text></Text>

          {selectedMarker.type === 'post' && (
            <Text style={styles.detailText}>📝 Nội dung: <Text style={{ fontWeight: "bold" }}>{selectedMarker.content}</Text></Text>
          )}

          {loadingWeather ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabs}>
              {weatherDaily.map((day, i) => (
                <TouchableOpacity key={i} onPress={() => setSelectedDayIndex(i)} style={[styles.dayTab, selectedDayIndex === i && styles.dayTabActive]}>
                  <Text style={styles.dayText}>{day.date.split('-').slice(1).reverse().join('/')}</Text>
                  <Text style={styles.minMaxText}>{day.max}°/{day.min}°</Text>
                  <Image source={{ uri: `https://openweathermap.org/img/wn/${day.icon}@2x.png` }} style={{ width: 30, height: 30 }} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <View style={styles.zoomMap}>
        <TouchableOpacity onPress={handleZoomToCurrentLocation} style={styles.zoomlocation}>
          <Image source={require("../../assets/images/navigation.png")} style={styles.zoomIcon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
