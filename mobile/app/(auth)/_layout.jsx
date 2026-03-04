import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { API_URL,CLERK_KEY } from "@/lib/env";

console.log("API URL trong AuthLayout:", API_URL);
console.log("Clerk Key trong AuthLayout:", CLERK_KEY);
export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
//app/(auth)/_layout.jsx
