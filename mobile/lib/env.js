import Constants from "expo-constants";

export const API_URL = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.expoPublicApiUrl || "https://backend-nckh-lm57.onrender.com";
export const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || Constants.expoConfig?.extra?.expoPublicClerkPublishableKey || "";
