// components/WeatherAlertBanner.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { API_URL } from "@/lib/env";
import { useRouter } from "expo-router";

const LEVEL_CONFIG = {
  danger: {
    bg: "#FFCDD2",
    border: "#EF5350",
    icon: "warning",
    iconColor: "#C62828",
    label: "KHẨN CẤP",
    labelColor: "#C62828",
  },
  warning: {
    bg: "#FFE0B2",
    border: "#FB8C00",
    icon: "alert-circle",
    iconColor: "#E65100",
    label: "CẢNH BÁO",
    labelColor: "#E65100",
  },
  info: {
    bg: "#FFF9C4",
    border: "#F9A825",
    icon: "information-circle",
    iconColor: "#F57F17",
    label: "THEO DÕI",
    labelColor: "#F57F17",
  },
};

export default function WeatherAlertBanner() {
  const [alerts, setAlerts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(new Set());
  const [slideAnim] = useState(new Animated.Value(0));
  const router = useRouter();

  const fetchAlerts = useCallback(async () => {
    try {
      const [floodRes, alertRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/flood-warning`),
        axios.get(`${API_URL}/api/alerts`),
      ]);

      const combined = [];

      if (floodRes.status === "fulfilled" && Array.isArray(floodRes.value?.data)) {
        floodRes.value.data.forEach((w) => {
          combined.push({
            id: `fw_${w._id}`,
            message: w.description || w.message || "Cảnh báo ngập lụt",
            level: w.level || "warning",
            source: "flood",
          });
        });
      }

      if (alertRes.status === "fulfilled" && Array.isArray(alertRes.value?.data)) {
        alertRes.value.data.forEach((a) => {
          if (a.data?.isSevere) {
            combined.push({
              id: `al_${a._id}`,
              message: a.data?.description || `${a.locationName}: Mực nước cao`,
              level: "danger",
              source: "sensor",
            });
          }
        });
      }

      const visible = combined.filter((a) => !dismissed.has(a.id));
      setAlerts(visible);
    } catch {
      // Silently ignore fetch errors — banner is optional
    }
  }, [dismissed]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000); // 5 phút
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  useEffect(() => {
    if (alerts.length <= 1) return;
    const rotate = setInterval(() => {
      Animated.sequence([
        Animated.timing(slideAnim, { toValue: -30, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      setCurrentIndex((prev) => (prev + 1) % alerts.length);
    }, 6000);
    return () => clearInterval(rotate);
  }, [alerts.length, slideAnim]);

  const handleDismiss = () => {
    const id = alerts[currentIndex]?.id;
    if (!id) return;
    setDismissed((prev) => new Set([...prev, id]));
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setCurrentIndex(0);
  };

  const handlePress = () => router.push("/(tab)/notification");

  if (alerts.length === 0) return null;

  const current = alerts[currentIndex] || alerts[0];
  const cfg = LEVEL_CONFIG[current.level] || LEVEL_CONFIG.info;

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: cfg.bg, borderLeftColor: cfg.border },
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <TouchableOpacity style={styles.content} onPress={handlePress} activeOpacity={0.8}>
        <Ionicons name={cfg.icon} size={18} color={cfg.iconColor} style={{ marginRight: 6 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: cfg.labelColor }]}>{cfg.label}</Text>
          <Text style={styles.message} numberOfLines={1}>
            {current.message}
          </Text>
        </View>
        {alerts.length > 1 && (
          <Text style={[styles.counter, { color: cfg.labelColor }]}>
            {currentIndex + 1}/{alerts.length}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color={cfg.iconColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 2,
    borderRadius: 8,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  message: {
    fontSize: 12,
    color: "#333",
    marginTop: 1,
  },
  counter: {
    fontSize: 10,
    fontWeight: "700",
    marginLeft: 8,
    marginRight: 4,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 4,
  },
});
