import "dotenv/config";

export default {
  expo: {
    name: "C-Life",
    slug: "mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/Logo.png",
    scheme: "mobile",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: "Ứng dụng cần dùng máy ảnh để chụp ảnh hiện trường.",
        NSPhotoLibraryUsageDescription: "Ứng dụng cần truy cập thư viện ảnh.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/Logo.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      permissions: [
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.RECORD_AUDIO",
        "android.permission.INTERNET",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
      ],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
      package: "com.qynci.mobile",
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-image-picker",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/Logo.png",
          imageWidth: 250,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
        },
      ],
      "react-native-edge-to-edge",
      "expo-splash-screen",
      "expo-location",
      "expo-secure-store",
      "expo-web-browser"
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "7aca4c82-8805-445a-89f4-b5bb3a16250c",
      },
      expoPublicApiUrl: process.env.EXPO_PUBLIC_API_URL,
      expoPublicClerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    },
    owner: "qynci",
  },
};
