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
import Svg, { Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/env";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../constants/colors";
import i18n from "@/lib/i18n";

const { width } = Dimensions.get("window");
const CHART_W = width - 64; // trừ margin (12*2) + padding card (16*2)
const CHART_H = 120;
const WEEKDAY_SHORT_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAY_SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayShort = (day) => (i18n.language?.startsWith("en") ? WEEKDAY_SHORT_EN : WEEKDAY_SHORT_VI)[day];

// ── Line chart helpers (SVG) — dùng chung cho biểu đồ lịch sử 7 ngày ─────────
function scaleY(v, min, max, h, pad = 12) {
    if (max === min) return h / 2;
    return pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
}
function buildLinePoints(values, w, h, min, max) {
    const n = values.length;
    if (n === 0) return [];
    const stepX = n > 1 ? w / (n - 1) : 0;
    return values.map((v, i) => ({ x: i * stepX, y: scaleY(v, min, max, h) }));
}
function pointsToPath(points) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

export default function ForecastingScreen() {
    const { t } = useTranslation();
    const [stations, setStations] = useState([]);
    const [stationId, setStationId] = useState(null);
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchingModel, setFetchingModel] = useState(false);
    const [history, setHistory] = useState(null); // [{ date, htl, qvao, qxa }] — 7 ngày gần nhất
    const [historyLoading, setHistoryLoading] = useState(false);

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

                    const labels = displayData.map(d => new Date(d.forecastTime).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }));
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

    // ── Lịch sử 7 ngày qua — gộp dữ liệu theo giờ thành trung bình/ngày ─────────
    useEffect(() => {
        if (!stationId) return;
        const fetchHistory = async () => {
            setHistoryLoading(true);
            try {
                const end = new Date();
                const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
                const res = await axios.get(`${API_URL}/api/inflowlake-history/${stationId}`, {
                    params: { start: start.toISOString(), end: end.toISOString() },
                });
                const rows = Array.isArray(res.data) ? res.data : [];

                // Gộp theo ngày (giờ địa phương VN) — trung bình HTL, Q đến, Q xả
                const byDay = {};
                rows.forEach((r) => {
                    const d = new Date(r.timestamp);
                    const key = d.toISOString().slice(0, 10);
                    if (!byDay[key]) byDay[key] = { date: d, htl: [], qvao: [], qxa: [] };
                    if (typeof r.htl === "number") byDay[key].htl.push(r.htl);
                    if (typeof r.qvao === "number") byDay[key].qvao.push(r.qvao);
                    if (typeof r.luuluongxa === "number") byDay[key].qxa.push(r.luuluongxa);
                });
                // Trung vị thay vì trung bình: dữ liệu quan trắc thỉnh thoảng có giá trị rác
                // (vd. mực nước 5.999.400 m) — 1 điểm lỗi sẽ làm méo cả biểu đồ nếu lấy trung bình.
                const avg = (arr) => {
                    if (!arr.length) return null;
                    const a = [...arr].sort((x, y) => x - y);
                    const m = Math.floor(a.length / 2);
                    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
                };
                const days = Object.entries(byDay)
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .slice(-7)
                    .map(([, v]) => ({ date: v.date, htl: avg(v.htl), qvao: avg(v.qvao), qxa: avg(v.qxa) }));

                setHistory(days.length > 0 ? days : null);
            } catch (err) {
                console.error("Lỗi tải lịch sử 7 ngày:", err);
                setHistory(null);
            } finally {
                setHistoryLoading(false);
            }
        };
        fetchHistory();
    }, [stationId]);

    const MultiBarChart = ({ data }) => {
        if (!data) return null;
        const allVals = [...data.p10Data, ...data.p50Data, ...data.p90Data];
        let maxVal = Math.max(...allVals);
        if (maxVal === 0) maxVal = 1;

        return (
            <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t("forecasting.chartTitle")}</Text>
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

    // ── Biểu đồ lịch sử 7 ngày — Mực nước (đơn biến, không cần chú giải) ────────
    const HistoryLevelChart = ({ days }) => {
        const values = days.map((d) => d.htl).filter((v) => v != null);
        if (values.length === 0) return null;
        const min = Math.min(...values) - 0.1;
        const max = Math.max(...values) + 0.1;
        const points = buildLinePoints(days.map((d) => d.htl ?? values[0]), CHART_W, CHART_H, min, max);
        const path = pointsToPath(points);
        const lastIdx = days.length - 1;
        const maxIdx = days.reduce((best, d, i) => (d.htl != null && (best === -1 || d.htl > days[best].htl) ? i : best), -1);

        return (
            <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t("forecasting.levelChartTitle")}</Text>
                <Svg width={CHART_W} height={CHART_H + 24}>
                    {/* Gridline ngang — 3 mốc tham chiếu, tách khỏi mực dữ liệu */}
                    {[0.25, 0.5, 0.75].map((f) => (
                        <Path key={f} d={`M 0 ${CHART_H * f} L ${CHART_W} ${CHART_H * f}`} stroke="#e1e0d9" strokeWidth={1} />
                    ))}
                    <Path d={path} stroke="#2a78d6" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    {points.map((p, i) => (
                        <Circle key={i} cx={p.x} cy={p.y} r={i === lastIdx || i === maxIdx ? 4 : 2.5} fill="#2a78d6" />
                    ))}
                </Svg>
                <View style={styles.historyAxisRow}>
                    {days.map((d, i) => (
                        <Text key={i} style={styles.historyAxisLabel}>{weekdayShort(new Date(d.date).getDay())}</Text>
                    ))}
                </View>
                <View style={styles.historyCalloutRow}>
                    {maxIdx >= 0 && (
                        <Text style={styles.historyCallout}>{t("forecasting.highest")}: <Text style={{ fontWeight: "700", color: "#2a78d6" }}>{days[maxIdx].htl.toFixed(2)}m</Text></Text>
                    )}
                    {days[lastIdx]?.htl != null && (
                        <Text style={styles.historyCallout}>{t("forecasting.current")}: <Text style={{ fontWeight: "700", color: "#111827" }}>{days[lastIdx].htl.toFixed(2)}m</Text></Text>
                    )}
                </View>
            </View>
        );
    };

    // ── Biểu đồ lịch sử 7 ngày — Q đến / Q xả (2 chuỗi, cùng đơn vị → 1 trục) ───
    const HistoryFlowChart = ({ days }) => {
        const qvaoVals = days.map((d) => d.qvao).filter((v) => v != null);
        const qxaVals = days.map((d) => d.qxa).filter((v) => v != null);
        const all = [...qvaoVals, ...qxaVals];
        if (all.length === 0) return null;
        const min = Math.min(0, ...all);
        const max = Math.max(...all) * 1.1 || 1;
        const qvaoPoints = buildLinePoints(days.map((d) => d.qvao ?? 0), CHART_W, CHART_H, min, max);
        const qxaPoints = buildLinePoints(days.map((d) => d.qxa ?? 0), CHART_W, CHART_H, min, max);

        return (
            <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t("forecasting.flowChartTitle")}</Text>
                <View style={styles.miniLegend}>
                    <View style={styles.legendDotItem}><View style={[styles.dot, { backgroundColor: "#2a78d6" }]} /><Text style={styles.dotText}>{t("forecasting.qIn")}</Text></View>
                    <View style={styles.legendDotItem}><View style={[styles.dot, { backgroundColor: "#e34948" }]} /><Text style={styles.dotText}>{t("forecasting.qOut")}</Text></View>
                </View>
                <Svg width={CHART_W} height={CHART_H + 24}>
                    {[0.25, 0.5, 0.75].map((f) => (
                        <Path key={f} d={`M 0 ${CHART_H * f} L ${CHART_W} ${CHART_H * f}`} stroke="#e1e0d9" strokeWidth={1} />
                    ))}
                    <Path d={pointsToPath(qvaoPoints)} stroke="#2a78d6" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    <Path d={pointsToPath(qxaPoints)} stroke="#e34948" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    {qvaoPoints.map((p, i) => <Circle key={`qi-${i}`} cx={p.x} cy={p.y} r={2.5} fill="#2a78d6" />)}
                    {qxaPoints.map((p, i) => <Circle key={`qo-${i}`} cx={p.x} cy={p.y} r={2.5} fill="#e34948" />)}
                </Svg>
                <View style={styles.historyAxisRow}>
                    {days.map((d, i) => (
                        <Text key={i} style={styles.historyAxisLabel}>{weekdayShort(new Date(d.date).getDay())}</Text>
                    ))}
                </View>
            </View>
        );
    };

    const ScenarioSummary = ({ data }) => {
        if (!data) return null;
        const avgP50 = data.p50Data.reduce((a, b) => a + b, 0) / data.p50Data.length;
        const trend = data.p50Data[data.p50Data.length - 1] > data.p50Data[0] ? t("forecasting.trendUp") : t("forecasting.trendDown");

        return (
            <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>{t("forecasting.scenarioTitle")}</Text>
                <View style={styles.summaryRow}>
                    <Ionicons name="trending-up" size={20} color={COLORS.primary} />
                    <Text style={styles.summaryText}>{t("forecasting.trend")}: <Text style={{ fontWeight: 'bold' }}>{trend}</Text></Text>
                </View>
                <View style={styles.summaryRow}>
                    <Ionicons name="water" size={20} color="#1976d2" />
                    <Text style={styles.summaryText}>{t("forecasting.avgFlow")}: <Text style={{ fontWeight: 'bold' }}>{avgP50.toFixed(2)} m³/s</Text></Text>
                </View>
                <Text style={styles.summaryDesc}>
                    {avgP50 > 100 ? t("forecasting.warningHigh") : t("forecasting.stableNote")}
                </Text>
            </View>
        );
    };

    if (loading && stations.length === 0) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={{ marginTop: 10 }}>{t("forecasting.connecting")}</Text>
            </View>
        );
    }

    const currentStation = stations.find(s => s.Id_Lake === stationId);

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{t("forecasting.title")}</Text>
                <Text style={styles.subtitle}>{t("forecasting.subtitle")}</Text>
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
                    <Text style={{ marginTop: 10, color: '#666' }}>{t("forecasting.analyzing")}</Text>
                </View>
            ) : forecastData ? (
                <View style={styles.content}>
                    <View style={styles.metaInfo}>
                        <Ionicons name="time-outline" size={16} color="#666" />
                        <Text style={styles.metaText}>
                            {t("forecasting.bulletinAt", { time: new Date(forecastData.generatedAt).toLocaleString(i18n.language) })}
                        </Text>
                    </View>

                    <MultiBarChart data={forecastData} />
                    <ScenarioSummary data={forecastData} />

                    <View style={styles.detailsCard}>
                        <Text style={styles.detailsTitle}>{t("forecasting.detailsTitle")}</Text>
                        {forecastData.raw.slice(0, 5).map((item, idx) => (
                            <View key={idx} style={styles.tableRow}>
                                <Text style={styles.tableTime}>{new Date(item.forecastTime).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</Text>
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
                    <Text style={styles.noDataText}>{t("forecasting.noDataTitle")}</Text>
                    <Text style={styles.noDataSub}>{t("forecasting.noDataSub")}</Text>
                </View>
            )}

            {/* ── Lịch sử 7 ngày qua — độc lập với dự báo LSTM ở trên ── */}
            <View style={styles.content}>
                <Text style={styles.sectionLabel}>{t("forecasting.historySection")}</Text>
                {historyLoading ? (
                    <View style={{ paddingVertical: 20, alignItems: "center" }}>
                        <ActivityIndicator size="small" color={COLORS.primary} />
                    </View>
                ) : history ? (
                    <>
                        <HistoryLevelChart days={history} />
                        <HistoryFlowChart days={history} />
                    </>
                ) : (
                    <Text style={styles.noDataSub}>{t("forecasting.historyNoData")}</Text>
                )}
            </View>
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
    sectionLabel: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 10, marginTop: 4 },
    historyAxisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    historyAxisLabel: { fontSize: 10, color: "#898781", width: 24, textAlign: "center" },
    historyCalloutRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
    historyCallout: { fontSize: 12, color: "#6B7280" },
    modelLoading: { marginTop: 100, alignItems: "center" },
    noData: { marginTop: 80, alignItems: "center", padding: 40 },
    noDataText: { fontSize: 16, fontWeight: "bold", color: "#374151", marginTop: 20 },
    noDataSub: { fontSize: 13, color: "#6B7280", marginTop: 5, textAlign: "center" },
});
