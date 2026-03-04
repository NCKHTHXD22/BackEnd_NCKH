import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Switch, KeyboardAvoidingView,
  Platform, TouchableWithoutFeedback, Keyboard, ActivityIndicator
} from "react-native";

import { useAuth } from "@clerk/clerk-expo";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import MapView, {PROVIDER_GOOGLE, Marker } from "react-native-maps";
import { Image } from "expo-image";
import axios from "axios";
import * as Location from "expo-location";
import { useEffect } from "react";
import styles from "../../assets/styles/post.styles.js";  
import { API_URL } from "@/lib/env";


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

export default function FloodPost() {
  const { getToken } = useAuth();

  // State cũ
  const [province, setProvince] = useState("Đà Nẵng");
  const [ward, setWard] = useState("");
  const [filteredWards, setFilteredWards] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [address, setAddress] = useState("");
  const [areaType, setAreaType] = useState("Ngoài đường");
  const [floodLevel, setFloodLevel] = useState("");
  const [floodTime, setFloodTime] = useState(new Date());
  const [description, setDescription] = useState("");
  const [isFrequentFlood, setIsFrequentFlood] = useState(false);
  const [location, setLocation] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [images, setImages] = useState([]); // Thay vì 1 ảnh -> nhiều ảnh
  const [region, setRegion] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);



  // State để kiểm tra lỗi thiếu input
  const [errors, setErrors] = useState({ ward: false, location: false, floodLevel: false });

 useEffect(() => {
  (async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Lỗi", "Bạn cần cấp quyền truy cập vị trí để sử dụng tính năng bản đồ.");
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
  })();
}, []);

    const handlePickImage = async () => {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert("Bạn cần cấp quyền truy cập máy ảnh");
        return;
      }

      Alert.alert("Thêm hình ảnh", "Bạn muốn chọn ảnh từ thư viện hay chụp ảnh mới?", [
        {
          text: "Chụp ảnh",
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
            if (!result.canceled) setImages([...images, result.assets[0]]);
        },
      },
      {
        text: "Chọn từ thư viện",
        onPress: async () => {
          const { granted: mediaGranted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!mediaGranted) {
            Alert.alert("Bạn cần cấp quyền truy cập thư viện ảnh");
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.5, allowsMultipleSelection: true });
          if (!result.canceled) {
            setImages([...images, ...result.assets]);
          }
        },
      },
      { text: "Hủy", style: "cancel" },
    ]);
  };

  const handleRemoveImage = (index) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
  };

  const handleMapPress = (e) => setLocation(e.nativeEvent.coordinate);

  const handleWardChange = (text) => {
    setWard(text);
    const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matches = WARDS_DA_NANG.filter(w =>
      w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(normalized)
    ).slice(0, 5);
    setFilteredWards(matches);
    setShowSuggestions(true);
  };

  const handleSubmit = async () => {
    const resetForm = () => {
      setWard("");
      setFilteredWards([]);
      setShowSuggestions(false);
      setAddress("");
      setAreaType("Ngoài đường");
      setFloodLevel("");
      setFloodTime(new Date());
      setDescription("");
      setIsFrequentFlood(false);
      setImages([]);
      setLocation(null);
      setRegion(null);
      setErrors({ ward: false, location: false, floodLevel: false });
    }
  const hasError = {
    ward: !ward,
    location: !location,
    floodLevel: !floodLevel,
  };

  setErrors(hasError);

  if (Object.values(hasError).some(Boolean)) {
    Alert.alert("Thiếu thông tin", "Vui lòng điền đủ các trường bắt buộc.");
    return;
  }

  try {
    setIsSubmitting(true); // 👈 Bắt đầu loading

    const token = await getToken();
    const formData = new FormData();

    formData.append("location[province]", province);
    formData.append("location[district]", ward);
    formData.append("location[address]", address);
    formData.append("location[latitude]", location.latitude);
    formData.append("location[longitude]", location.longitude);
    formData.append("floodLevel", floodLevel);
    formData.append("areaType", areaType);
    formData.append("floodTime", floodTime.toISOString());
    formData.append("description", description);
    formData.append("isFrequentFlood", isFrequentFlood);

    images.forEach((image) => {
      formData.append("images", {
        uri: image.uri,
        type: "image/jpeg",
        name: `image_${Date.now()}.jpg`,
      });
    });

    await axios.post(`${API_URL}/api/posts`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
    });

    Alert.alert("Thành công", "Thông tin đã được gửi.");
    // Reset nếu cần ở đây
    resetForm();
  } catch (err) {
    console.error("Lỗi gửi:", err.response?.data || err.message);
    Alert.alert("Lỗi", "Không thể gửi dữ liệu. Hãy thử lại.");
  } finally {
    setIsSubmitting(false); // 👈 Kết thúc loading
  }
};


  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Chia sẻ điểm ngập bạn đang thấy</Text>

          {/* Phường/Xã */}
          <View style={styles.row}>
            <TextInput
              value={province}
              editable={false}
              style={[styles.input, { flex: 1, marginRight: 6, backgroundColor: "#f0f0f0" }]}
            />
            <View style={{ flex: 1, position: "relative" }}>
              <TextInput
                placeholder="Phường/Xã *"
                value={ward}
                onChangeText={handleWardChange}
                onFocus={() => {
                  setFilteredWards(WARDS_DA_NANG.slice(0, 5));
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

          <TextInput
            placeholder="Số nhà, tên đường (nếu có)"
            value={address}
            onChangeText={setAddress}
            style={styles.input}
          />

          {/* Bản đồ */}
          <Text style={styles.label}>Chọn vị trí chính xác trên bản đồ *</Text>
          <MapView
            style={[styles.map, errors.location && { borderColor: "red", borderWidth: 1 }]}
            provider={PROVIDER_GOOGLE}
            onPress={handleMapPress}
            region={region} // Dùng region thay vì initialRegion
          >
            {location && <Marker coordinate={location} />}
          </MapView>


          <TextInput
            placeholder="Mức ngập (cm) *"
            value={floodLevel}
            onChangeText={setFloodLevel}
            keyboardType="numeric"
            style={[styles.input, errors.floodLevel && { borderColor: "red" }]}
          />

          {/* Segment chọn loại */}
          <View style={styles.segment}>
            {["Trong nhà", "Ngoài đường", "Khu vực khác"].map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.segmentBtn, areaType === type && styles.segmentSelected]}
                onPress={() => setAreaType(type)}
              >
                <Text>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chọn thời gian */}
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

          {/* Mô tả */}
          <TextInput
            placeholder="Mô tả/khuyến nghị"
            value={description}
            onChangeText={setDescription}
            style={styles.input}
            multiline
          />

          {/* Ảnh đính kèm */}
          <TouchableOpacity onPress={handlePickImage} style={styles.imagePicker}>
          {images.length === 0 ? (
            <Text>📷 Thêm hình ảnh</Text>
          ) : (
            <View style={styles.imageGrid}>
              {images.map((img, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri: img.uri }} style={styles.image} />
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


          {/* Công tắc */}
          <View style={styles.switchRow}>
            <Switch value={isFrequentFlood} onValueChange={setIsFrequentFlood} />
            <Text style={styles.switchLabel}>Địa điểm này thường xuyên bị ngập</Text>
          </View>

          {/* Gửi */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={isSubmitting}>
            <Text style={styles.submitText}>Gửi thông tin</Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
            {isSubmitting && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Đang gửi thông tin...</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}