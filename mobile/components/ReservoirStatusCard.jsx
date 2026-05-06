// components/ReservoirStatusCard.jsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * ReservoirStatusCard
 * Props (mapping với InflowLake schema):
 *   name        {string}  - Tên hồ
 *   htl         {number}  - Mực nước thực đo (m) — field "htl" trong DB
 *   mndbt       {number}  - Mực nước dâng bình thường (m) — dùng để tính %
 *   mngc        {number}  - Mực nước gia cường / lũ (m)
 *   qvao        {number}  - Lưu lượng đến / inflow (m³/s) — field "qvao"
 *   luuluongxa  {number}  - Lưu lượng xả / outflow (m³/s) — field "luuluongxa"
 *   sumDepth    {number}  - Lượng mưa tích lũy (mm)
 *   trend       {number}  - Xu hướng thay đổi mực nước (m/h)
 *   lastUpdate  {string}  - Thời điểm cập nhật cuối
 */
export default function ReservoirStatusCard({
  name, htl, mndbt, mngc, qvao, luuluongxa, sumDepth, trend, lastUpdate,
}) {
  const safeMax = (mndbt && mndbt > 0) ? mndbt : null;
  const pct = safeMax && htl != null
    ? Math.min(100, Math.round((htl / safeMax) * 100))
    : null;

  const barColor =
    pct == null ? "#90A4AE" :
    pct >= 95 ? "#EF5350" :
    pct >= 80 ? "#FB8C00" : "#26A69A";

  const statusText =
    pct == null ? "Chưa có dữ liệu" :
    pct >= 95 ? "⚠️ Gần đầy" :
    pct >= 80 ? "🔶 Cao" : "✅ An toàn";

  const trendIcon = trend != null ? (trend > 0 ? "arrow-up" : trend < 0 ? "arrow-down" : "remove") : "remove";
  const trendColor = trend != null ? (trend > 0 ? "#EF5350" : trend < 0 ? "#42A5F5" : "#9E9E9E") : "#9E9E9E";
  const trendText = trend != null ? `${trend > 0 ? "+" : ""}${Number(trend).toFixed(2)} m/h` : null;

  const getRainLabel = (mm) => {
    if (!mm || mm === 0) return { label: "Không mưa", color: "#78909C", bg: "#ECEFF1" };
    if (mm < 5) return { label: `${mm} mm — Nhẹ`, color: "#42A5F5", bg: "#E3F2FD" };
    if (mm < 15) return { label: `${mm} mm — Vừa`, color: "#1565C0", bg: "#BBDEFB" };
    if (mm < 30) return { label: `${mm} mm — Lớn`, color: "#FB8C00", bg: "#FFF3E0" };
    return { label: `${mm} mm — Rất lớn`, color: "#EF5350", bg: "#FFEBEE" };
  };
  const rain = getRainLabel(sumDepth);

  return (
    <View style={styles.card}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="water" size={18} color="#0277BD" />
          <Text style={styles.name} numberOfLines={1}>{name || "Hồ chứa"}</Text>
        </View>
        {pct != null && (
          <View style={[styles.statusBadge, { backgroundColor: barColor + "22", borderColor: barColor }]}>
            <Text style={[styles.statusText, { color: barColor }]}>{statusText}</Text>
          </View>
        )}
      </View>

      {/* ── Mực nước + progress ── */}
      <View style={styles.levelRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.levelNumbers}>
            <Text style={styles.levelCurrent}>
              {htl != null ? `${htl.toFixed(2)} m` : "—"}
            </Text>
            {mndbt != null && (
              <Text style={styles.levelMax}> / MNDBT {mndbt.toFixed(1)} m</Text>
            )}
            {mngc != null && (
              <Text style={styles.levelFlood}> (Lũ: {mngc.toFixed(1)} m)</Text>
            )}
          </View>

          {pct != null ? (
            <>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
              </View>
              <View style={styles.progressFooter}>
                <Text style={[styles.pctText, { color: barColor }]}>{pct}%</Text>
                {trendText && (
                  <View style={styles.trendRow}>
                    <Ionicons name={trendIcon} size={11} color={trendColor} />
                    <Text style={[styles.trendText, { color: trendColor }]}>{trendText}</Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            <Text style={styles.noData}>Chưa có dữ liệu mực nước</Text>
          )}
        </View>
      </View>

      {/* ── Lưu lượng đến & xả ── */}
      {(qvao != null || luuluongxa != null) && (
        <View style={styles.flowGrid}>
          {qvao != null && (
            <View style={styles.flowBox}>
              <Ionicons name="arrow-down-circle" size={16} color="#26A69A" />
              <Text style={[styles.flowValue, { color: "#26A69A" }]}>{qvao.toFixed(1)}</Text>
              <Text style={styles.flowUnit}>m³/s</Text>
              <Text style={styles.flowLabel}>Lưu lượng đến</Text>
            </View>
          )}
          {qvao != null && luuluongxa != null && <View style={styles.flowDivider} />}
          {luuluongxa != null && (
            <View style={styles.flowBox}>
              <Ionicons name="arrow-up-circle" size={16} color="#EF5350" />
              <Text style={[styles.flowValue, { color: "#EF5350" }]}>{luuluongxa.toFixed(1)}</Text>
              <Text style={styles.flowUnit}>m³/s</Text>
              <Text style={styles.flowLabel}>Lưu lượng xả</Text>
            </View>
          )}
          {/* Chênh lệch */}
          {qvao != null && luuluongxa != null && (
            <>
              <View style={styles.flowDivider} />
              <View style={styles.flowBox}>
                <Ionicons
                  name={(qvao - luuluongxa) >= 0 ? "add-circle" : "remove-circle"}
                  size={16}
                  color={(qvao - luuluongxa) >= 0 ? "#FB8C00" : "#42A5F5"}
                />
                <Text style={[styles.flowValue, { color: (qvao - luuluongxa) >= 0 ? "#FB8C00" : "#42A5F5" }]}>
                  {(qvao - luuluongxa) >= 0 ? "+" : ""}{(qvao - luuluongxa).toFixed(1)}
                </Text>
                <Text style={styles.flowUnit}>m³/s</Text>
                <Text style={styles.flowLabel}>Chênh lệch</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* ── Mưa ── */}
      {sumDepth != null && (
        <View style={[styles.rainRow, { backgroundColor: rain.bg }]}>
          <Ionicons name="rainy" size={13} color={rain.color} />
          <Text style={[styles.rainText, { color: rain.color }]}>Mưa tích lũy: {rain.label}</Text>
        </View>
      )}

      {/* ── Cập nhật ── */}
      {lastUpdate && (
        <Text style={styles.lastUpdate}>
          🕐 {new Date(lastUpdate).toLocaleString("vi-VN")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 12,
    elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 5,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 6 },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: "#1A237E" },
  statusBadge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: "700" },

  // Mực nước
  levelRow: { marginBottom: 8 },
  levelNumbers: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 },
  levelCurrent: { fontSize: 22, fontWeight: "800", color: "#0D47A1" },
  levelMax: { fontSize: 12, color: "#78909C" },
  levelFlood: { fontSize: 11, color: "#EF5350" },
  noData: { fontSize: 12, color: "#B0BEC5", fontStyle: "italic" },

  progressBg: {
    height: 10, backgroundColor: "#E3F2FD", borderRadius: 5, overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 5 },
  progressFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  pctText: { fontSize: 12, fontWeight: "700" },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  trendText: { fontSize: 11, fontWeight: "600" },

  // Flow grid
  flowGrid: {
    flexDirection: "row", backgroundColor: "#F5F7FA", borderRadius: 12,
    padding: 10, marginBottom: 8, alignItems: "stretch",
  },
  flowBox: { flex: 1, alignItems: "center", gap: 2 },
  flowDivider: { width: 1, backgroundColor: "#E0E0E0", marginVertical: 4 },
  flowValue: { fontSize: 16, fontWeight: "800" },
  flowUnit: { fontSize: 10, color: "#90A4AE" },
  flowLabel: { fontSize: 9, color: "#78909C", textAlign: "center" },

  // Rain
  rainRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 4,
  },
  rainText: { fontSize: 12, fontWeight: "600" },

  // Last update
  lastUpdate: { fontSize: 10, color: "#B0BEC5", textAlign: "right", marginTop: 4 },
});
