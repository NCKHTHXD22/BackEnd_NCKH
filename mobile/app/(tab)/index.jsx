import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Image,
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
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [weatherDaily, setWeatherDaily] = useState([]);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState("status"); // "status" hoặc "flood"
  const mapRef = React.useRef(null);
  const mapStyle = [
    {
      featureType: "poi.business",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.attraction",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.medical",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.school",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.place_of_worship",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "transit.station",
      stylers: [{ visibility: "off" }]
    }
  ];


  const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    let subscription;

    const startWatching = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.warn("❌ Quyền truy cập vị trí bị từ chối");
          return;
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (loc) => {
            setLocation(loc.coords);
          }
        );
      } catch (err) {
        console.error("❌ Lỗi lấy vị trí GPS:", err);
      }
    };

    startWatching();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);


  useEffect(() => {
    const fetchData = async () => {
      try {
        const [alertsRes, postsRes] = await Promise.all([
          fetch(`${API_URL}/api/alerts`),
          fetch(`${API_URL}/api/posts`),
        ]);

        const alertsData = await alertsRes.json();
        const postsData = await postsRes.json();

        const alerts = alertsData.map((item) => ({
          ...item,
          type: "alert",
          coordinates: item.coordinates || {
            lat: item.location?.latitude,
            lng: item.location?.longitude,
          },
        }));

        const groupedPosts = {};
        for (let post of postsData) {
          const lat = post.location?.latitude;
          const lng = post.location?.longitude;
          if (lat == null || lng == null) continue;
          const key = `${lat},${lng}`;
          if (
            !groupedPosts[key] ||
            new Date(post.createdAt) > new Date(groupedPosts[key].createdAt)
          ) {
            groupedPosts[key] = post;
          }
        }

        const posts = Object.values(groupedPosts).map((item) => ({
          ...item,
          type: "post",
          coordinates: {
            lat: item.location.latitude,
            lng: item.location.longitude,
          },
          content: item.description,
          imageUrls: item.imageUrls || [item.imageUrl],
          locationName: item.location?.address,
        }));

        setMarkers([...alerts, ...posts]);
      } catch (err) {
        console.log("Lỗi lấy dữ liệu:", err);
      }
    };

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
      const dailyArr = Object.entries(dailyMap)
        .slice(0, 5)
        .map(([date, items]) => {
          const temps = items.map((i) => i.main.temp);
          const min = Math.round(Math.min(...temps));
          const max = Math.round(Math.max(...temps));
          const icon = items[0].weather[0].icon;
          return { date, items, min, max, icon };
        });
      setWeatherDaily(dailyArr);
      setSelectedDayIndex(0);
    } catch (err) {
      console.log("Lỗi dự báo:", err);
    }
    setLoadingWeather(false);
  };

  const handleMarkerPress = (item) => {
    setSelectedMarker(item);
    if (item.type === "alert") {
      fetchForecast(item.coordinates.lat, item.coordinates.lng);
    }
  };

  const formatDay = (dateStr) => {
    const d = new Date(dateStr);
    const map = ["CN", "Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7"];
    return map[d.getDay()];
  };
  const getFloodStatus = (waterLevel) => {
    if (waterLevel > 10) {
      return {
        icon: "🛑",
        color: "#b71c1c",
        status: "🚨 Ngập nghiêm trọng",
      };
    } else if (waterLevel > 5) {
      return {
        icon: "🚨",
        color: "#d32f2f",
        status: "⚠️ Có thể ngập",
      };
    } else {
      return {
        icon: "💧",
        color: "#2196f3",
        status: "☁️ Mực nước an toàn",
      };
    }
  };

  const handleZoomToCurrentLocation = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        1000
      );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Chức năng góc trên trái */}
      <View style={{ position: "absolute", top: 40, left: 10, zIndex: 999 }}>
        <TouchableOpacity
          onPress={() => setViewMode("status")}
          style={{
            backgroundColor: viewMode === "status" ? "#1976d2" : "#ccc",
            padding: 8,
            borderRadius: 8,
            marginBottom: 6,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Hiện trạng</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setViewMode("flood");
            handleZoomToCurrentLocation();
          }}

          style={{
            backgroundColor: viewMode === "flood" ? "#388e3c" : "#ccc",
            padding: 8,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Ngập gần đây</Text>
        </TouchableOpacity>
      </View>

      {/* Bản đồ và Marker */}
      {location && (
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={{ flex: 1 }}
          customMapStyle={mapStyle}
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation
          onPress={() => setSelectedMarker(null)}
        >
          {/* Vòng tròn bán kính 800 */}
          {viewMode === "flood" && (
            <Circle
              center={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              radius={800}
              strokeColor="rgba(33, 150, 243, 0.8)"
              fillColor="rgba(33, 150, 243, 0.2)"
            />
          )}

          {/* Marker */}
          {markers
            .filter((item) => {
              if (item.type === "post") {
                if (!item.createdAt) return false;

                const createdAt = new Date(item.createdAt);
                const now = new Date();
                const diffMs = now - createdAt;
                const diffHours = diffMs / (1000 * 60 * 60);

                if (diffHours > 24) return false; //  bỏ bài đăng cũ hơn 1 ngày

                if (viewMode === "flood" && location) {
                  const dist = getDistanceKm(
                    location.latitude,
                    location.longitude,
                    item.coordinates.lat,
                    item.coordinates.lng
                  );
                  return dist <= 0.8;
                }

                return viewMode === "status"; //  hiện trong chế độ "status"
              }

              // Với cảm biến (type === "alert") => luôn hiển thị trong mọi chế độ
              return viewMode === "status" || viewMode === "flood";
            })
            .map((item, idx) => (
              <Marker
                key={`${item.type}-${idx}`}
                coordinate={{
                  latitude: item.coordinates.lat,
                  longitude: item.coordinates.lng,
                }}
                onPress={(e) => {
                  e.stopPropagation();
                  handleMarkerPress(item);
                }}
              >
                {item.type === "alert" ? (
                  <Ionicons
                    name={
                      item.data?.waterLevel > 100
                        ? "warning-outline"
                        : "cloud-outline"
                    }
                    size={28}
                    color={item.data?.waterLevel > 100 ? "red" : "blue"}
                  />
                ) : (
                  <Ionicons
                    name="information-circle"
                    size={28}
                    color="#f9a825"
                  />
                )}
              </Marker>
            ))}
        </MapView>
      )}

      {/* Hộp thông tin khi chọn Marker */}
      {selectedMarker && (
        <View style={styles.infoBox}>
          {selectedMarker.type === "alert" ? (
            <>
              {/* Lấy dữ liệu trạng thái mực nước */}
              {(() => {
                const waterLevel = selectedMarker.data?.waterLevel ?? null;
                const { icon, color, status } = getFloodStatus(waterLevel);

                return (
                  <>
                    <Text style={[styles.levelText, { fontSize: 18, color }]}>
                      {icon} Mực nước: {waterLevel !== null ? `${waterLevel} cm` : "N/A"}
                    </Text>

                    <Text style={[styles.statusText, { fontSize: 16, color }]}>
                      {status}
                    </Text>
                  </>
                );
              })()}

              <Text style={styles.detailText}>
                🌡️ Nhiệt độ:{" "}
                <Text style={{ fontWeight: "bold" }}>
                  {selectedMarker.data?.temperature ?? "?"}°C
                </Text>
              </Text>
              <Text style={styles.detailText}>
                💧 Độ ẩm:{" "}
                <Text style={{ fontWeight: "bold" }}>
                  {selectedMarker.data?.humidity ?? "?"}%
                </Text>
              </Text>
              <Text style={styles.detailText}>
                🌧️ Có mưa:{" "}
                <Text style={{ fontWeight: "bold" }}>
                  {selectedMarker.data?.isRaining ? "Mưa" : "Không mưa"}
                </Text>
              </Text>
              <Text style={styles.detailText}>
                📍 Vị trí:{" "}
                <Text style={{ fontWeight: "bold" }}>
                  {selectedMarker.locationName || "Chưa xác định"}
                </Text>
              </Text>

              <TouchableOpacity
                onPress={() => {
                  // Since we are using expo-router, we can use router.push or rely on the tab switch
                  // For simplicity and matching existing patterns, we'll suggest switching to the tab
                  // But better yet, if we have the stationId, we could pass it.
                  // For now, let's just add a beautiful button.
                  Alert.alert("Chuyển đến Dự báo", "Bạn có muốn xem chi tiết dự báo AI cho trạm này?", [
                    { text: "Hủy", style: "cancel" },
                    { text: "Xem", onPress: () => { /* Navigation handled by user or we can use router */ } }
                  ]);
                }}
                style={{
                  backgroundColor: "#1976d2",
                  padding: 10,
                  borderRadius: 8,
                  marginTop: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "bold" }}>📊 Xem dự báo AI (LSTM/HEC)</Text>
              </TouchableOpacity>

              {loadingWeather ? (
                <View
                  style={{
                    alignItems: "center",
                    paddingVertical: 20,
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <ActivityIndicator size="small" color="#1976d2" style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 16, color: "#1976d2" }}>
                    Đang tải dự báo thời tiết...
                  </Text>
                </View>
              ) : (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabs}>
                    {weatherDaily.map((day, i) => (
                      <TouchableOpacity key={i} onPress={() => setSelectedDayIndex(i)}>
                        <LinearGradient
                          colors={
                            selectedDayIndex === i
                              ? ["#42a5f5", "#1e88e5"]
                              : ["#ddd", "#bbb"]
                          }
                          style={[styles.dayTab, selectedDayIndex === i && styles.dayTabActive]}
                        >
                          <Text style={styles.dayText}>{formatDay(day.date)}</Text>
                          <Text style={styles.minMaxText}>
                            {day.max}°/{day.min}°
                          </Text>
                          <Image
                            source={{ uri: `https://openweathermap.org/img/wn/${day.icon}@2x.png` }}
                            style={{ width: 40, height: 40 }}
                          />
                        </LinearGradient>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourTabs}>
                    {weatherDaily[selectedDayIndex]?.items.map((hourItem, j) => (
                      <View style={styles.hourItem} key={j}>
                        <Text style={styles.hourText}>
                          {hourItem.dt_txt.split(" ")[1].slice(0, 5)}
                        </Text>
                        <Image
                          source={{
                            uri: `https://openweathermap.org/img/wn/${hourItem.weather[0].icon}@2x.png`,
                          }}
                          style={{ width: 40, height: 40 }}
                        />
                        <Text style={styles.hourTemp}>
                          {Math.round(hourItem.main.temp)}°
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={{ fontWeight: "bold", fontSize: 16 }}>
                📝 Báo cáo từ người dân
              </Text>
              <Text style={styles.detailText}>
                📍 Vị trí:{" "}
                <Text style={{ fontWeight: "bold" }}>
                  {selectedMarker.locationName || "Chưa xác định"}
                </Text>
              </Text>
              <Text style={styles.detailText}>
                🕒 Thời gian:{" "}
                <Text style={{ fontWeight: "bold" }}>
                  {new Date(selectedMarker.createdAt).toLocaleString()}
                </Text>
              </Text>
              <Text style={styles.detailText}>
                📝 Nội dung:{" "}
                <Text style={{ fontWeight: "bold" }}>
                  {selectedMarker.content || "(Không có nội dung)"}
                </Text>
              </Text>

              {selectedMarker.imageUrls && selectedMarker.imageUrls.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 10 }}
                >
                  {selectedMarker.imageUrls.map((url, idx) => (
                    <Image
                      key={idx}
                      source={{ uri: url }}
                      style={{
                        width: width * 0.8,
                        height: 200,
                        marginRight: 12,
                        borderRadius: 10,
                      }}
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
              )}

            </>
          )}
        </View>
      )}
      {/*Nút zoom */}
      <View style={styles.zoomMap}>
        <TouchableOpacity
          onPress={handleZoomToCurrentLocation}
          style={styles.zoomlocation}
        >
          <Image source={require("../../assets/images/navigation.png")}
            style={styles.zoomIcon}
          ></Image>
        </TouchableOpacity>

      </View>
    </View>
  );
}
