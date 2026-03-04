//app/(tab)/_layout.jsx
import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../constants/colors";
import { API_URL, CLERK_KEY } from "@/lib/env";
import { useSafeAreaInsets } from "react-native-safe-area-context";

console.log("API URL trong AuthLayout:", API_URL);
console.log("Clerk Key trong AuthLayout:", CLERK_KEY);

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  if (!isSignedIn) return <Redirect href={"/(auth)/sign-in"} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 8,
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
          title: "Hiện trạng",
          tabBarIcon: ({ color, size }) => <Ionicons name="location-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="floodpost"
        options={{
          title: "Cảnh báo ngập nước",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="water" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: "Trợ giúp",
          tabBarIcon: ({ color, size }) => <Ionicons name="help-buoy" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="forecasting"
        options={{
          title: "Dự báo AI",
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notification"
        options={{
          title: "Thông báo",
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="phonealert"
        options={{
          title: "SĐT khẩn cấp",
          tabBarIcon: ({ color, size }) => <Ionicons name="call" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Tôi",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-sharp" size={size} color={color} />
        }}
      />
    </Tabs>
  );
};
