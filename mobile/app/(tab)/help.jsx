import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Image, FlatList, ActivityIndicator
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import MapView, { PROVIDER_GOOGLE,Marker } from "react-native-maps";
import * as Location from "expo-location";
import { useAuth } from "@clerk/clerk-expo";
import axios from "axios";


export default function HelpRequestScreen() {
  const { getToken } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState({
    province: "Đà Nẵng",
    ward: "",
    street: "",
  });
  const [wardSuggestions, setWardSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [what3words, setWhat3words] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(null);
  const [images, setImages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const mapRef = useRef(null);

  const wardList = ["Phường Hải Châu", "Phường Hòa Cường", "Phường Thanh Khê", "Phường An Khê", "Phường An Hải", "Phường Sơn Trà", "Phường Ngũ Hành Sơn", "Phường Hòa Khánh", "Phường Hải Vân", "Phường Liên Chiểu", "Phường Cẩm Lệ", "Phường Hòa Xuân", "Phường Tam Kỳ", "Phường Quảng Phú", "Phường Hương Trà", "Phường Bàn Thạch", "Phường Điện Bàn", "Phường Điện Bàn Đông", "Phường An Thắng", "Phường Điện Bàn Bắc", "Phường Hội An", "Phường Hội An Đông", "Phường Hội An Tây", "Xã Hòa Vang", "Xã Hòa Tiến", "Xã Bà Nà", "Xã Núi Thành", "Xã Tam Mỹ", "Xã Tam Anh", "Xã Đức Phú", "Xã Tam Xuân", "Xã Tây Hồ", "Xã Chiên Đàn", "Xã Phú Ninh", "Xã Lãnh Ngọc", "Xã Tiên Phước", "Xã Thạnh Bình", "Xã Sơn Cẩm Hà", "Xã Trà Liên", "Xã Trà Giáp", "Xã Trà Tân", "Xã Trà Đốc", "Xã Trà My", "Xã Nam Trà My", "Xã Trà Tập", "Xã Trà Vân", "Xã Trà Linh", "Xã Trà Leng", "Xã Thăng Bình", "Xã Thăng An", "Xã Thăng Trường", "Xã Thăng Điền", "Xã Thăng Phú", "Xã Đồng Dương", "Xã Quế Sơn Trung", "Xã Quế Sơn", "Xã Xuân Phú", "Xã Nông Sơn", "Xã Quế Phước", "Xã Duy Nghĩa", "Xã Nam Phước", "Xã Duy Xuyên", "Xã Thu Bồn", "Xã Điện Bàn Tây", "Xã Gò Nổi", "Xã Đại Lộc", "Xã Hà Nha", "Xã Thượng Đức", "Xã Vu Gia", "Xã Phú Thuận", "Xã Thạnh Mỹ", "Xã Bến Giằng", "Xã Nam Giang", "Xã Đắc Pring", "Xã La Dêê", "Xã La Êê", "Xã Sông Vàng", "Xã Sông Kôn", "Xã Đông Giang", "Xã Bến Hiên", "Xã Avương", "Xã Tây Giang", "Xã Hùng Sơn", "Xã Hiệp Đức", "Xã Việt An", "Xã Phước Trà", "Xã Khâm Đức", "Xã Phước Năng", "Xã Phước Chánh", "Xã Phước Thành", "Xã Phước Hiệp", "Đặc khu Hoàng Sa", "Xã Tam Hải", "Xã Tân Hiệp"];

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Lỗi", "Bạn cần cấp quyền truy cập vị trí để sử dụng tính năng bản đồ.");
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentLocation.coords;
      const loc = { latitude, longitude };
      setLocation(loc);
      if (mapRef.current) {
        mapRef.current.animateToRegion({ ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 1000);
      }
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
    setAddress({ ...address, ward: text });
    if (text.length > 0) {
      const filtered = wardList.filter((ward) => ward.toLowerCase().includes(text.toLowerCase()));
      setWardSuggestions(filtered.slice(0, 5));
      setShowSuggestions(true);
    } else {
      setWardSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectWard = (ward) => {
    setAddress({ ...address, ward });
    setWardSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    const resetForm = () => {
  setName("");
  setPhone("");
  setAddress({ province: "Đà Nẵng", ward: "", street: "" });
  setWhat3words("");
  setDescription("");
  setImages([]);
  setErrors({});
};

    const newErrors = {};
    let missingFields = [];
    if (!name) { newErrors.name = true; missingFields.push("- Họ tên"); }
    if (!phone) { newErrors.phone = true; missingFields.push("- Số điện thoại"); }
    if (!address.ward) { newErrors.ward = true; missingFields.push("- Phường/Xã"); }
    if (!description) { newErrors.description = true; missingFields.push("- Nội dung cần hỗ trợ"); }

    setErrors(newErrors);

    if (missingFields.length > 0) {
      Alert.alert("Thiếu thông tin:", missingFields.join("\n"));
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("description", description);
      formData.append("what3words", what3words);
      formData.append("address", JSON.stringify(address));
      formData.append("location", JSON.stringify(location));
      formData.append("name", name);
      formData.append("phone", phone);
      images.forEach((img, index) => {
        formData.append("images", {
          uri: img.uri,
          type: "image/jpeg",
          name: `photo_${index}.jpg`,
        });
      });
      const token = await getToken();
      await axios.post("https://flwarning.onrender.com/api/help", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });
      Alert.alert("✅ Thành công", "Yêu cầu cứu trợ đã được gửi.");
      resetForm();
    } catch (error) {
      console.error("Lỗi gửi yêu cầu:", error);
      Alert.alert("❌ Lỗi", "Không gửi được yêu cầu. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Yêu cầu trợ giúp</Text>
        <Text style={styles.title}>Khuyến cáo: Khai báo thông tin sai là vi phạm pháp luật Việt Nam và có thể bị xử lý hình sự</Text>
        <Text style={styles.label}>🧍 Họ tên</Text>
        <TextInput style={[styles.input, errors.name && { borderColor: 'red' }]} value={name} onChangeText={setName} />

        <Text style={styles.label}>📞 Số điện thoại</Text>
        <TextInput style={[styles.input, errors.phone && { borderColor: 'red' }]} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

        <Text style={styles.label}>🏠 Địa chỉ</Text>
        <TextInput style={styles.input} value={address.province} onChangeText={(text) => setAddress({ ...address, province: text })} />

        <View style={{ position: "relative", marginBottom: 1 }}>
          <TextInput
            placeholder="Phường/Xã *"
            value={address.ward}
            onChangeText={handleWardChange}
            style={[styles.input, errors.ward && { borderColor: 'red' }]}
          />
          {showSuggestions && wardSuggestions.length > 0 && (
            <View style={styles.suggestionsList}>
              {wardSuggestions.map((item, index) => (
                <TouchableOpacity key={index} onPress={() => selectWard(item)} style={styles.suggestionItem}>
                  <Text>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TextInput style={styles.input} placeholder="Số nhà, tên đường" value={address.street} onChangeText={(text) => setAddress({ ...address, street: text })} />

        <Text style={styles.label}>📍 What3words (tùy chọn)</Text>
        <TextInput style={styles.input} value={what3words} onChangeText={setWhat3words} />

        <Text style={styles.label}>✏️ Nội dung cần hỗ trợ</Text>
        <TextInput style={[styles.input, { height: 100 }, errors.description && { borderColor: 'red' }]} value={description} onChangeText={setDescription} multiline />

        <Text style={styles.label}>🗺️ Chọn vị trí trên bản đồ</Text>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          onPress={handleMapPress}
          initialRegion={location ? { ...location, latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined}
        >
          {location && <Marker coordinate={location} />}
        </MapView>
        <Text style={styles.label}>🖼️ Hình ảnh minh họa</Text>
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

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={isSubmitting}>
          <Text style={styles.submitText}>Gửi yêu cầu trợ giúp</Text>
        </TouchableOpacity>
      </ScrollView>

      {isSubmitting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#fff" },
  label: { fontWeight: "bold", marginTop: 12, marginBottom: 4, fontSize: 16 },
  input: { borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 6, marginBottom: 10, backgroundColor: "#fff" },
  suggestionsList: { position: "absolute", top: 40, left: 0, right: 0, backgroundColor: "#fff", zIndex: 4, borderWidth: 1, borderColor: "#ccc", borderRadius: 6, maxHeight: 150 },
  suggestionItem: { padding: 10, borderBottomWidth: 1, borderColor: "#eee" },
  submitBtn: { backgroundColor: "#444", padding: 14, borderRadius: 8, alignItems: "center", marginTop: 10 },
  submitText: { color: "white", fontWeight: "bold" },
  map: { height: 200, marginVertical: 10, borderRadius: 8 },
  imagePicker: {
  alignItems: "center",
  borderWidth: 1,
  borderColor: "#bbb",
  padding: 10,
  borderRadius: 10,
  marginBottom: 10,
  minHeight: 140,
  justifyContent: "center",
  backgroundColor: "#fafafa",
},

imageGrid: {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "flex-start",
  gap: 10,
},

imageWrapper: {
  width: 80,
  height: 80,
  margin: 4,
  position: "relative",
},

image: {
  width: "100%",
  height: "100%",
  borderRadius: 8,
},
removeIcon: {
  position: "absolute",
  top: -6,
  right: -6,
  backgroundColor: "red",
  borderRadius: 12,
  padding: 4,
  zIndex: 1,
},
  title: { fontWeight: "bold", color: "#e60000", fontSize: 16, textAlign: "center", marginBottom: 12 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }
});
