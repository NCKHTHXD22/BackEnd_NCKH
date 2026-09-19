import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Linking,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
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
  const router = useRouter();
  const { t } = useTranslation();

  const handleCall = (phoneNumber) => {
    const url = `tel:${phoneNumber}`;
    Linking.openURL(url).catch((err) =>
      console.error("Lỗi khi gọi điện thoại:", err)
    );
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
});
