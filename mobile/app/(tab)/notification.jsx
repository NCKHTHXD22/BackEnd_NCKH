// app/(tab)/notification.jsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useAuth } from "@clerk/clerk-expo"; // ✅ Lấy token từ Clerk
import styles from "../../assets/styles/notification.js";
import { API_URL as BASE_URL } from "@/lib/env";
const API_URL = `${BASE_URL}/api/notifications`;

export default function Notification() {
  const { getToken } = useAuth(); // ✅ Hook từ Clerk
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const token = await getToken(); // ✅ JWT từ Clerk
      const res = await axios.get(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(res.data);
    } catch (err) {
      console.error("❌ Lỗi khi tải thông báo:", err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      const token = await getToken();
      await axios.patch(
        `${API_URL}/${id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("❌ Lỗi khi đánh dấu đã đọc:", err.response?.data || err.message);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.item, item.read ? styles.read : styles.unread]}
      onPress={() => markAsRead(item._id)}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={
            item.type === "post_moderation"
              ? item.message.includes("duyệt")
                ? "checkmark-circle"
                : "close-circle"
              : "notifications"
          }
          size={24}
          color={
            item.type === "post_moderation"
              ? item.message.includes("duyệt")
                ? "green"
                : "red"
              : "blue"
          }
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.sender}>Hệ thống</Text>
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.time}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Thông báo</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.empty}>Không có thông báo nào</Text>}
        />
      )}
    </View>
  );
}
