// verify-email.jsx
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
import { useSignUp } from "@clerk/clerk-expo";
import { useState } from "react";
import { useRouter } from "expo-router";
import { authStyles } from "../../assets/styles/auth.styles.js";  
import { Image } from "expo-image";
import { COLORS } from "../../constants/colors.js";

const VerifyEmail = ({ email, onBack, onSuccess }) => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerification = async () => {
    if (!isLoaded) return;
    setLoading(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });

        if (onSuccess) await onSuccess(); // Gọi callback từ SignUp
        else router.replace("/(tab)");
      } else {
        Alert.alert("Lỗi", "Xác minh chưa hoàn tất.");
      }
    } catch (err) {
      Alert.alert("Lỗi", err.errors?.[0]?.message || "Mã xác minh không đúng.");
    } finally {
      setLoading(false);
    }
  };

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
              source={require("../../assets/images/i3.png")}
              style={authStyles.image}
              contentFit="contain"
            />
          </View>

          <Text style={authStyles.title}>Xác minh email</Text>
          <Text style={authStyles.subtitle}>Mã xác minh đã gửi đến {email}</Text>

          <View style={authStyles.formContainer}>
            <View style={authStyles.inputContainer}>
              <TextInput
                style={authStyles.textInput}
                placeholder="Nhập mã xác minh"
                placeholderTextColor={COLORS.textLight}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
              />
            </View>

            <TouchableOpacity
              style={[authStyles.authButton, loading && authStyles.buttonDisabled]}
              onPress={handleVerification}
              disabled={loading}
            >
              <Text style={authStyles.buttonText}>
                {loading ? "Đang xác minh..." : "Xác minh"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={authStyles.linkContainer} onPress={onBack}>
              <Text style={authStyles.linkText}>
                <Text style={authStyles.link}>Quay lại đăng ký</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default VerifyEmail;
