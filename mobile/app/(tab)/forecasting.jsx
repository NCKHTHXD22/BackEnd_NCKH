import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Dimensions,
    TouchableOpacity,
} from "react-native";
import axios from "axios";
import { API_URL } from "@/lib/env";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../constants/colors";

const { width } = Dimensions.get("window");

export default function ForecastingScreen() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [stationId, setStationId] = useState("station_1");

    const stations = [
        { id: "station_1", name: "Trạm Ba Hàn" },
        { id: "station_2", name: "Trạm Tuy Hòa" },
    ];

    useEffect(() => {
        const fetchForecast = async () => {
            setLoading(true);
            try {
                const response = await axios.get(`${API_URL}/api/forecast/${stationId}`);
                setData(response.data);
            } catch (error) {
                console.error("Lỗi lấy dữ liệu dự báo:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchForecast();
    }, [stationId]);

    const SimpleChart = ({ modelData }) => {
        if (!modelData) return null;
        const maxVal = Math.max(...modelData.data.map(Number));

        return (
            <View style={styles.chartContainer}>
                <Text style={[styles.modelName, { color: modelData.color }]}>
                    {modelData.name}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.barsWrapper}>
                        {modelData.data.map((val, idx) => (
                            <View key={idx} style={styles.barItem}>
                                <View
                                    style={[
                                        styles.bar,
                                        {
                                            height: (Number(val) / maxVal) * 100,
                                            backgroundColor: modelData.color,
                                        },
                                    ]}
                                />
                                <Text style={styles.barLabel}>{data.labels[idx]}</Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text>Đang tải dữ liệu mô hình AI...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Dự báo lưu lượng nước</Text>
                <Text style={styles.subtitle}>Sử dụng mô hình ARIMAX, LSTM & HEC</Text>
            </View>

            <View style={styles.stationSelector}>
                {stations.map((s) => (
                    <TouchableOpacity
                        key={s.id}
                        onPress={() => setStationId(s.id)}
                        style={[
                            styles.stationBtn,
                            stationId === s.id && styles.stationBtnActive,
                        ]}
                    >
                        <Text
                            style={[
                                styles.stationBtnText,
                                stationId === s.id && styles.stationBtnTextActive,
                            ]}
                        >
                            {s.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {data && (
                <View style={styles.content}>
                    <View style={styles.warningBox}>
                        <Ionicons name="warning" size={24} color="#d32f2f" />
                        <Text style={styles.warningText}>Cảnh báo: {data.warnings}</Text>
                    </View>

                    <SimpleChart modelData={data.models.ARIMAX} />
                    <SimpleChart modelData={data.models.LSTM} />
                    <SimpleChart modelData={data.models.HEC} />

                    <View style={styles.legend}>
                        <Text style={styles.legendTitle}>Chú thích mô hình:</Text>
                        <View style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: "#1976d2" }]} />
                            <Text>ARIMAX: Mô hình thống kê chuỗi thời gian</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: "#388e3c" }]} />
                            <Text>LSTM: Mô hình học sâu (Deep Learning)</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: "#f57c00" }]} />
                            <Text>HEC: Mô hình thủy văn vật lý</Text>
                        </View>
                    </View>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f8f9fa" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { padding: 20, backgroundColor: COLORS.white },
    title: { fontSize: 22, fontWeight: "bold", color: COLORS.text },
    subtitle: { fontSize: 14, color: COLORS.textLight, marginTop: 4 },
    stationSelector: {
        flexDirection: "row",
        padding: 10,
        justifyContent: "center",
        gap: 10,
    },
    stationBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: "#e0e0e0",
    },
    stationBtnActive: { backgroundColor: COLORS.primary },
    stationBtnText: { color: COLORS.text },
    stationBtnTextActive: { color: COLORS.white, fontWeight: "bold" },
    content: { padding: 15 },
    warningBox: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#ffebee",
        padding: 12,
        borderRadius: 10,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: "#ffcdd2",
    },
    warningText: { marginLeft: 10, color: "#c62828", fontWeight: "600" },
    chartContainer: {
        backgroundColor: COLORS.white,
        padding: 15,
        borderRadius: 12,
        marginBottom: 15,
        elevation: 3,
    },
    modelName: { fontSize: 16, fontWeight: "bold", marginBottom: 10 },
    barsWrapper: {
        flexDirection: "row",
        alignItems: "flex-end",
        height: 150,
        paddingBottom: 20,
    },
    barItem: { width: 40, alignItems: "center", marginRight: 5 },
    bar: { width: 20, borderRadius: 4 },
    barLabel: { fontSize: 9, marginTop: 5, color: COLORS.textLight },
    legend: { padding: 15, backgroundColor: COLORS.white, borderRadius: 12 },
    legendTitle: { fontWeight: "bold", marginBottom: 8 },
    legendItem: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
});
