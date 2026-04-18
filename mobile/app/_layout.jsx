import { Slot } from "expo-router";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SafeScreen from "@/components/SafeScreen";
import AnimatedSplash from "@/components/AnimatedSplash";
import { useState, useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";

// Giữ native splash cho đến khi sẵn sàng
SplashScreen.preventAutoHideAsync();

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  useEffect(() => {
    // Ẩn native splash ngay khi RootLayout mount → chuyển sang animated splash
    SplashScreen.hideAsync();
  }, []);

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <SafeScreen>
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
