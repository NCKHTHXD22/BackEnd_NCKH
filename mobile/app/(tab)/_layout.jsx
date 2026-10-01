//app/(tab)/_layout.jsx
import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, AppState } from "react-native";
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../constants/colors";
import { API_URL, CLERK_KEY } from "@/lib/env";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WeatherAlertBanner from "../../components/WeatherAlertBanner";

const UNREAD_POLL_MS = 2 * 60 * 1000; // 2 phút — đủ nhanh mà không tốn pin/băng thông

// Số thông báo cá nhân chưa đọc — hiện dạng badge đỏ trên icon tab "Thông báo"
// mà không cần mở tab mới biết có tin mới.
function useUnreadNotificationCount(isSignedIn, getToken) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isSignedIn) { setCount(0); return; }
    try {
      const token = await getToken();
      if (!token) return;
      const res = await axios.get(`${API_URL}/api/notifications/me`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      const unread = (res.data || []).filter((n) => !n.read).length;
      setCount(unread);
    } catch { /* offline hoặc lỗi tạm thời — giữ badge cũ */ }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, UNREAD_POLL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => { clearInterval(interval); sub.remove(); };
  }, [refresh]);

  return count;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { t } = useTranslation();
  const unreadCount = useUnreadNotificationCount(isSignedIn, getToken);

  if (!isLoaded) return null;

  if (!isSignedIn) return <Redirect href={"/(auth)/sign-in"} />;

  return (
    <View style={{ flex: 1 }}>
      {/* Banner cảnh báo nổi — hiện trên tất cả tab */}
      <WeatherAlertBanner />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.textLight,
          tabBarStyle: {
            backgroundColor: COLORS.white,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
            paddingTop: 8,
            paddingBottom: insets.bottom + 6,
            height: 80 + insets.bottom,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "600",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("tabs.home"),
            tabBarIcon: ({ color, size }) => <Ionicons name="location-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="weather"
          options={{
            title: t("tabs.weather"),
            tabBarIcon: ({ color, size }) => <Ionicons name="partly-sunny-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="floodpost"
          options={{
            title: t("tabs.floodpost"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="water" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="help"
          options={{
            title: t("tabs.help"),
            tabBarIcon: ({ color, size }) => <Ionicons name="help-buoy" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="notification"
          options={{
            title: t("tabs.notification"),
            tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} />,
            tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined,
            tabBarBadgeStyle: { backgroundColor: "#C62828" },
          }}
        />
        <Tabs.Screen
          name="phonealert"
          options={{
            title: t("tabs.phonealert"),
            tabBarIcon: ({ color, size }) => <Ionicons name="call" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t("tabs.profile"),
            tabBarIcon: ({ color, size }) => <Ionicons name="person-sharp" size={size} color={color} />,
          }}
        />
        {/* Ẩn màn forecasting (đã tích hợp vào weather) */}
        <Tabs.Screen
          name="forecasting"
          options={{ href: null }}
        />
        {/* Chatbot AI — mở từ nút nổi ở màn Hiện trạng, không chiếm chỗ trên thanh tab */}
        <Tabs.Screen
          name="chatbot"
          options={{ href: null }}
        />
      </Tabs>
    </View>
  );
}
