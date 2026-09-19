import { useSignIn, useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

import { authStyles } from "../../assets/styles/auth.styles.js";
import { COLORS } from "../../constants/colors.js";

const SignInScreen = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ Nếu đã đăng nhập thì chuyển hướng luôn
  useEffect(() => {
    if (isSignedIn) {
      router.replace("/(tab)");
    }
  }, [isSignedIn, router]);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert(t("common.error"), t("auth.signIn.fillAllFields"));
      return;
    }

    if (!isLoaded) return;

    setLoading(true);

    try {
      const signInAttempt = await signIn.create({
        identifier: email,
        password,
      });

      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/(tab)"); // ✅ chuyển sang màn hình chính
      } else {
        Alert.alert(t("auth.signIn.loginFailedTitle"), t("auth.signIn.loginFailedMessage"));
      }
    } catch (err) {
      const errorCode = err.errors?.[0]?.code;
      if (errorCode === "form_identifier_not_found" || errorCode === "form_password_incorrect") {
        Alert.alert(t("auth.signIn.wrongCredentialsTitle"), t("auth.signIn.wrongCredentialsMessage"));
      } else {
        Alert.alert(t("common.error"), t("auth.signIn.networkErrorMessage"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={authStyles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={authStyles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView contentContainerStyle={authStyles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={authStyles.imageContainer}>
            <Image source={require("../../assets/images/i1.png")} style={authStyles.image} contentFit="contain" />
          </View>

          <Text style={authStyles.title}>{t("auth.signIn.welcomeBack")}</Text>

          <View style={authStyles.formContainer}>
            <View style={authStyles.inputContainer}>
              <TextInput
                style={authStyles.textInput}
                placeholder={t("auth.signIn.emailPlaceholder")}
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
                placeholder={t("auth.signIn.passwordPlaceholder")}
                placeholderTextColor={COLORS.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
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
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={authStyles.buttonText}>{loading ? t("auth.signIn.signingIn") : t("auth.signIn.signIn")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={authStyles.linkContainer}
              onPress={() => router.push("/(auth)/sign-up")}
            >
              <Text style={authStyles.linkText}>
                {t("auth.signIn.noAccount")} <Text style={authStyles.link}>{t("auth.signIn.signUp")}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default SignInScreen;
