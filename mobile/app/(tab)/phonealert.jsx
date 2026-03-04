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
    name: "Trung tâm IOC",
    phone: "02361022",
  },
];

export default function PhoneAlertScreen() {
  const { signOut } = useAuth();
  const router = useRouter();

  const handleCall = (phoneNumber) => {
    const url = `tel:${phoneNumber}`;
    Linking.openURL(url).catch((err) =>
      console.error("Lỗi khi gọi điện thoại:", err)
    );
  };

  const handleLogout = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>SỐ ĐIỆN THOẠI KHẨN CẤP</Text>
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
