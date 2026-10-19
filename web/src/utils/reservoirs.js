// Tọa độ hiển thị trên bản đồ (2D HomePage + bản đồ số 3D) – vị trí TUYẾN ĐẬP.
// Cập nhật 2026-10-19 theo OpenStreetMap và kiểm chứng bằng diện tích lưu vực tính từ DEM
// (vd. A Vương 683 km², Sông Bung 4 1.490 km², Sông Tranh 2 1.106 km² – khớp số liệu công bố).
// KHÔNG đồng bộ sang src/api/config/reservoirs.js và config của LSTM/XGBoost/RF: ở đó tọa độ là
// đầu vào lấy mưa/khí tượng cho mô hình đã huấn luyện – đổi cần đánh giá/huấn luyện lại.
export const RESERVOIRS = {
    1: { idx: 0, name: "HO A VUONG", lat: 15.79966, lon: 107.61733 }, // đập A Vương – OSM way 479648364
    2: { idx: 1, name: "HO DAK MI 4", lat: 15.45285, lon: 107.83250 },
    3: { idx: 2, name: "HO SONG BUNG 4", lat: 15.69800, lon: 107.63943 }, // đập Sông Bung 4 – OSM way 479647796
    4: { idx: 3, name: "HO SONG TRANH 2", lat: 15.33081, lon: 108.14814 }, // đập Sông Tranh 2 – OSM relation 20743406
    7: { idx: 4, name: "HO SONG BUNG 4A", lat: 15.765, lon: 107.679 },
    8: { idx: 5, name: "HO SONG BUNG 5", lat: 15.808, lon: 107.7473 },
    9: { idx: 6, name: "HO SONG BUNG 2", lat: 15.7145, lon: 107.3970 },
    11: { idx: 7, name: "HO SONG BUNG 6", lat: 15.82, lon: 107.78 },
    12: { idx: 8, name: "HO SONG TRANH 3", lat: 15.4445, lon: 108.1430 },
    13: { idx: 9, name: "HO ZA HUNG", lat: 15.86005, lon: 107.654 },
    14: { idx: 10, name: "HO DAK MI 3", lat: 15.31906, lon: 107.82574 }, // đập Đak Mi 3 – OSM way 888875287
    15: { idx: 11, name: "HO KHE DIEN", lat: 15.68774, lon: 107.94407 }, // cửa ra Hồ Khe Diên – OSM relation 6432423
    16: { idx: 12, name: "HO SONG CON 2", lat: 15.93340, lon: 107.80839 }, // đập Sông Côn 2 – OSM way 390411207
    17: { idx: 13, name: "HO SONG TRANH 4", lat: 15.52654, lon: 108.14800 }, // đập Sông Tranh 4 – OSM way 1472001972
    18: { idx: 14, name: "HO DAK MI 2", lat: 15.22856, lon: 107.81578 }, // đập Đak Mi 2 – OSM way 1320783922
    19: { idx: 15, name: "HO DAK MI 4C", lat: 15.4643, lon: 107.92893 },
};
