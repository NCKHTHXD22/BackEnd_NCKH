import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Linking,
  TouchableOpacity,
  FlatList,
  Share,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

const EMERGENCY_CONTACTS = [
  {
    name: "VP BCH PCTT và TKCN thành phố",
    phone: "02363626222",
  },
  {
    name: "VP Tác chiến BCH Quân sự thành phố",
    phone: "02363821274",
  },
  {
    name: "VP cứu nạn – cứu hộ",
    phone: "02363821884",
  },
  {
    // "02361022" (8 số) gần chắc là lỗi nhập liệu — 3 số khác trong danh sách
    // đều 11 số. "1022" là tổng đài mã ngắn công khai của Trung tâm IOC Đà
    // Nẵng (không cần mã vùng, khác số cố định thường). CẦN người phụ trách
    // xác nhận lại trước khi phát hành — không tự suy đoán thêm.
    name: "Trung tâm IOC",
    phone: "1022",
  },
];

export default function PhoneAlertScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const { t } = useTranslation();
  const [sosBusy, setSosBusy] = useState(false);

  const handleCall = (phoneNumber) => {
    const url = `tel:${phoneNumber}`;
    Linking.openURL(url).catch((err) =>
      console.error("Lỗi khi gọi điện thoại:", err)
    );
  };

  // Chia sẻ vị trí GPS hiện tại ngay lập tức qua bảng chia sẻ của hệ điều hành
  // (SMS/Zalo/Messenger...) cho người thân — nhanh hơn điền form "Yêu cầu trợ
  // giúp" đầy đủ khi đang trong tình huống khẩn cấp cần báo vị trí ngay.
  const handleSOS = async () => {
    setSosBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("phonealert.sosLocationDeniedTitle"), t("phonealert.sosLocationDeniedMessage"));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
      const name = user?.fullName || user?.firstName || "";
      const message = t("phonealert.sosMessage", { name, link: mapsLink });
      await Share.share({ message });
    } catch (err) {
      console.error("Lỗi SOS:", err);
      Alert.alert(t("common.error"), t("phonealert.sosError"));
    } finally {
      setSosBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("phonealert.title")}</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={24} color="red" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.sosBtn} onPress={handleSOS} disabled={sosBusy} activeOpacity={0.85}>
        {sosBusy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="alert-circle" size={22} color="#fff" />
            <Text style={styles.sosBtnText}>{t("phonealert.sosBtn")}</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.sosHint}>{t("phonealert.sosHint")}</Text>

      <FlatList
        data={EMERGENCY_CONTACTS}
        keyExtractor={(item) => item.phone}
        renderItem={({ item }) => (
          <View style={styles.contactCard}>
            <Text style={styles.contactName}>{item.name}</Text>
            <TouchableOpacity onPress={() => handleCall(item.phone)} style={styles.phoneRow}>
              <Ionicons name="call-outline" size={20} color="#3399ff" />
              <Text style={styles.phoneText}>{item.phone}</Text>
            </TouchableOpacity>
            <View style={styles.separator} />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 40,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111",
  },
  logoutBtn: {
    padding: 4,
  },
  contactCard: {
    marginBottom: 16,
    alignItems: "flex-start",
  },
  contactName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  phoneText: {
    color: "#3399ff",
    fontSize: 16,
    textDecorationLine: "underline",
  },
  separator: {
    height: 1,
    backgroundColor: "#ccc",
    marginTop: 8,
    width: "100%",
  },
  sosBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#C62828",
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 6,
  },
  sosBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  sosHint: {
    fontSize: 11,
    color: "#78909C",
    textAlign: "center",
    marginBottom: 18,
  },
});
