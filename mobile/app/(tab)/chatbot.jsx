import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import axios from "axios";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../constants/colors";
import { API_URL } from "@/lib/env";

const MAX_INPUT = 1000;

export default function ChatbotScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [messages, setMessages] = useState([]); // { id, role: "user" | "assistant", content, error? }
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const idRef = useRef(0);
  const coordsRef = useRef(null);
  const [hasLocation, setHasLocation] = useState(false);

  // Chỉ đọc vị trí nếu quyền đã được cấp sẵn (từ màn Hiện trạng) — không tự
  // xin quyền ở đây để tránh popup bất ngờ ngay khi mở chat. Nếu chưa có
  // quyền, chatbot vẫn hoạt động bình thường, chỉ là không biết vị trí.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getLastKnownPositionAsync();
        if (loc) {
          coordsRef.current = { lat: loc.coords.latitude, lon: loc.coords.longitude };
          setHasLocation(true);
        }
      } catch { /* im lặng — chatbot vẫn dùng được không cần vị trí */ }
    })();
  }, []);

  const scrollToEnd = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

  const send = useCallback(
    async (text) => {
      const content = (text ?? input).trim();
      if (!content || sending) return;

      const userMsg = { id: ++idRef.current, role: "user", content };
      // Lịch sử gửi kèm: chỉ các lượt hợp lệ (bỏ tin lỗi), server tự giới hạn số lượt
      const history = messages
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);
      scrollToEnd();

      try {
        const res = await axios.post(
          `${API_URL}/api/chatbot/message`,
          {
            message: content,
            history,
            ...(coordsRef.current ? { lat: coordsRef.current.lat, lon: coordsRef.current.lon } : {}),
          },
          { timeout: 35000 }
        );
        setMessages((prev) => [
          ...prev,
          { id: ++idRef.current, role: "assistant", content: res.data.reply },
        ]);
      } catch (err) {
        const serverMsg = err.response?.data?.message;
        setMessages((prev) => [
          ...prev,
          { id: ++idRef.current, role: "assistant", content: serverMsg || t("chatbot.networkError"), error: true },
        ]);
      } finally {
        setSending(false);
        scrollToEnd();
      }
    },
    [input, sending, messages, t]
  );

  const suggestions = [t("chatbot.suggest1"), t("chatbot.suggest2"), t("chatbot.suggest3")];

  const renderItem = ({ item }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.row, isUser ? styles.rowUser : styles.rowBot]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={14} color="#fff" />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot, item.error && styles.bubbleError]}>
          <Text style={[styles.bubbleText, isUser && { color: "#fff" }, item.error && { color: "#B71C1C" }]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title}>{t("chatbot.title")}</Text>
          <Text style={styles.subtitle}>
            {hasLocation ? t("chatbot.subtitleWithLocation") : t("chatbot.subtitle")}
          </Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToEnd}
        ListHeaderComponent={
          <View style={styles.welcome}>
            <Text style={styles.welcomeText}>{t("chatbot.welcome")}</Text>
            {messages.length === 0 && (
              <View style={styles.chipWrap}>
                {suggestions.map((s) => (
                  <TouchableOpacity key={s} style={styles.chip} onPress={() => send(s)}>
                    <Text style={styles.chipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          sending ? (
            <View style={[styles.row, styles.rowBot]}>
              <View style={styles.avatar}>
                <Ionicons name="sparkles" size={14} color="#fff" />
              </View>
              <View style={[styles.bubble, styles.bubbleBot]}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            </View>
          ) : null
        }
      />

      <Text style={styles.disclaimer}>{t("chatbot.disclaimer")}</Text>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t("chatbot.placeholder")}
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={MAX_INPUT}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={() => send()}
          disabled={!input.trim() || sending}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  listContent: { padding: 12, gap: 10 },
  welcome: { marginBottom: 6 },
  welcomeText: {
    fontSize: 13, color: "#374151", lineHeight: 19,
    backgroundColor: "#E0F2FE", padding: 12, borderRadius: 12,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#BFDBFE",
  },
  chipText: { fontSize: 12, color: "#1D4ED8", fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  rowUser: { justifyContent: "flex-end" },
  rowBot: { justifyContent: "flex-start" },
  avatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
  },
  bubble: { maxWidth: "80%", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 16 },
  bubbleUser: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: "#fff", borderBottomLeftRadius: 4 },
  bubbleError: { backgroundColor: "#FEE2E2" },
  bubbleText: { fontSize: 14, lineHeight: 20, color: "#111827" },
  disclaimer: { fontSize: 10, color: "#9CA3AF", textAlign: "center", paddingHorizontal: 16, paddingVertical: 4 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    padding: 10, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E5E7EB",
  },
  input: {
    flex: 1, maxHeight: 110, minHeight: 40,
    backgroundColor: "#F3F4F6", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: "#111827",
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
