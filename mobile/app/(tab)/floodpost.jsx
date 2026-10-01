import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Switch, KeyboardAvoidingView,
  Platform, TouchableWithoutFeedback, Keyboard, ActivityIndicator,
  AppState,
} from "react-native";

import { useAuth } from "@clerk/clerk-expo";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import MapView, {PROVIDER_GOOGLE, Marker } from "react-native-maps";
import { Image } from "expo-image";
import axios from "axios";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import styles from "../../assets/styles/post.styles.js";
import { API_URL } from "@/lib/env";
import { enqueuePost, trySendQueue, getQueue } from "@/lib/postQueue";

const MAX_IMAGES = 5;

// 4 loại báo cáo — PHẢI khớp enum ở backend (src/core/entities/FloodPost.js)
const REPORT_TYPES = [
  { value: "flood_point", labelKey: "floodpost.reportTypes.flood_point" },
  { value: "flood_road", labelKey: "floodpost.reportTypes.flood_road" },
  { value: "fallen_tree", labelKey: "floodpost.reportTypes.fallen_tree" },
  { value: "landslide", labelKey: "floodpost.reportTypes.landslide" },
];
const FLOOD_LEVEL_TYPES = ["flood_point", "flood_road"];
const POINT_TYPES = ["flood_point", "fallen_tree"];
const RANGE_TYPES = ["flood_road", "landslide"];
// Giá trị gửi lên backend PHẢI giữ nguyên tiếng Việt (khớp enum server) — chỉ
// nhãn hiển thị được dịch, qua LANDSLIDE_STATUS_LABEL_KEY bên dưới.
const LANDSLIDE_STATUS = ["Có nguy cơ", "Đã sạt lở"];
const LANDSLIDE_STATUS_LABEL_KEY = {
  "Có nguy cơ": "floodpost.landslideStatus.risk",
  "Đã sạt lở": "floodpost.landslideStatus.happened",
};

const WARDS_DA_NANG = [
 "Phường Hải Châu","Phường Hòa Cường","Phường Thanh Khê","Phường An Khê","Phường An Hải",
  "Phường Sơn Trà","Phường Ngũ Hành Sơn","Phường Hòa Khánh","Phường Hải Vân","Phường Liên Chiểu",
  "Phường Cẩm Lệ","Phường Hòa Xuân","Phường Tam Kỳ","Phường Quảng Phú","Phường Hương Trà","Phường Bàn Thạch",
  "Phường Điện Bàn","Phường Điện Bàn Đông","Phường An Thắng","Phường Điện Bàn Bắc","Phường Hội An",
  "Phường Hội An Đông","Phường Hội An Tây","Xã Hòa Vang","Xã Hòa Tiến","Xã Bà Nà","Xã Núi Thành","Xã Tam Mỹ",
  "Xã Tam Anh","Xã Đức Phú","Xã Tam Xuân","Xã Tây Hồ","Xã Chiên Đàn","Xã Phú Ninh","Xã Lãnh Ngọc",
  "Xã Tiên Phước","Xã Thạnh Bình","Xã Sơn Cẩm Hà","Xã Trà Liên","Xã Trà Giáp","Xã Trà Tân","Xã Trà Đốc",
  "Xã Trà My","Xã Nam Trà My","Xã Trà Tập",
  "Xã Trà Vân","Xã Trà Linh","Xã Trà Leng","Xã Thăng Bình","Xã Thăng An","Xã Thăng Trường",
  "Xã Thăng Điền","Xã Thăng Phú","Xã Đồng Dương","Xã Quế Sơn Trung","Xã Quế Sơn",
  "Xã Xuân Phú","Xã Nông Sơn","Xã Quế Phước","Xã Duy Nghĩa","Xã Nam Phước",
  "Xã Duy Xuyên","Xã Thu Bồn","Xã Điện Bàn Tây","Xã Gò Nổi","Xã Đại Lộc",
  "Xã Hà Nha","Xã Thượng Đức","Xã Vu Gia","Xã Phú Thuận","Xã Thạnh Mỹ",
  "Xã Bến Giằng","Xã Nam Giang","Xã Đắc Pring","Xã La Dêê","Xã La Êê",
  "Xã Sông Vàng","Xã Sông Kôn","Xã Đông Giang", "Xã Bến Hiên","Xã Avương","Xã Tây Giang","Xã Hùng Sơn","Xã Hiệp Đức",
  "Xã Việt An","Xã Phước Trà","Xã Khâm Đức", "Xã Phước Năng","Xã Phước Chánh","Xã Phước Thành","Xã Phước Hiệp","Đặc khu Hoàng Sa","Xã Tam Hải",
  "Xã Tân Hiệp"
];

// Nhãn hiển thị dịch được cho areaType — giá trị gửi backend vẫn giữ tiếng Việt
// (khớp enum server ở src/core/entities/FloodPost.js)
const AREA_TYPES = ["Trong nhà", "Ngoài đường", "Khu vực khác"];
const AREA_TYPE_LABEL_KEY = {
  "Trong nhà": "floodpost.areaTypes.indoor",
  "Ngoài đường": "floodpost.areaTypes.outdoor",
  "Khu vực khác": "floodpost.areaTypes.other",
};

export default function FloodPost() {
  const { t } = useTranslation();
  const { getToken } = useAuth();

  const [reportType, setReportType] = useState("flood_point");

  // State cũ
  const [province, setProvince] = useState("Đà Nẵng");
  const [ward, setWard] = useState("");
  const [filteredWards, setFilteredWards] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [address, setAddress] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [areaType, setAreaType] = useState("Ngoài đường");
  const [landslideStatus, setLandslideStatus] = useState(LANDSLIDE_STATUS[0]);
  const [floodLevel, setFloodLevel] = useState("");
  const [floodTime, setFloodTime] = useState(new Date());
  const [eventEndTime, setEventEndTime] = useState(new Date());
  const [description, setDescription] = useState("");
  const [isFrequentFlood, setIsFrequentFlood] = useState(false);
  const [location, setLocation] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [images, setImages] = useState([]); // Thay vì 1 ảnh -> nhiều ảnh
  const [region, setRegion] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncingQueue, setSyncingQueue] = useState(false);

  const isFloodLevelType = FLOOD_LEVEL_TYPES.includes(reportType);
  const isPointType = POINT_TYPES.includes(reportType);
  const isRangeType = RANGE_TYPES.includes(reportType);
  const isTree = reportType === "fallen_tree";
  const isLandslide = reportType === "landslide";

  // State để kiểm tra lỗi thiếu input
  const [errors, setErrors] = useState({ ward: false, location: false, floodLevel: false, fromAddress: false, toAddress: false, eventEndTime: false });

 const fetchCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("common.error"), t("floodpost.locationPermissionError"));
      return;
    }

    const currentLocation = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = currentLocation.coords;
    const coords = { latitude, longitude };
    setLocation(coords);
    setRegion({
      ...coords,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

 useEffect(() => {
  fetchCurrentLocation();
}, []);

  // ── Hàng đợi báo cáo chưa gửi được (do mất mạng) ─────────────────────────
  // Thử gửi lại: lúc mở màn hình + mỗi khi app quay lại foreground (thường
  // là lúc có mạng trở lại sau khi người dùng rời vùng mất sóng).
  const syncQueue = useCallback(async () => {
    const queued = await getQueue();
    if (queued.length === 0) { setPendingCount(0); return; }
    setSyncingQueue(true);
    try {
      const { sent, remaining } = await trySendQueue(getToken);
      setPendingCount(remaining);
      if (sent > 0) {
        Alert.alert(
          t("floodpost.queueSentTitle"),
          t("floodpost.queueSentMessage", { count: sent })
        );
      }
    } finally {
      setSyncingQueue(false);
    }
  }, [getToken, t]);

  useEffect(() => {
    syncQueue();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncQueue();
    });
    return () => sub.remove();
  }, [syncQueue]);

    const handlePickImage = async () => {
      if (images.length >= MAX_IMAGES) {
        Alert.alert(t("floodpost.maxImagesTitle"), t("floodpost.maxImagesMessage", { max: MAX_IMAGES }));
        return;
      }
      // Chỉ xin quyền Camera khi người dùng THỰC SỰ chọn "Chụp ảnh" — trước
      // đây xin ngay từ đầu khiến từ chối Camera cũng chặn luôn việc chọn
      // ảnh từ thư viện (không hề cần quyền Camera).
      Alert.alert(t("floodpost.addImageTitle"), t("floodpost.addImageMessage"), [
        {
          text: t("floodpost.takePhoto"),
          onPress: async () => {
            const { granted } = await ImagePicker.requestCameraPermissionsAsync();
            if (!granted) {
              Alert.alert(t("floodpost.cameraPermissionError"));
              return;
            }
            const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
            if (!result.canceled) addImages([result.assets[0]]);
        },
      },
      {
        text: t("floodpost.pickFromLibrary"),
        onPress: async () => {
          const { granted: mediaGranted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!mediaGranted) {
            Alert.alert(t("floodpost.libraryPermissionError"));
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.5, allowsMultipleSelection: true });
          if (!result.canceled) {
            addImages(result.assets);
          }
        },
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  const addImages = (newAssets) => {
    setImages((prev) => {
      const combined = [...prev, ...newAssets];
      if (combined.length > MAX_IMAGES) {
        Alert.alert(t("floodpost.tooManyImagesTitle"), t("floodpost.tooManyImagesMessage", { max: MAX_IMAGES }));
      }
      return combined.slice(0, MAX_IMAGES);
    });
  };

  const handleRemoveImage = (index) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
  };

  const handleMapPress = (e) => setLocation(e.nativeEvent.coordinate);

  const handleWardChange = (text) => {
    setWard(text);
    const normalized = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const matches = WARDS_DA_NANG.filter(w =>
      w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(normalized)
    ).slice(0, 4);
    setFilteredWards(matches);
    setShowSuggestions(true);
  };

  const handleSubmit = async () => {
    const resetForm = () => {
      setReportType("flood_point");
      setWard("");
      setFilteredWards([]);
      setShowSuggestions(false);
      setAddress("");
      setFromAddress("");
      setToAddress("");
      setAreaType("Ngoài đường");
      setLandslideStatus(LANDSLIDE_STATUS[0]);
      setFloodLevel("");
      setFloodTime(new Date());
      setEventEndTime(new Date());
      setDescription("");
      setIsFrequentFlood(false);
      setImages([]);
      setLocation(null);
      setRegion(null);
      setErrors({ ward: false, location: false, floodLevel: false, fromAddress: false, toAddress: false, eventEndTime: false });
      // Nạp lại GPS ngay — trước đây để location/region = null, muốn báo
      // điểm ngập thứ 2 trong cùng phiên phải thoát tab rồi vào lại mới có GPS.
      fetchCurrentLocation();
    }

  const hasError = {
    ward: !ward,
    location: isPointType && !location,
    floodLevel: isFloodLevelType && !floodLevel,
    fromAddress: isRangeType && !fromAddress,
    toAddress: isRangeType && !toAddress,
    eventEndTime: isLandslide && !eventEndTime,
  };

  setErrors(hasError);

  if (Object.values(hasError).some(Boolean)) {
    Alert.alert(t("floodpost.missingFieldsTitle"), t("floodpost.missingFieldsMessage"));
    return;
  }

  // Các trường đơn giản — dùng chung cho gửi ngay và cho hàng đợi offline
  // (FormData không serialize được để lưu vào AsyncStorage, nên giữ dạng object).
  const fields = {
    reportType,
    "location[province]": province,
    "location[district]": ward,
  };
  if (isPointType) {
    fields["location[address]"] = address;
    fields["location[latitude]"] = location.latitude;
    fields["location[longitude]"] = location.longitude;
  }
  if (isRangeType) {
    fields.fromAddress = fromAddress;
    fields.toAddress = toAddress;
  }
  if (isFloodLevelType) {
    fields.floodLevel = floodLevel;
    fields.areaType = areaType;
  }
  if (isLandslide) {
    fields.landslideStatus = landslideStatus;
    fields.eventEndTime = eventEndTime.toISOString();
  }
  fields.floodTime = floodTime.toISOString();
  if (!isLandslide) fields.description = description;
  if (!isTree) fields.isFrequentFlood = isFrequentFlood;

  try {
    setIsSubmitting(true); // 👈 Bắt đầu loading

    const token = await getToken();
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
    images.forEach((image, index) => {
      formData.append("images", {
        uri: image.uri,
        type: "image/jpeg",
        name: `image_${Date.now()}_${index}.jpg`,
      });
    });

    const res = await axios.post(`${API_URL}/api/posts`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
      timeout: 20000,
    });

    // Bài chưa được AI/Admin duyệt sẽ chưa hiện trên bản đồ — nói rõ để người
    // gửi không tưởng là "gửi mà không nhận".
    Alert.alert(
      t("floodpost.submitSuccessTitle"),
      res.data?.status === "approved" ? t("floodpost.submitSuccessMessage") : t("floodpost.submitPendingMessage")
    );
    // Reset nếu cần ở đây
    resetForm();
  } catch (err) {
    // Lỗi mạng thực sự (không có response, vd mất sóng/timeout ở vùng ngập) —
    // lưu lại vào hàng đợi thay vì bắt người dùng nhập lại từ đầu.
    if (!err.response) {
      await enqueuePost(fields, images);
      const queued = await getQueue();
      setPendingCount(queued.length);
      Alert.alert(t("floodpost.queuedTitle"), t("floodpost.queuedMessage"));
      resetForm();
      return;
    }
    console.error("Lỗi gửi:", err.response?.data || err.message);
    Alert.alert(t("common.error"), err.response?.data?.error || t("floodpost.submitErrorGeneric"));
  } finally {
    setIsSubmitting(false); // 👈 Kết thúc loading
  }
};


  return (
    <>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t("floodpost.title")}</Text>

          {pendingCount > 0 && (
            <TouchableOpacity style={queueStyles.banner} onPress={syncQueue} disabled={syncingQueue}>
              {syncingQueue ? (
                <ActivityIndicator size="small" color="#8A6D00" />
              ) : (
                <Text style={queueStyles.bannerText}>
                  {t("floodpost.queuePendingBanner", { count: pendingCount })}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Loại báo cáo */}
          <View style={styles.segment}>
            {REPORT_TYPES.map((rt) => (
              <TouchableOpacity
                key={rt.value}
                style={[styles.segmentBtn, reportType === rt.value && styles.segmentSelected]}
                onPress={() => setReportType(rt.value)}
              >
                <Text style={{ fontSize: 12 }}>{t(rt.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Phường/Xã */}
          <View style={styles.row}>
            <TextInput
              value={province}
              editable={false}
              style={[styles.input, { flex: 1, marginRight: 6, backgroundColor: "#f0f0f0" }]}
            />
            <View style={{ flex: 1, position: "relative" }}>
              <TextInput
                placeholder={t("floodpost.wardPlaceholder")}
                value={ward}
                onChangeText={handleWardChange}
                onFocus={() => {
                  setFilteredWards(WARDS_DA_NANG.slice(0, 4));
                  setShowSuggestions(true);
                }}
                style={[
                  styles.input,
                  { marginBottom: 0 },
                  errors.ward && { borderColor: "red" },
                ]}
              />
              {showSuggestions && filteredWards.length > 0 && (
                <View style={styles.suggestionsList}>
                  {filteredWards.map((item, index) => (
                    <TouchableOpacity key={index} onPress={() => {
                      setWard(item);
                      setShowSuggestions(false);
                    }} style={styles.suggestionItem}>
                      <Text>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {isPointType && (
            <>
              <TextInput
                placeholder={isTree ? t("floodpost.treeAddressPlaceholder") : t("floodpost.streetPlaceholder")}
                value={address}
                onChangeText={setAddress}
                style={styles.input}
              />

              {/* Bản đồ */}
              <Text style={styles.label}>{t("floodpost.mapLabel")}</Text>
              <MapView
                style={[styles.map, errors.location && { borderColor: "red", borderWidth: 1 }]}
                provider={PROVIDER_GOOGLE}
                onPress={handleMapPress}
                region={region} // Dùng region thay vì initialRegion
              >
                {location && <Marker coordinate={location} />}
              </MapView>
            </>
          )}

          {isRangeType && (
            <>
              <TextInput
                placeholder={isLandslide ? t("floodpost.fromAddressLandslide") : t("floodpost.fromAddressFlood")}
                value={fromAddress}
                onChangeText={setFromAddress}
                style={[styles.input, errors.fromAddress && { borderColor: "red" }]}
              />
              <TextInput
                placeholder={isLandslide ? t("floodpost.toAddressLandslide") : t("floodpost.toAddressFlood")}
                value={toAddress}
                onChangeText={setToAddress}
                style={[styles.input, errors.toAddress && { borderColor: "red" }]}
              />
            </>
          )}

          {isFloodLevelType && (
            <>
              <TextInput
                placeholder={t("floodpost.floodLevelPlaceholder")}
                value={floodLevel}
                onChangeText={setFloodLevel}
                keyboardType="numeric"
                style={[styles.input, errors.floodLevel && { borderColor: "red" }]}
              />

              {/* Segment chọn kiểu ngập */}
              <View style={styles.segment}>
                {AREA_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.segmentBtn, areaType === type && styles.segmentSelected]}
                    onPress={() => setAreaType(type)}
                  >
                    <Text>{t(AREA_TYPE_LABEL_KEY[type])}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {isLandslide && (
            <View style={styles.segment}>
              {LANDSLIDE_STATUS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.segmentBtn, landslideStatus === s && styles.segmentSelected]}
                  onPress={() => setLandslideStatus(s)}
                >
                  <Text>{t(LANDSLIDE_STATUS_LABEL_KEY[s])}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Chọn thời gian */}
          <Text style={styles.label}>
            {isTree ? t("floodpost.timeLabelTree") : isLandslide ? t("floodpost.timeLabelLandslide") : t("floodpost.timeLabelFlood")}
          </Text>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.input}>
            <Text>{floodTime.toLocaleString()}</Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={floodTime}
              mode="datetime"
              display="default"
              onChange={(event, selected) => {
                setShowDatePicker(false);
                if (selected) setFloodTime(selected);
              }}
            />
          )}

          {isLandslide && (
            <>
              <Text style={styles.label}>{t("floodpost.timeLabelLandslideEnd")}</Text>
              <TouchableOpacity
                onPress={() => setShowEndDatePicker(true)}
                style={[styles.input, errors.eventEndTime && { borderColor: "red" }]}
              >
                <Text>{eventEndTime.toLocaleString()}</Text>
              </TouchableOpacity>
              {showEndDatePicker && (
                <DateTimePicker
                  value={eventEndTime}
                  mode="datetime"
                  display="default"
                  onChange={(event, selected) => {
                    setShowEndDatePicker(false);
                    if (selected) setEventEndTime(selected);
                  }}
                />
              )}
            </>
          )}

          {/* Mô tả — không hiển thị cho Khu vực sạt lở */}
          {!isLandslide && (
            <TextInput
              placeholder={isTree ? t("floodpost.descPlaceholderTree") : t("floodpost.descPlaceholderDefault")}
              value={description}
              onChangeText={setDescription}
              style={styles.input}
              multiline
            />
          )}

          {/* Ảnh đính kèm */}
          <TouchableOpacity onPress={handlePickImage} style={styles.imagePicker}>
          {images.length === 0 ? (
            <Text>{t("floodpost.addImage")}</Text>
          ) : (
            <View style={styles.imageGrid}>
              {images.map((img, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri: img.uri }} style={styles.image} contentFit="cover" />
                  <TouchableOpacity
                    onPress={() => handleRemoveImage(index)}
                    style={styles.removeIcon}
                  >
                    <Text style={{ color:"white", fontSize: 7 }}>❌</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>


          {/* Công tắc — không hiển thị cho Cây ngã đổ */}
          {!isTree && (
            <View style={styles.switchRow}>
              <Switch value={isFrequentFlood} onValueChange={setIsFrequentFlood} />
              <Text style={styles.switchLabel}>
                {isLandslide ? t("floodpost.frequentLandslide") : t("floodpost.frequentFlood")}
              </Text>
            </View>
          )}

          {/* Gửi */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={isSubmitting}>
            <Text style={styles.submitText}>{t("floodpost.submitBtn")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>

    {isSubmitting && (
      <View style={styles.overlay}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>{t("floodpost.sending")}</Text>
      </View>
    )}
    </>
  );
}

const queueStyles = StyleSheet.create({
  banner: {
    backgroundColor: "#FFF8E1",
    borderWidth: 1,
    borderColor: "#FFE082",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: "center",
  },
  bannerText: {
    color: "#8A6D00",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
