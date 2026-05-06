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
import { useSignUp, useAuth, SignedOut } from "@clerk/clerk-expo";
import { API_URL } from "@/lib/env";
import { useState } from "react";
import { authStyles } from "../../assets/styles/auth.styles.js";
import { Image } from "expo-image";
import { COLORS } from "../../constants/colors.js";
import { Ionicons } from "@expo/vector-icons";
import VerifyEmail from "./verify-email.jsx";

const SignUpScreen = () => {
  const router = useRouter();
  const { isLoaded, signUp } = useSignUp();
  const { getToken } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password || !name || !phone) {
      return Alert.alert("Lỗi", "Vui lòng điền đầy đủ thông tin.");
    }
    if (password.length < 8) {
      return Alert.alert("Lỗi", "Mật khẩu phải từ 8 ký tự trở lên.");
    }
    if (!/[A-Z]/.test(password)) {
      return Alert.alert("Lỗi", "Mật khẩu phải có ít nhất 1 kí tự in hoa");
    }
    if (!/[0-9]/.test(password)) {
      return Alert.alert("Lỗi", "Mật khẩu phải có ít nhất 1 kí tự chữ số");
    }
    if (phone.length != 10) {
      return Alert.alert("Lỗi", "Số điện thoại nhập phải đủ 10 chữ số. Vui lòng nhập lại");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Alert.alert("Lỗi", "Email không đúng. Vui lòng nhập lại email"
      );
    }
    if (!isLoaded) return;
    try {
      if (isSignedIn) {
        await SignedOut();
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
      Alert.alert("Lỗi", err.errors?.[0]?.message || "Đăng ký thất bại.");
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

          <Text style={authStyles.title}>Tạo Tài Khoản</Text>

          <View style={authStyles.formContainer}>
            <View style={authStyles.inputContainer}>
              <TextInput
                style={authStyles.textInput}
                placeholder="Họ và tên (Ex:Nguyễn Văn A)"
                placeholderTextColor={COLORS.textLight}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={authStyles.inputContainer}>
              <TextInput
                style={authStyles.textInput}
                placeholder="Số điện thoại (Ex:0123456789)"
                placeholderTextColor={COLORS.textLight}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={authStyles.inputContainer}>
              <TextInput
                style={authStyles.textInput}
                placeholder="Email (Ex:abc@gmail.com)"
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
                placeholder="Mật khẩu (Ex:Abcd1234)"
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
                {loading ? "Đang tạo tài khoản..." : "Đăng ký"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={authStyles.linkContainer} onPress={() => router.back()}>
              <Text style={authStyles.linkText}>
                Đã có tài khoản? <Text style={authStyles.link}>Đăng nhập</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default SignUpScreen;
