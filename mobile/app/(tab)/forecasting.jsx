import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Dimensions,
    TouchableOpacity,
    Alert,
} from "react-native";
import axios from "axios";
import { API_URL } from "@/lib/env";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../constants/colors";

const { width } = Dimensions.get("window");

export default function ForecastingScreen() {
    const [stations, setStations] = useState([]);
    const [stationId, setStationId] = useState(null);
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchingModel, setFetchingModel] = useState(false);

    useEffect(() => {
        const fetchLakes = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/inflowLake`);
                setStations(res.data);
                if (res.data.length > 0) {
                    setStationId(res.data[0].Id_Lake);
                }
            } catch (err) {
                console.error("Lỗi tải danh sách trạm hồ:", err);
            }
        };
        fetchLakes();
    }, []);

    useEffect(() => {
        if (!stationId) return;
        const fetchForecast = async () => {
            setFetchingModel(true);
            try {
                const response = await axios.get(`${API_URL}/api/forecast-lstm/${stationId}`);
                if (response.data && response.data.length > 0) {
                    const sorted = response.data.sort((a, b) => new Date(a.forecastTime) - new Date(b.forecastTime));

                    // Lấy 8 khung giờ tiếp theo để biểu diễn
                    const displayData = sorted.slice(0, 8);

                    const labels = displayData.map(d => new Date(d.forecastTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
                    const p10Data = displayData.map(d => d.p10 || 0);
                    const p50Data = displayData.map(d => d.qvao_forecast || 0);
                    const p90Data = displayData.map(d => d.p90 || 0);
                    const generatedAt = sorted[0].generatedAt;

                    setForecastData({
                        labels,
                        p10Data,
                        p50Data,
                        p90Data,
                        generatedAt,
                        raw: displayData
                    });
                } else {
                    setForecastData(null);
                }
            } catch (error) {
                console.error("Lỗi lấy dữ liệu dự báo LSTM:", error);
                setForecastData(null);
            } finally {
                setFetchingModel(false);
                setLoading(false);
            }
        };

        fetchForecast();
    }, [stationId]);

    const MultiBarChart = ({ data }) => {
        if (!data) return null;
        const allVals = [...data.p10Data, ...data.p50Data, ...data.p90Data];
        let maxVal = Math.max(...allVals);
        if (maxVal === 0) maxVal = 1;

        return (
            <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Biểu đồ Lưu lượng dự báo (m³/s)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chartWrapper}>
                        {data.labels.map((label, idx) => (
                            <View key={idx} style={styles.groupedBarItem}>
                                <View style={styles.barsRow}>
                                    {/* P90 */}
                                    <View style={[styles.bar, { height: (data.p90Data[idx] / maxVal) * 120, backgroundColor: "#ef5350" }]} />
                                    {/* P50 */}
                                    <View style={[styles.bar, { height: (data.p50Data[idx] / maxVal) * 120, backgroundColor: "#111827", marginHorizontal: 2 }]} />
                                    {/* P10 */}
                                    <View style={[styles.bar, { height: (data.p10Data[idx] / maxVal) * 120, backgroundColor: "#42a5f5" }]} />
                                </View>
                                <Text style={styles.barLabel}>{label}</Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>
                <View style={styles.miniLegend}>
                    <View style={styles.legendDotItem}><View style={[styles.dot, { backgroundColor: '#ef5350' }]} /><Text style={styles.dotText}>P90</Text></View>
                    <View style={styles.legendDotItem}><View style={[styles.dot, { backgroundColor: '#111827' }]} /><Text style={styles.dotText}>P50</Text></View>
                    <View style={styles.legendDotItem}><View style={[styles.dot, { backgroundColor: '#42a5f5' }]} /><Text style={styles.dotText}>P10</Text></View>
                </View>
            </View>
        );
    };

    const ScenarioSummary = ({ data }) => {
        if (!data) return null;
        const avgP50 = data.p50Data.reduce((a, b) => a + b, 0) / data.p50Data.length;
        const trend = data.p50Data[data.p50Data.length - 1] > data.p50Data[0] ? "Tăng dần" : "Giảm dần";

        return (
            <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Kịch bản dự báo</Text>
                <View style={styles.summaryRow}>
                    <Ionicons name="trending-up" size={20} color={COLORS.primary} />
                    <Text style={styles.summaryText}>Xu hướng: <Text style={{ fontWeight: 'bold' }}>{trend}</Text></Text>
                </View>
                <View style={styles.summaryRow}>
                    <Ionicons name="water" size={20} color="#1976d2" />
                    <Text style={styles.summaryText}>Lưu lượng trung bình (P50): <Text style={{ fontWeight: 'bold' }}>{avgP50.toFixed(2)} m³/s</Text></Text>
                </View>
                <Text style={styles.summaryDesc}>
                    {avgP50 > 100
                        ? "Cảnh báo: Lưu lượng về hồ có dấu hiệu tăng cao. Cần theo dõi sát sao mực nước thượng lưu."
                        : "Nhận định: Lưu lượng về hồ ổn định trong ngưỡng an toàn."}
                </Text>
            </View>
        );
    };

    if (loading && stations.length === 0) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={{ marginTop: 10 }}>Đang kết nối hệ thống...</Text>
            </View>
        );
    }

    const currentStation = stations.find(s => s.Id_Lake === stationId);

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Dự báo AI (LSTM)</Text>
                <Text style={styles.subtitle}>Phân tích tổ hợp đa kịch bản cho hồ chứa</Text>
            </View>

            <View style={styles.selectorWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
                    {stations.map((s) => (
                        <TouchableOpacity
                            key={s.Id_Lake}
                            onPress={() => setStationId(s.Id_Lake)}
                            style={[
                                styles.stationChip,
                                stationId === s.Id_Lake && styles.stationChipActive,
                            ]}
                        >
                            <Text style={[styles.chipText, stationId === s.Id_Lake && styles.chipTextActive]}>
                                {s.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {fetchingModel ? (
                <View style={styles.modelLoading}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={{ marginTop: 10, color: '#666' }}>AI đang phân tích dữ liệu...</Text>
                </View>
            ) : forecastData ? (
                <View style={styles.content}>
                    <View style={styles.metaInfo}>
                        <Ionicons name="time-outline" size={16} color="#666" />
                        <Text style={styles.metaText}>
                            Bản tin lúc: {new Date(forecastData.generatedAt).toLocaleString('vi-VN')}
                        </Text>
                    </View>

                    <MultiBarChart data={forecastData} />
                    <ScenarioSummary data={forecastData} />

                    <View style={styles.detailsCard}>
                        <Text style={styles.detailsTitle}>Bảng số liệu chi tiết (m³/s)</Text>
                        {forecastData.raw.slice(0, 5).map((item, idx) => (
                            <View key={idx} style={styles.tableRow}>
                                <Text style={styles.tableTime}>{new Date(item.forecastTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>
                                <View style={styles.tableValues}>
                                    <Text style={[styles.val, { color: '#42a5f5' }]}>{item.p10?.toFixed(1)}</Text>
                                    <Text style={[styles.val, { fontWeight: 'bold' }]}>{item.qvao_forecast?.toFixed(1)}</Text>
                                    <Text style={[styles.val, { color: '#ef5350' }]}>{item.p90?.toFixed(1)}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            ) : (
                <View style={styles.noData}>
                    <Ionicons name="cloud-offline-outline" size={64} color="#ccc" />
                    <Text style={styles.noDataText}>Không tìm thấy dữ liệu dự báo cho hồ này.</Text>
                    <Text style={styles.noDataSub}>Vui lòng chọn trạm khác hoặc thử lại sau.</Text>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F3F4F6" },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
    header: { padding: 20, backgroundColor: COLORS.white, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 2 },
    title: { fontSize: 24, fontWeight: "bold", color: "#111827" },
    subtitle: { fontSize: 13, color: "#6B7280", marginTop: 4 },
    selectorWrapper: { paddingVertical: 12 },
    selectorScroll: { paddingHorizontal: 15 },
    stationChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 25, backgroundColor: COLORS.white, marginRight: 10, borderWidth: 1, borderColor: "#E5E7EB" },
    stationChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    chipText: { color: "#374151", fontSize: 13 },
    chipTextActive: { color: COLORS.white, fontWeight: "bold" },
    content: { padding: 15 },
    metaInfo: { flexDirection: "row", alignItems: "center", marginBottom: 15, marginLeft: 5 },
    metaText: { fontSize: 12, color: "#6B7280", marginLeft: 5 },
    chartCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 15, elevation: 2 },
    chartTitle: { fontSize: 16, fontWeight: "bold", color: "#111827", marginBottom: 20 },
    chartWrapper: { flexDirection: "row", alignItems: "flex-end", height: 160, paddingBottom: 25 },
    groupedBarItem: { width: 65, alignItems: "center" },
    barsRow: { flexDirection: "row", alignItems: "flex-end", height: 120 },
    bar: { width: 10, borderRadius: 2 },
    barLabel: { fontSize: 10, color: "#6B7280", marginTop: 8 },
    miniLegend: { flexDirection: "row", justifyContent: "center", marginTop: 10, gap: 15 },
    legendDotItem: { flexDirection: "row", alignItems: "center" },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
    dotText: { fontSize: 11, color: "#4B5563" },
    summaryCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 15, elevation: 2 },
    summaryTitle: { fontSize: 16, fontWeight: "bold", color: "#111827", marginBottom: 12 },
    summaryRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    summaryText: { marginLeft: 10, fontSize: 14, color: "#374151" },
    summaryDesc: { fontSize: 13, color: "#6B7280", marginTop: 10, fontStyle: "italic", lineHeight: 18 },
    detailsCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 30, elevation: 2 },
    detailsTitle: { fontSize: 16, fontWeight: "bold", color: "#111827", marginBottom: 15 },
    tableRow: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", alignItems: "center" },
    tableTime: { width: 60, fontSize: 13, fontWeight: "600", color: "#374151" },
    tableValues: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
    val: { fontSize: 13, width: 40, textAlign: "center" },
    modelLoading: { marginTop: 100, alignItems: "center" },
    noData: { marginTop: 80, alignItems: "center", padding: 40 },
    noDataText: { fontSize: 16, fontWeight: "bold", color: "#374151", marginTop: 20 },
    noDataSub: { fontSize: 13, color: "#6B7280", marginTop: 5, textAlign: "center" },
});
