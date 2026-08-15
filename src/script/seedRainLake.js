import mongoose from 'mongoose';
import InflowLake from '../core/entities/InflowLake.js';
import { ENV } from '../api/config/env.js';

/**
 * 15 hồ chứa thủy điện lưu vực Vu Gia – Thu Bồn, Đà Nẵng
 * Nguồn: QĐ 1865/QĐ-TTg (2021), hồ sơ thiết kế, dữ liệu Danang API
 *
 * ID khớp với thuydien_id của Danang API (apiv2.danang.gov.vn)
 */
const lakes = [
  // ── 4 hồ liên hồ chính (QĐ 1865/QĐ-TTg 2021) ──────────────────────────────
  {
    Id_Lake: 1,
    name: 'HỒ A VƯƠNG',
    address: 'Xã A Rooi, Đông Giang, Đà Nẵng',
    lat: 15.815,
    lon: 107.63,
    location: { type: 'Point', coordinates: [107.63, 15.815] }
  },
  {
    Id_Lake: 2,
    name: 'HỒ ĐAK MI 4',
    address: 'Xã Phước Hòa, Phước Sơn, Đà Nẵng',
    lat: 15.45285,
    lon: 107.8325,
    location: { type: 'Point', coordinates: [107.8325, 15.45285] }
  },
  {
    Id_Lake: 3,
    name: 'HỒ SÔNG BUNG 4',
    address: 'Xã Tà Pơơ, Nam Giang, Đà Nẵng',
    lat: 15.726,
    lon: 107.637,
    location: { type: 'Point', coordinates: [107.637, 15.726] }
  },
  {
    Id_Lake: 4,
    name: 'HỒ SÔNG TRANH 2',
    address: 'Xã Trà Đốc, Bắc Trà My, Đà Nẵng',
    lat: 15.326,
    lon: 108.125,
    location: { type: 'Point', coordinates: [108.125, 15.326] }
  },

  // ── 11 hồ còn lại trong lưu vực ─────────────────────────────────────────────
  {
    Id_Lake: 7,
    name: 'HỒ SÔNG BUNG 4A',
    address: 'Nam Giang, Đà Nẵng',
    lat: 15.765,
    lon: 107.679,
    location: { type: 'Point', coordinates: [107.679, 15.765] }
  },
  {
    Id_Lake: 8,
    name: 'HỒ SÔNG BUNG 5',
    address: 'Đông Giang, Đà Nẵng',
    lat: 15.808,
    lon: 107.7473,
    location: { type: 'Point', coordinates: [107.7473, 15.808] }
  },
  {
    Id_Lake: 9,
    name: 'HỒ SÔNG BUNG 2',
    address: 'Nam Giang, Đà Nẵng',
    lat: 15.7145,
    lon: 107.397,
    location: { type: 'Point', coordinates: [107.397, 15.7145] }
  },
  {
    Id_Lake: 11,
    name: 'HỒ SÔNG BUNG 6',
    address: 'Nam Giang, Đà Nẵng',
    lat: 15.82,
    lon: 107.78,
    location: { type: 'Point', coordinates: [107.78, 15.82] }
  },
  {
    Id_Lake: 12,
    name: 'HỒ SÔNG TRANH 3',
    address: 'Tiên Phước, Đà Nẵng',
    lat: 15.4445492746,
    lon: 108.1430829933,
    location: { type: 'Point', coordinates: [108.1430829933, 15.4445492746] }
  },
  {
    Id_Lake: 13,
    name: 'HỒ ZA HUNG',
    address: 'Tây Giang, Đà Nẵng',
    lat: 15.8600510624,
    lon: 107.654,
    location: { type: 'Point', coordinates: [107.654, 15.8600510624] }
  },
  {
    Id_Lake: 14,
    name: 'HỒ ĐĂK MI 3',
    address: 'Phước Sơn, Đà Nẵng',
    lat: 15.33,
    lon: 107.81,
    location: { type: 'Point', coordinates: [107.81, 15.33] }
  },
  {
    Id_Lake: 15,
    name: 'HỒ KHE DIÊN',
    address: 'Nông Sơn, Đà Nẵng',
    lat: 15.7127951682,
    lon: 107.9287281441,
    location: { type: 'Point', coordinates: [107.9287281441, 15.7127951682] }
  },
  {
    Id_Lake: 16,
    name: 'HỒ SÔNG CÔN 2',
    address: 'Đông Giang, Đà Nẵng',
    lat: 15.9055856844,
    lon: 107.8234,
    location: { type: 'Point', coordinates: [107.8234, 15.9055856844] }
  },
  {
    Id_Lake: 17,
    name: 'HỒ SÔNG TRANH 4',
    address: 'Hiệp Đức, Đà Nẵng',
    lat: 15.5366688932,
    lon: 108.152,
    location: { type: 'Point', coordinates: [108.152, 15.5366688932] }
  },
  {
    Id_Lake: 19,
    name: 'HỒ ĐĂK MI 4C',
    address: 'Phước Sơn, Đà Nẵng',
    lat: 15.4643,
    lon: 107.9289315551,
    location: { type: 'Point', coordinates: [107.9289315551, 15.4643] }
  }
];

(async () => {
  try {
    await mongoose.connect(ENV.MONGODB_URI);

    // tránh seed trùng
    await InflowLake.deleteMany({});

    await InflowLake.insertMany(lakes);

    console.log(`✅ Seed thành công ${lakes.length} hồ InflowLake`);
    process.exit();
  } catch (err) {
    console.error('❌ Seed InflowLake lỗi:', err.message);
    process.exit(1);
  }
})();
