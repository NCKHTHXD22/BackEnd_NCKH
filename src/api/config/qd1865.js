/**
 * Quy trình vận hành liên hồ chứa trên lưu vực sông Vu Gia – Thu Bồn
 * Quyết định số 1865/QĐ-TTg ngày 23/12/2019 của Thủ tướng Chính phủ (thay thế QĐ 1537/QĐ-TTg ngày 07/9/2015).
 * Nguồn: Documents/1865.signed.pdf (bản scan, chép tay từ Phụ lục I, II, III và các Điều 2, 6–13, 19–25).
 *
 * Số liệu ở đây là NGUỒN CHÍNH THỨC cho thông số hồ (seedLakeSpecs.js lấy theo) và quy tắc vận hành
 * (src/services/lienHo1865.js). Khi sửa, ghi rõ trang/điều tương ứng.
 */

export const DECISION = {
    number: '1865/QĐ-TTg',
    date: '2019-12-23',
    title: 'Quy trình vận hành liên hồ chứa trên lưu vực sông Vu Gia - Thu Bồn',
    replaces: '1537/QĐ-TTg ngày 07/9/2015',
};

// Mùa lũ 01/9 – 15/12; mùa cạn 16/12 – 31/8 (Điều 2)
export const FLOOD_SEASON = { start: '09-01', end: '12-15' };

// Trạm thủy văn quyết định vận hành (Điều 6 khoản 1, 4). Mực nước quyết định = trung bình (BĐ II + BĐ III)
// của từng trạm theo quy định cấp báo động lũ hiện hành – CẦN NHẬP ngưỡng báo động của 4 trạm.
export const CONTROL_STATIONS = {
    vugia: ['Hội Khách', 'Ái Nghĩa'],   // dùng cho A Vương, Đắk Mi 4, Sông Bung 4, Sông Bung 2 (Điều 8)
    thubon: ['Nông Sơn', 'Câu Lâu'],    // dùng cho Sông Tranh 2 (Điều 9)
};

/**
 * Phụ lục I – Bảng thông số kỹ thuật chủ yếu (19 hồ). Khóa: lake_id trong hệ thống; hồ chưa có trong hệ thống
 * dùng mã chữ (AV3, DM4B, SC2B1).
 *  area_km2 diện tích lưu vực; q0 lưu lượng TB nhiều năm (m³/s); peak_q lưu lượng đỉnh lũ theo tần suất P (%);
 *  flood_level mực nước lớn nhất ứng với tần suất P (%); check_P tần suất lũ kiểm tra theo Điều 1;
 *  W_total/W_useful/W_dead (10⁶ m³); dam: loại, cao trình đỉnh, chiều cao max, chiều dài theo đỉnh;
 *  gates: số khoang × (rộng × cao) tràn có cửa van, gate_sill cao trình ngưỡng; free_sill/free_width tràn tự do;
 *  q_plant Q lớn nhất qua nhà máy (m³/s), mw công suất lắp máy, units số tổ máy.
 */
export const LAKES = {
    1: { name: 'A Vương', area_km2: 682, q0: 39.8, peak_q: { 0.1: 7120, 0.5: 5720 }, MNDBT: 380.0, MNC: 340.0,
        flood_level: { 0.1: 382.2 }, check_P: 0.1, W_total: 343.55, W_useful: 266.48, W_dead: 77.07,
        dam: { type: 'Bê tông đầm lăn RCC', crest: 383.4, height: 80.0, length: 228.1 },
        gates: { n: 3, width: 14, height: 17.5 }, gate_sill: 363, q_plant: 78.4, mw: 210.0, units: 2 },
    4: { name: 'Sông Tranh 2', area_km2: 1100, q0: 114.0, peak_q: { 0.1: 14100, 0.5: 10300 }, MNDBT: 175.0, MNC: 140.0,
        flood_level: { 0.1: 178.51, 0.5: 175.76 }, check_P: 0.1, W_total: 729.2, W_useful: 521.1, W_dead: 208.1,
        dam: { type: 'Bê tông', crest: 180.0, height: 96.0, length: 640.0 },
        gates: { n: 6, width: 14, height: 14 }, gate_sill: 161.0, q_plant: 245.0, mw: 190.0, units: 2 },
    2: { name: 'Đắk Mi 4', area_km2: 1125, q0: 67.8, peak_q: { 0.1: 11400, 0.5: 8840 }, MNDBT: 258.0, MNC: 240.0,
        flood_level: { 0.1: 260.33, 0.5: 258.20 }, check_P: 0.1, W_total: 312.38, W_useful: 158.26, W_dead: 154.12,
        dam: { type: 'Bê tông', crest: 262.0, height: 90.0, length: 556.8 },
        gates: { n: 5, width: 14, height: 16 }, gate_sill: 242.5, q_plant: 128.0, mw: 148.0, units: 2 },
    3: { name: 'Sông Bung 4', area_km2: 1448, q0: 73.7, peak_q: { 0.02: 15427, 0.1: 12008 }, MNDBT: 222.5, MNC: 205.0,
        flood_level: { 0.02: 228.11 }, check_P: 0.02, W_total: 510.8, W_useful: 233.99, W_dead: 276.81,
        dam: { type: 'Bê tông', crest: 229.0, height: 114.0, length: null },
        gates: { n: 6, width: 12, height: 12 }, gate_sill: 210.5, q_plant: 166.0, mw: 156.0, units: 2 },
    7: { name: 'Sông Bung 4A', area_km2: 2276, q0: 91.8, peak_q: { 0.1: 11658, 0.2: 10496, 1: 9086 }, MNDBT: 97.40, MNC: 95.40,
        flood_level: { 0.1: 99.95, 0.2: 98.87, 1: 97.41 }, check_P: 0.1, W_total: 10.6, W_useful: 1.58, W_dead: 9.02,
        dam: { type: 'Bê tông', crest: 101.0, height: 46.0, length: 85.0 },
        gates: { n: 5, width: 15, height: 17 }, gate_sill: 81.4, q_plant: 166.4, mw: 49.0, units: 2 },
    8: { name: 'Sông Bung 5', area_km2: 2369, q0: 118.0, peak_q: { 0.1: 16991, 0.5: 13222, 1: 11866 }, MNDBT: 60.0, MNC: 58.5,
        // Phụ lục I ghi MN ứng P=0,5% là 64,0 m và P=1% là 67,22 m (không đơn điệu) – chép đúng bản gốc, cần kiểm tra lại
        flood_level: { 0.5: 64.0, 1: 67.22 }, check_P: 0.1, W_total: 20.27, W_useful: 2.45, W_dead: 17.82,
        dam: { type: 'Bê tông', crest: 68.0, height: 41.5, length: 158.87 },
        gates: { n: 6, width: 13, height: 15 }, gate_sill: 45.0, q_plant: 239.24, mw: 57.0, units: 2 },
    9: { name: 'Sông Bung 2', area_km2: 334.0, q0: 18.7, peak_q: { 0.1: 5208, 0.2: 4734, 0.5: 3931, 1: 3393 }, MNDBT: 605.0, MNC: 565.0,
        flood_level: { 0.1: 608.11 }, check_P: 0.1, W_total: 94.3, W_useful: 73.9, W_dead: 20.4,
        dam: { type: 'Bê tông', crest: 609.0, height: 96.0, length: 477.0 },
        gates: { n: 3, width: 12, height: 14 }, gate_sill: 591.0, q_plant: 34.5, mw: 100.0, units: 2 },
    11: { name: 'Sông Bung 6', area_km2: 2386, q0: 119, peak_q: { 0.1: 17011, 0.2: 14883, 0.5: 13254, 1: 11914 }, MNDBT: 31.8, MNC: 31.8,
        flood_level: { 0.1: 49.98, 0.2: 48.33, 1: 45.89 }, check_P: 0.1, W_total: 3.29, W_useful: 0, W_dead: 3.29,
        dam: { type: 'Bê tông', crest: 50, height: 39.2, length: 294.5 },
        free_sill: 31.8, free_width: 110, q_plant: 239.8, mw: 29, units: 2 },
    AV3: { name: 'A Vương 3', area_km2: 258.4, q0: 16.4, peak_q: { 0.5: 2854, 1.5: 2481 }, MNDBT: 552.5, MNC: 551.6,
        flood_level: { 0.5: 559.45, 1.5: 558.69 }, check_P: 0.5, W_total: 2.94, W_useful: 0.44, W_dead: 2.5,
        dam: { type: 'Bê tông', crest: 559.9, height: 22.9, length: null },
        free_sill: 552.5, free_width: 60, q_plant: 22.7, mw: 1.04, units: 2 },
    13: { name: 'Za Hung', area_km2: 537, q0: 34.1, peak_q: { 0.2: 5250, 1: 4084 }, MNDBT: 450, MNC: 445,
        flood_level: { 0.2: 457.27 }, check_P: 0.2, W_total: 1.12, W_useful: 0.74, W_dead: 0.38,
        dam: { type: 'Bê tông', crest: 458, height: 25, length: null },
        gates: { n: 2, width: 6, height: 8 }, gate_sill: 432, free_sill: 450, free_width: 99 /* 6×16,5 */,
        safety_level: 455.94 /* Điều 7, 10, 11 */, q_plant: 53.4, mw: 30, units: 2 },
    18: { name: 'Đắk Mi 2', area_km2: 445, q0: 28.4, peak_q: { 0.1: 6470, 0.5: 5070 }, MNDBT: 630, MNC: 624,
        flood_level: { 0.1: 635.19, 0.5: 633.46 }, check_P: 0.1, W_total: 1.611, W_useful: 0.692, W_dead: 0.919,
        dam: { type: 'Bê tông', crest: 637.5, height: 30, length: 37 },
        gates: { n: 2, width: 11, height: 12 }, gate_sill: 618, free_sill: 630, free_width: 72 /* 2×36 */,
        q_plant: 44.36, mw: 98, units: 2 },
    14: { name: 'Đắk Mi 3', area_km2: 612, q0: 40.4, peak_q: { 0.2: 6670, 1: 4980 }, MNDBT: 359, MNC: 353,
        flood_level: { 0.2: 363.96, 1: 362.42 }, check_P: 0.1, W_total: 5, W_useful: 2.304, W_dead: 2.696,
        dam: { type: 'Bê tông', crest: 364.5, height: 30, length: 53 },
        free_sill: 359, free_width: 144, q_plant: 76, mw: 63, units: 2 },
    DM4B: { name: 'Đắk Mi 4b', area_km2: 29, q0: 1.1, peak_q: { 0.2: 769, 1: 621 }, MNDBT: 105.3, MNC: 105,
        flood_level: { 0.2: 107.28, 1: 106.83 }, check_P: 0.2, W_total: 0.688, W_useful: 0.066, W_dead: 0.622,
        dam: { type: 'Bê tông', crest: 110.5, height: 23.5, length: 131 },
        free_sill: 105.3, free_width: 55 /* 18+37 */, q_plant: 130, mw: 42, units: 2,
        note: 'Nhận nước nhà máy Đắk Mi 4 (Q nhà máy 130 m³/s so với lưu vực riêng 29 km²) → chuyển nước sang Thu Bồn' },
    19: { name: 'Đắk Mi 4c', area_km2: 82.6, q0: 3.39, peak_q: { 0.2: 1542, 1: 1203 }, MNDBT: 67.2, MNC: 66.2,
        flood_level: { 0.2: 68.86, 1: 67.79 }, check_P: 0.2, W_total: 2.67, W_useful: 0.52, W_dead: 2.15,
        dam: { type: 'Bê tông', crest: 70.5, height: 11.5, length: 18.25 },
        gates: { n: 2, width: 8, height: 11 }, gate_sill: 57, free_sill: 67.2, free_width: 10,
        q_plant: 140, mw: 18, units: 2, note: 'Bậc dưới Đắk Mi 4b, nhận nước Đắk Mi 4 chuyển sang' },
    12: { name: 'Sông Tranh 3', area_km2: 1450, q0: 140.6, peak_q: { 0.1: 17019, 0.5: 13050, 1: 11415 }, MNDBT: 71.5, MNC: 70.5,
        flood_level: { 0.1: 75.9, 0.5: 72.8 }, check_P: 0.1, W_total: 34.1, W_useful: 3.1, W_dead: 31.0,
        dam: { type: 'Bê tông', crest: 76.5, height: 36.5, length: 184.44 },
        gates: { n: 6, width: 15, height: 16 }, gate_sill: 55.5, q_plant: 301.6, mw: 62.0, units: 2 },
    17: { name: 'Sông Tranh 4', area_km2: 1610, q0: 154.70, peak_q: { 0.1: 18062, 0.2: 17921, 0.5: 13880, 1: 13767 }, MNDBT: 46.50, MNC: 45.50,
        flood_level: {}, check_P: 0.2, W_total: 24.81, W_useful: 3.32, W_dead: 21.49,
        dam: { type: 'Bê tông', crest: 52.5, height: 25.0, length: 64.5 },
        gates: { n: 9, width: 14, height: 16.5 }, gate_sill: 30.0, q_plant: 298.0, mw: 48.0, units: 2,
        note: 'Phụ lục I không ghi mực nước lũ kiểm tra' },
    15: { name: 'Khe Diên', area_km2: 72.0, q0: 4.02, peak_q: { 0.2: 2160, 1: 1770 }, MNDBT: 206.94, MNC: 187.40,
        flood_level: { 0.2: 211.78, 1: 211.20 }, check_P: 0.2, W_total: 50.98, W_useful: 50.35, W_dead: 0.63,
        dam: { type: 'Bê tông', crest: 212.3, height: 41.0, length: 204.0 },
        free_sill: 206.94, free_width: 80, q_plant: 11.3, mw: 9.0, units: 2 },
    SC2B1: { name: 'Sông Côn 2 bậc 1', area_km2: 81.0, q0: 4.20, peak_q: { 0.2: 1917, 1: 1470 }, MNDBT: 340, MNC: 319,
        flood_level: { 0.2: 345.68, 1: 344.7 }, check_P: 0.2, W_total: 29.19, W_useful: 25.41, W_dead: 3.78,
        dam: { type: 'Bê tông', crest: 346.7, height: 48.0, length: 167.0 },
        free_sill: 340.0, free_width: 60, q_plant: 9.7, mw: 3.0, units: 2 },
    16: { name: 'Sông Côn 2 (bậc 2)', area_km2: 250.1, q0: 13.0, peak_q: { 0.2: 4121, 1: 3217 }, MNDBT: 278, MNC: 276,
        flood_level: { 0.2: 281.97, 1: 280.9 }, check_P: 0.2, W_total: 1.2, W_useful: 0.7, W_dead: 0.5,
        dam: { type: 'Bê tông', crest: 283.5, height: 16.5, length: 125.0 },
        gates: { n: 4, width: 12, height: 8 }, gate_sill: 271.0, free_sill: 278.0, free_width: 44,
        q_plant: 25.0, mw: 60.0, units: 3,
        note: 'Hồ "Sông Côn 2" trong hệ thống ứng với bậc 2 (lưu vực 250 km², 60 MW); bậc 1 là SC2B1' },
};

/** Phụ lục II – Quan hệ Z ~ F ~ W chính thức (Z: m, F: km², W: 10⁶ m³) */
export const ZFW = {
    1: { z: [306, 310, 320, 330, 340, 345, 350, 355, 360, 365, 370, 375, 380, 385, 390, 395, 400],
         f: [0, 0.31, 1.89, 3.30, 4.34, 4.89, 5.47, 6.02, 6.61, 7.24, 7.89, 8.48, 9.09, 9.75, 10.40, 11.05, 11.66],
         w: [0, 0.66, 11.96, 38.90, 77.07, 100.13, 126.01, 154.73, 186.29, 220.90, 258.72, 299.63, 343.55, 390.64, 441.01, 494.62, 551.39] },
    4: { z: [89.5, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200],
         f: [0, 0.02, 0.49, 1.06, 1.97, 3.17, 4.14, 5.02, 6.02, 7.09, 8.15, 9.27, 10.49, 12.18, 13.87, 15.53, 17.41, 19.42, 21.52, 23.66, 25.98, 28.75, 31.11, 33.81],
         w: [0, 0, 1.02, 4.80, 12.26, 24.99, 43.21, 66.08, 93.64, 126.38, 164.45, 207.97, 257.34, 313.96, 379.04, 452.50, 534.81, 626.83, 729.14, 842.05, 966.10, 1102.87, 1252.48, 1414.73] },
    2: { z: [175, 180, 185, 190, 195, 200, 205, 210, 215, 220, 225, 230, 235, 240, 245, 250, 255, 260, 265, 270],
         f: [0, 0.09, 0.28, 0.66, 0.91, 1.26, 1.56, 1.92, 2.33, 2.95, 3.93, 5.08, 6.31, 7.10, 8.00, 8.91, 9.97, 10.80, 11.84, 12.87],
         w: [0, 0.22, 1.14, 3.49, 7.39, 12.81, 19.87, 28.57, 39.19, 52.39, 69.60, 92.14, 120.61, 154.12, 191.86, 234.13, 281.31, 333.09, 389.68, 451.45] },
    3: { z: [125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205, 210, 215, 220, 225, 230, 235, 240, 245, 250],
         f: [0.159, 0.338, 0.448, 0.589, 0.784, 1.055, 1.298, 1.649, 2.231, 3.104, 3.926, 4.593, 5.649, 6.817, 8.056, 9.387, 10.8, 12.26, 13.7, 15.27, 16.03, 18.8, 20.48, 22.25, 24.17, 26.32],
         w: [0.265, 1.48, 3.438, 6.022, 9.443, 14.02, 19.89, 27.24, 36.91, 50.18, 67.72, 88.99, 114.6, 145.7, 182.8, 226.4, 276.8, 334.4, 399.3, 471.7, 549.9, 636.9, 735.1, 841.8, 957.8, 1084] },
    9: { z: [517, 520, 525, 530, 535, 540, 545, 550, 555, 560, 565, 570, 575, 580, 585, 590, 595, 600, 605, 610, 615, 620],
         f: [0.02, 0.03, 0.13, 0.20, 0.28, 0.36, 0.45, 0.56, 0.72, 0.86, 1.00, 1.16, 1.34, 1.58, 1.8, 2.05, 2.31, 2.6, 2.91, 3.28, 3.64, 4.04],
         w: [0.05, 0.11, 0.49, 1.31, 2.5, 4.09, 6.11, 8.64, 11.81, 15.76, 20.39, 25.8, 32.09, 39.37, 47.78, 57.38, 68.26, 80.52, 94.32, 109.8, 127.1, 146.55] },
};

/** Điều 6 – Bảng 1 (mực nước cao nhất trước lũ) và Bảng 2 (mực nước đón lũ thấp nhất), m.
 *  early = 01/9–15/11; late = 16/11–15/12 (Bảng 1 late là khoảng [từ, đến]). */
export const FLOOD_LEVELS = {
    1: { pre_flood_max: { early: 376.0, late: [377.0, 380.0] }, min_flood_level: { early: 370.0, late: 377.0 } },
    2: { pre_flood_max: { early: 255.0, late: [256.0, 258.0] }, min_flood_level: { early: 251.5, late: 256.0 } },
    4: { pre_flood_max: { early: 172.0, late: [173.0, 175.0] }, min_flood_level: { early: 165.0, late: 173.0 } },
    3: { pre_flood_max: { early: 217.5, late: [218.5, 222.5] }, min_flood_level: { early: 216.0, late: 218.5 } },
    9: { pre_flood_max: { early: 600.0, late: [602.0, 605.0] }, min_flood_level: { early: 595.0, late: 602.0 } },
};

/** Điều 7 khoản 2a, Điều 8, Điều 9 – ngưỡng lưu lượng về hồ (m³/s):
 *  trigger: "xuất hiện lũ về hồ" khi không có dự báo; maintain: [từ, đến] → duy trì mực nước; cut: > cut → cắt, giảm lũ.
 *  stations: trạm thủy văn dùng kèm. */
export const FLOW_RULES = {
    1: { trigger: 450, maintain: [450, 600], cut: 600, stations: 'vugia' },
    2: { trigger: 550, maintain: [550, 700], cut: 700, stations: 'vugia' },
    3: { trigger: 550, maintain: [550, 700], cut: 700, stations: 'vugia' },
    9: { trigger: 150, maintain: [150, 200], cut: 200, stations: 'vugia' },
    4: { trigger: 900, maintain: [900, 1500], cut: 1500, stations: 'thubon' },
};

/** Điều 10 – các hồ phối hợp: nhóm 1 xả = Q đến (±10%) khi hồ bậc trên giảm lũ; nhóm 2 phối hợp, đạt MNDBT thì duy trì. */
export const COORDINATING = {
    follow_inflow: [7, 8, 11, 12, 17, 13, 14, 16],   // SB4A, SB5, SB6, ST3, ST4, Za Hung, ĐM3, Sông Côn 2 bậc 2
    cooperate: ['AV3', 18, 'DM4B', 19, 15, 'SC2B1'], // A Vương 3, ĐM2, ĐM4b, ĐM4c, Khe Diên, Sông Côn 2 bậc 1
};

/** Điều 13 – mùa lũ, điều kiện bình thường: tổng Q xả trung bình ngày tối thiểu (m³/s). 'inflow' = bằng Q đến (±10%). */
export const MIN_FLOW_FLOOD_SEASON = {
    1: 15, 3: 25, 4: 27, SC2B1: 1.5, 15: 2,
    2: { to_vugia: 3, note: 'Đắk Mi 4 xả liên tục về hạ du sông Vu Gia ≥ 3 m³/s' },
    7: 25, 8: 40, 11: 'inflow_when_SB5_releases',
    AV3: 'inflow', 13: 'inflow', 18: 'inflow', 14: 'inflow', DM4B: 'inflow', 19: 'inflow', 12: 'inflow', 17: 'inflow', 16: 'inflow',
};

/** Điều 17 – thời kỳ mùa cạn */
export const DRY_PERIODS = [
    { id: 'I', ranges: [['12-16', '01-31'], ['04-11', '05-10']] },
    { id: 'II', ranges: [['02-01', '04-10']] },
    { id: 'III', ranges: [['05-11', '06-10']] },
    { id: 'IV', ranges: [['06-11', '08-31']] },
];

/** Điều 19–23 – mùa cạn: Q xả trung bình ngày (m³/s) theo thời kỳ, tùy mực nước hồ so với khoảng Phụ lục III.
 *  above: không nhỏ hơn; within/below: [từ, đến]. */
export const DRY_FLOW = {
    1: { above: { I: 22, II: 26, III: 35, IV: 28 }, within: { I: [18, 22], II: [22, 26], III: [30, 35], IV: [24, 28] },
         below: { I: [15, 18], II: [18, 22], III: [25, 30], IV: [20, 24] }, hours: '≥ 12 giờ/ngày, 9h–21h' },
    3: { above: { I: 35, II: 40, III: 55, IV: 40 }, within: { I: [28, 35], II: [30, 40], III: [40, 55], IV: [30, 40] },
         below: { I: [25, 28], II: [25, 30], III: [35, 40], IV: [25, 30] }, hours: '≥ 12 giờ/ngày, 9h–21h' },
    4: { above: { I: 42, II: 50, III: 90, IV: 52 }, within: { I: [32, 42], II: [40, 50], III: [80, 90], IV: [42, 52] },
         below: { I: [27, 32], II: [35, 40], III: [70, 80], IV: [37, 42] }, hours: '≥ 7 giờ/ngày (thời kỳ III: 12 giờ)' },
    9: { above: { I: 9, II: 9, III: 13, IV: 9 }, within: { I: [6, 9], II: [6, 9], III: [10, 13], IV: [6, 9] },
         below: { I: [4, 6], II: [4, 6], III: [8, 10], IV: [4, 6] } },
    SC2B1: { above: { I: 2, II: 2, III: 4, IV: 2 }, within: { I: [1, 2], II: [1, 2], III: [2.5, 4], IV: [1, 2] },
         below: { I: [0.7, 1], II: [0.7, 1], III: [1, 2.5], IV: [0.7, 1] }, hours: '≥ 12 giờ/ngày' },
    15: { above: { I: 5, II: 5, III: 6, IV: 5 }, within: { I: [2, 5], II: [2, 5], III: [3, 6], IV: [2, 5] },
         below: { I: [1, 2], II: [1, 2], III: [2, 3], IV: [1, 2] } },
    // Đắk Mi 4 về Vu Gia (Điều 22) theo mực nước TB ngày hôm trước tại Ái Nghĩa
    2: { by_ai_nghia: [
        { below: 2.67, I_II_IV: 25, III: '25 (24/24 giờ)' },
        { between: [2.67, 2.80], I_II_IV: '≥ 16', III: 25 },
        { above: 2.80, I_II_IV: '≥ 6', III: '≥ 10' }],
        hours: 'thời kỳ I, II, IV: liên tục 21h – 9h sáng hôm sau' },
    7: { rule: 'Q xả = Q đến (±10%), ≥ 12 giờ/ngày, 9h–21h' },
    8: { I: [80, 120], II: [80, 120], IV: [80, 120], III: [120, 180], max_level: 60.0, hours: '≥ 12 giờ/ngày, 11h–23h' },
    11: { rule: 'Khi Sông Bung 5 xả: Q xả = Q đến (±10%)' },
};

/** Phụ lục III – khoảng mực nước (m) để điều hành mùa cạn, 26 thời đoạn từ 16/12 đến 31/8. */
const P3_PERIODS = [
    ['12-16', '12-20'], ['12-21', '12-31'], ['01-01', '01-10'], ['01-11', '01-20'], ['01-21', '01-31'], ['02-01', '02-10'],
    ['02-11', '02-20'], ['02-21', '02-29'], ['03-01', '03-10'], ['03-11', '03-20'], ['03-21', '03-31'], ['04-01', '04-10'],
    ['04-11', '04-20'], ['04-21', '04-30'], ['05-01', '05-10'], ['05-11', '05-20'], ['05-21', '05-31'], ['06-01', '06-10'],
    ['06-11', '06-20'], ['06-21', '06-30'], ['07-01', '07-10'], ['07-11', '07-20'], ['07-21', '07-31'], ['08-01', '08-10'],
    ['08-11', '08-20'], ['08-21', '08-31'],
];
const rep = (pairs, counts) => pairs.flatMap((p, i) => Array(counts[i]).fill(p));
const P3 = {
    1: [[375.5, 378.3], [375.5, 378.3], [375.5, 378.3], [375.5, 378.3], [375.5, 378.3], [375.5, 378.3], [375.2, 378.1], [374.5, 377.6],
        [373.7, 377.0], [372.9, 376.0], [371.9, 374.9], [370.8, 373.4], [369.4, 372.2], [368.5, 371.3], [367.4, 370.6], [366.3, 369.5],
        [364.1, 366.8], [361.5, 363.7], [358.5, 360.8], [356.3, 359.2], [354.8, 357.1], [352.8, 354.9], [351.3, 353.0], [348.9, 350.7],
        [346.1, 348.0], [343.3, 345.4]],
    2: [...Array(10).fill([254.7, 256.4]), [254.6, 256.2], [254.3, 255.9], [253.9, 255.5], [253.6, 255.1], [253.3, 254.8], [253.1, 254.6],
        [252.5, 253.8], [251.5, 252.7], [250.1, 251.4], [248.6, 250.0], [247.5, 248.9], [246.5, 247.9], [245.3, 246.7], [243.8, 245.4],
        [242.4, 244.0], [240.5, 242.5]],
    4: [...Array(6).fill([171.4, 173.5]), [171.3, 173.4], [171.2, 173.3], [170.8, 172.9], [170.3, 172.3], [169.5, 171.6], [169.1, 171.3],
        [168.3, 170.5], [167.6, 169.8], [167.0, 169.0], [166.3, 168.1], [163.1, 164.9], [159.6, 161.2], [156.3, 157.4], [154.8, 155.9],
        [152.9, 154.1], [151.1, 152.3], [149.5, 150.7], [147.5, 148.8], [145.7, 147.0], [143.2, 145.1]],
    3: [...Array(8).fill([218.0, 219.6]), [217.8, 219.4], [217.6, 219.2], [217.4, 218.9], [217.0, 218.6], [216.6, 218.2], [216.3, 217.9],
        [216.1, 217.6], [215.7, 217.1], [214.7, 216.1], [213.5, 215.2], [212.5, 214.1], [211.3, 212.8], [210.8, 212.0], [210.1, 211.2],
        [209.2, 210.4], [208.6, 209.8], [207.5, 208.7], [206.3, 207.5]],
    9: rep([[602.0, 603.0], [601.2, 602.2], [599.4, 600.4], [598.2, 599.2], [596.6, 597.7], [592.9, 594.2], [585.9, 587.3], [578.1, 580.0], [572.0, 574.2]], [2, 3, 3, 3, 3, 3, 3, 3, 3]),
    15: rep([[204.3, 205.3], [204.3, 205.3], [204.2, 205.2], [204.0, 205.1], [203.4, 204.5], [202.3, 203.7], [200.0, 201.9], [198.2, 199.9], [195.1, 197.5]], [2, 3, 3, 3, 3, 3, 3, 3, 3]),
    SC2B1: rep([[337.0, 338.0], [337.0, 338.0], [336.6, 337.6], [335.3, 336.4], [333.6, 334.8], [332.0, 333.2], [328.2, 329.7], [325.4, 327.2], [322.5, 324.5]], [2, 3, 3, 3, 3, 3, 3, 3, 3]),
};
export const DRY_LEVEL_RANGES = Object.fromEntries(Object.entries(P3).map(([k, v]) => {
    if (v.length !== P3_PERIODS.length) throw new Error(`Phụ lục III hồ ${k}: ${v.length} dòng, cần ${P3_PERIODS.length}`);
    return [k, P3_PERIODS.map((p, i) => ({ from: p[0], to: p[1], range: v[i] }))];
}));
