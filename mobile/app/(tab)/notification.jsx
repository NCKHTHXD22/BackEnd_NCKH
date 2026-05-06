// app/(tab)/notification.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as Location from "expo-location";
import { useAuth } from "@clerk/clerk-expo";
import { API_URL as BASE_URL } from "@/lib/env";

const NOTIF_URL = `${BASE_URL}/api/notifications`;
const HELP_URL  = `${BASE_URL}/api/help`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(date) {
  if (!date) return "";
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60)    return "Vừa xong";
  if (s < 3600)  return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

function cloudinaryThumb(url) {
  if (!url || !url.includes("cloudinary.com")) return url;
  return url.replace("/upload/", "/upload/w_120,h_90,c_fill,q_auto,f_webp/");
}

// ─── Card: Yêu cầu hỗ trợ gần bạn ────────────────────────────────────────────
function HelpCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const addr = item.address
    ? `${item.address.street}, ${item.address.ward}, ${item.address.province}`
    : "Chưa có địa chỉ";
  const userName = item.user?.name || "Người dùng";
  const imgs = (item.imageUrls || []).slice(0, 2);

  return (
    <TouchableOpacity
      style={styles.helpCard}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.82}
    >
      {/* Header */}
      <View style={styles.helpHeader}>
        <View style={styles.helpIconWrap}>
          <Ionicons name="hand-left" size={22} color="#C62828" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.helpTitleRow}>
            <Text style={styles.helpName} numberOfLines={1}>{userName}</Text>
            <View style={styles.distBadge}>
              <Ionicons name="location" size={11} color="#C62828" />
              <Text style={styles.distText}>{item.distKm ?? "?"}km</Text>
            </View>
          </View>
          <Text style={styles.helpTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16} color="#C62828"
        />
      </View>

      {/* Địa chỉ */}
      <View style={styles.helpAddrRow}>
        <Ionicons name="location-outline" size={13} color="#78909C" />
        <Text style={styles.helpAddr} numberOfLines={expanded ? undefined : 1}>
          {addr}
        </Text>
      </View>

      {/* Mô tả */}
      <Text style={styles.helpDesc} numberOfLines={expanded ? undefined : 2}>
        {item.description}
      </Text>

      {/* Ảnh (khi expand) */}
      {expanded && imgs.length > 0 && (
        <View style={styles.imgRow}>
          {imgs.map((url, i) => (
            <Image
              key={i}
              source={{ uri: cloudinaryThumb(url) }}
              style={styles.helpImg}
              resizeMode="cover"
            />
          ))}
        </View>
      )}

      {/* What3Words nếu có */}
      {expanded && item.what3words && (
        <View style={styles.w3wRow}>
          <Text style={styles.w3wIcon}>///</Text>
          <Text style={styles.w3wText}>{item.what3words}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Card: Thông báo cá nhân ───────────────────────────────────────────────
const TYPE_META = {
  post_approved: { icon: "checkmark-circle", color: "#2E7D32", bg: "#E8F5E9", label: "Bài đăng" },
  post_rejected: { icon: "close-circle",     color: "#C62828", bg: "#FFEBEE", label: "Bài đăng" },
};
function getMeta(type) {
  return TYPE_META[type] || { icon: "notifications", color: "#455A64", bg: "#ECEFF1", label: "Hệ thống" };
}

function NotifCard({ item, onRead }) {
  const m = getMeta(item.type);
  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: m.color }, item.read && styles.cardRead]}
      onPress={() => !item.read && onRead(item._id)}
      activeOpacity={0.75}
    >
      <View style={[styles.iconWrap, { backgroundColor: m.bg }]}>
        <Ionicons name={m.icon} size={20} color={m.color} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>{m.label}</Text>
          {!item.read && <View style={styles.unreadDot} />}
          <Text style={styles.cardTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        {item.title && <Text style={styles.cardTitle}>{item.title}</Text>}
        <Text style={styles.cardContent}>{item.content || item.message}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Notification() {
  const { getToken, isSignedIn } = useAuth();
  const [tab, setTab] = useState("nearby"); // "nearby" | "personal"

  // Nearby help
  const [helpRequests, setHelpRequests]   = useState([]);
  const [loadingHelp,  setLoadingHelp]    = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [userLoc, setUserLoc]             = useState(null);
  const [locError, setLocError]           = useState(false);

  // Personal notifications
  const [notifications, setNotifications]     = useState([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // ── Xin GPS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { setLocError(true); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        setLocationReady(true);
      } catch {
        setLocError(true);
      }
    })();
  }, []);

  // ── Fetch yêu cầu hỗ trợ được duyệt, trong 5km ───────────────────────────
  const fetchNearbyHelp = useCallback(async (loc) => {
    if (!loc) return;
    setLoadingHelp(true);
    try {
      const res = await axios.get(`${HELP_URL}/nearby`, {
        params: { lat: loc.lat, lng: loc.lng, radius: 5 },
        timeout: 10000,
      });
      setHelpRequests(res.data || []);
    } catch (err) {
      // 404 = backend chưa deploy route mới → hiện danh sách rỗng, không crash
      if (err.response?.status !== 404) {
        console.error("❌ Nearby help:", err.message);
      }
    } finally {
      setLoadingHelp(false);
    }
  }, []);

  useEffect(() => {
    if (locationReady && userLoc) fetchNearbyHelp(userLoc);
  }, [locationReady, userLoc]);

  // ── Fetch thông báo cá nhân ────────────────────────────────────────────────
  const fetchPersonal = useCallback(async () => {
    if (!isSignedIn) return;
    setLoadingPersonal(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await axios.get(`${NOTIF_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      setNotifications(res.data || []);
    } catch { /* suppress 401/500 */ } finally {
      setLoadingPersonal(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => { fetchPersonal(); }, []);

  const markAsRead = useCallback(async (id) => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      await axios.patch(`${NOTIF_URL}/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => n._id === id ? { ...n, read: true } : n));
    } catch { }
  }, [isSignedIn, getToken]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchNearbyHelp(userLoc), fetchPersonal()]);
    setRefreshing(false);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Thông báo</Text>
        {helpRequests.length > 0 && (
          <View style={styles.urgentBadge}>
            <Ionicons name="hand-left" size={12} color="white" />
            <Text style={styles.urgentText}>{helpRequests.length} cần giúp</Text>
          </View>
        )}
      </View>

      {/* ── Tab Bar ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === "nearby" && styles.tabActive]}
          onPress={() => setTab("nearby")}
        >
          <Ionicons
            name="people-outline" size={15}
            color={tab === "nearby" ? "#C62828" : "#78909C"}
          />
          <Text style={[styles.tabText, tab === "nearby" && styles.tabTextActive]}>
            Gần tôi {helpRequests.length > 0 ? `(${helpRequests.length})` : ""}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, tab === "personal" && styles.tabActive]}
          onPress={() => setTab("personal")}
        >
          <Ionicons
            name="person-outline" size={15}
            color={tab === "personal" ? "#1565C0" : "#78909C"}
          />
          <Text style={[styles.tabText, tab === "personal" && styles.tabTextActive]}>
            Của tôi {unreadCount > 0 ? `(${unreadCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab: Gần tôi ── */}
      {tab === "nearby" && (
        locError ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="location-off-outline" size={52} color="#90A4AE" />
            <Text style={styles.emptyTitle}>Không lấy được vị trí</Text>
            <Text style={styles.emptySubtitle}>
              Vui lòng cho phép ứng dụng truy cập GPS để xem yêu cầu hỗ trợ gần bạn
            </Text>
          </View>
        ) : !locationReady ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator size="large" color="#C62828" />
            <Text style={[styles.emptySubtitle, { marginTop: 12 }]}>Đang xác định vị trí...</Text>
          </View>
        ) : loadingHelp ? (
          <ActivityIndicator size="large" color="#C62828" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={helpRequests}
            keyExtractor={(item) => String(item._id)}
            renderItem={({ item }) => <HelpCard item={item} />}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="checkmark-circle-outline" size={52} color="#4CAF50" />
                <Text style={styles.emptyTitle}>Không có yêu cầu hỗ trợ</Text>
                <Text style={styles.emptySubtitle}>
                  Không có ai cần giúp đỡ trong vòng 5km quanh bạn
                </Text>
              </View>
            }
          />
        )
      )}

      {/* ── Tab: Của tôi ── */}
      {tab === "personal" && (
        !isSignedIn ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="lock-closed-outline" size={52} color="#90A4AE" />
            <Text style={styles.emptyTitle}>Chưa đăng nhập</Text>
            <Text style={styles.emptySubtitle}>
              Đăng nhập để xem thông báo cá nhân của bạn
            </Text>
          </View>
        ) : loadingPersonal ? (
          <ActivityIndicator size="large" color="#1565C0" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => <NotifCard item={item} onRead={markAsRead} />}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="notifications-off-outline" size={52} color="#90A4AE" />
                <Text style={styles.emptyTitle}>Không có thông báo</Text>
                <Text style={styles.emptySubtitle}>Bạn chưa có thông báo nào</Text>
              </View>
            }
          />
        )
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6FB" },

  // Header
  header: {
    flexDirection: "row", alignItems: "center",
    paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1, borderBottomColor: "#E8EAF6",
  },
  headerTitle:  { flex: 1, fontSize: 22, fontWeight: "800", color: "#1A237E" },
  urgentBadge:  {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#C62828", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  urgentText: { color: "white", fontSize: 11, fontWeight: "700" },

  // Tab bar
  tabBar: {
    flexDirection: "row", backgroundColor: "#fff",
    paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: "#E8EAF6",
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 12, gap: 5,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabActive:      { borderBottomColor: "#C62828" },
  tabText:        { fontSize: 13, fontWeight: "600", color: "#78909C" },
  tabTextActive:  { color: "#C62828" },

  listContent: { padding: 12, gap: 10 },

  // Help card
  helpCard: {
    backgroundColor: "#fff", borderRadius: 14,
    borderLeftWidth: 4, borderLeftColor: "#C62828",
    padding: 13, gap: 6,
    elevation: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3,
  },
  helpHeader:   { flexDirection: "row", alignItems: "center", gap: 10 },
  helpIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#FFEBEE",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  helpTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  helpName:     { fontSize: 14, fontWeight: "800", color: "#B71C1C", flex: 1 },
  distBadge:    {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#FFEBEE", borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  distText:  { fontSize: 11, fontWeight: "700", color: "#C62828" },
  helpTime:  { fontSize: 11, color: "#90A4AE", marginTop: 2 },
  helpAddrRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  helpAddr:    { flex: 1, fontSize: 12, color: "#546E7A", lineHeight: 17 },
  helpDesc:    { fontSize: 13, color: "#37474F", lineHeight: 19 },
  imgRow:      { flexDirection: "row", gap: 8, marginTop: 2 },
  helpImg:     { width: 120, height: 90, borderRadius: 8, backgroundColor: "#ECEFF1" },
  w3wRow:      { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  w3wIcon:     { fontSize: 13, fontWeight: "800", color: "#E53935" },
  w3wText:     { fontSize: 12, color: "#E53935", flex: 1 },

  // Personal notification card
  card: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: "#fff", borderRadius: 14,
    padding: 12, gap: 10, borderLeftWidth: 4,
    elevation: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3,
  },
  cardRead: { opacity: 0.6 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  cardBody:   { flex: 1, gap: 3 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardLabel:  { fontSize: 10, fontWeight: "700", color: "#90A4AE", textTransform: "uppercase", letterSpacing: 0.5 },
  unreadDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: "#1565C0" },
  cardTime:   { fontSize: 11, color: "#B0BEC5", marginLeft: "auto" },
  cardTitle:  { fontSize: 14, fontWeight: "700", color: "#1A237E" },
  cardContent:{ fontSize: 13, color: "#455A64", lineHeight: 18 },

  // Empty state
  emptyWrap:     { alignItems: "center", paddingTop: 70, gap: 10, paddingHorizontal: 30 },
  emptyTitle:    { fontSize: 17, fontWeight: "700", color: "#455A64" },
  emptySubtitle: { fontSize: 13, color: "#90A4AE", textAlign: "center", lineHeight: 20 },
});
