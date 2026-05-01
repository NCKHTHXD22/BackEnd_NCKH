import { Slot } from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SafeScreen from "@/components/SafeScreen";
import AnimatedSplash from "@/components/AnimatedSplash";
import { useState, useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { usePushNotifications } from "../lib/pushNotifications";
import { API_URL } from "../lib/env";

// Giữ native splash cho đến khi sẵn sàng
SplashScreen.preventAutoHideAsync();

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function PushTokenSync({ expoPushToken }) {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!expoPushToken || !isSignedIn) return;

    (async () => {
      try {
        const authToken = await getToken();
        await fetch(`${API_URL}/api/users/push-token`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token: expoPushToken }),
        });
      } catch (err) {
        console.warn("Không thể đồng bộ push token:", err.message);
      }
    })();
  }, [expoPushToken, isSignedIn]);

  return null;
}

export default function RootLayout() {
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  // Khởi tạo và xin quyền Push Notifications
  const { expoPushToken } = usePushNotifications();

  useEffect(() => {
    // Ẩn native splash ngay khi RootLayout mount → chuyển sang animated splash
    SplashScreen.hideAsync();
  }, []);

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <SafeScreen>
          {/* Đồng bộ push token lên backend mỗi khi user đăng nhập */}
          <PushTokenSync expoPushToken={expoPushToken} />
          <Slot />
        </SafeScreen>

        {/* Animated splash nằm trên cùng, tự fade out sau 2.8s */}
        {showAnimatedSplash && (
          <AnimatedSplash onFinish={() => setShowAnimatedSplash(false)} />
        )}
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
