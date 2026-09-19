// SignUpScreen.jsx
import {
  View,
  Text,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { useSignUp, useAuth } from "@clerk/clerk-expo";
import { API_URL } from "@/lib/env";
import { useState } from "react";
import { authStyles } from "../../assets/styles/auth.styles.js";
import { Image } from "expo-image";
import { COLORS } from "../../constants/colors.js";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import VerifyEmail from "./verify-email.jsx";

const SignUpScreen = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoaded, signUp } = useSignUp();
  const { getToken, isSignedIn, signOut } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password || !name || !phone) {
      return Alert.alert(t("common.error"), t("auth.signUp.fillAllFields"));
    }
    if (password.length < 8) {
      return Alert.alert(t("common.error"), t("auth.signUp.passwordTooShort"));
    }
    if (!/[A-Z]/.test(password)) {
      return Alert.alert(t("common.error"), t("auth.signUp.passwordNeedUpper"));
    }
    if (!/[0-9]/.test(password)) {
      return Alert.alert(t("common.error"), t("auth.signUp.passwordNeedDigit"));
    }
    if (phone.length != 10) {
      return Alert.alert(t("common.error"), t("auth.signUp.phoneInvalid"));
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Alert.alert(t("common.error"), t("auth.signUp.emailInvalid"));
    }
    if (!isLoaded) return;
    try {
      if (isSignedIn) {
        await signOut();
      }
    } catch (error) {
      console.error("Lỗi khi đăng xuất:", error);
    }

    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      Alert.alert(t("common.error"), err.errors?.[0]?.message || t("auth.signUp.signUpFailed"));
      console.error(JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSuccess = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, name, phone }),
      });

      if (!response.ok) {
        const errData = await response.json();
        console.log("Gửi user thất bại:", errData);
      }

      router.replace("/(tab)");
    } catch (err) {
      console.error("Lỗi lưu user:", err);
    }
  };

  if (pendingVerification) {
    return (
      <VerifyEmail
        email={email}
        onBack={() => setPendingVerification(false)}
        onSuccess={handleVerificationSuccess}
      />
    );
  }

  return (
    <View style={authStyles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={64}
        style={authStyles.keyboardView}
      >
        <ScrollView contentContainerStyle={authStyles.scrollContent}>
          <View style={authStyles.imageContainer}>
            <Image
              source={require("../../assets/images/i2.png")}
              style={authStyles.image}
              contentFit="contain"
            />
          </View>

          <Text style={authStyles.title}>{t("auth.signUp.title")}</Text>

          <View style={authStyles.formContainer}>
            <View style={authStyles.inputContainer}>
              <TextInput
                style={authStyles.textInput}
                placeholder={t("auth.signUp.namePlaceholder")}
                placeholderTextColor={COLORS.textLight}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={authStyles.inputContainer}>
              <TextInput
                style={authStyles.textInput}
                placeholder={t("auth.signUp.phonePlaceholder")}
                placeholderTextColor={COLORS.textLight}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={authStyles.inputContainer}>
              <TextInput
                style={authStyles.textInput}
                placeholder={t("auth.signUp.emailPlaceholder")}
                placeholderTextColor={COLORS.textLight}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={authStyles.inputContainer}>
              <TextInput
                style={authStyles.textInput}
                placeholder={t("auth.signUp.passwordPlaceholder")}
                placeholderTextColor={COLORS.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={authStyles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color={COLORS.textLight}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[authStyles.authButton, loading && authStyles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
            >
              <Text style={authStyles.buttonText}>
                {loading ? t("auth.signUp.creating") : t("auth.signUp.signUp")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={authStyles.linkContainer} onPress={() => router.back()}>
              <Text style={authStyles.linkText}>
                {t("auth.signUp.haveAccount")} <Text style={authStyles.link}>{t("auth.signUp.signIn")}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default SignUpScreen;
