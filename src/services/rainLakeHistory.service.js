// src/services/rainLakeHistory.service.js
import RainLake from '../core/entities/RainLake.js';
import RainHistory from '../core/entities/RainHistory.js';
import RainStation from '../core/entities/RainStation.js';
import rainLakeHistoryRepo from '../infrastructure/repositories/rainLakeHistory.repo.js';

/* ===== CẤU HÌNH ===== */
const POWER = 2;

/* ===== PHÂN LOẠI ===== */
function classifyRain(sumDepth) {
  if (sumDepth === 0) return 'Không mưa';
  if (sumDepth < 10) return 'Mưa nhỏ';
  if (sumDepth < 30) return 'Mưa vừa';
  return 'Mưa lớn';
}

/* ===== BUCKET THEO GIỜ ===== */
function toHourlyBucket(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

/* ===== DISTANCE ===== */
function distance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ===== IDW ===== */
function idw(lake, sources) {
  if (!sources.length) return 0;

  // 1 trạm → lấy trực tiếp
  if (sources.length === 1) {
    return Number(sources[0].sumDepth.toFixed(2));
  }

  let num = 0;
  let den = 0;

  for (const s of sources) {
    const d = distance(lake.lat, lake.lon, s.lat, s.lon) || 1;
    const w = 1 / Math.pow(d, POWER);
    num += s.sumDepth * w;
    den += w;
  }

  return den === 0 ? 0 : Number((num / den).toFixed(2));
}

/* ===== MAP HỒ → TRẠM ===== */
const MAP = {
  1: ['ef74db45-c9d6-4469-951c-1c1181244c5b'],
  2: ['34e4a9ab-551e-48ec-9e8a-c6db736920de'],
  3: ['ef74db45-c9d6-4469-951c-1c1181244c5b'],
  4: ['afa681b5-2759-11ec-8ef9-06552145a11a'],
  7: ['ef74db45-c9d6-4469-951c-1c1181244c5b'],
  8: ['ef74db45-c9d6-4469-951c-1c1181244c5b'],
  9: [
    '20ab22bf-a524-426a-8f6e-f925fac50448',
    'afa543d5-2759-11ec-8ef9-06552145a11a'
  ],
  11: ['ef74db45-c9d6-4469-951c-1c1181244c5b'],
  12: ['afb382ed-2759-11ec-8ef9-06552145a11a'],
  13: ['ef74db45-c9d6-4469-951c-1c1181244c5b'],
  14: ['afb39de3-2759-11ec-8ef9-06552145a11a'],
  15: [
    'afb39f28-2759-11ec-8ef9-06552145a11a',
    'afaecd4b-2759-11ec-8ef9-06552145a11a'
  ],
  16: ['afa67e4a-2759-11ec-8ef9-06552145a11a'],
  17: [
    'afaee625-2759-11ec-8ef9-06552145a11a',
    'afa93924-2759-11ec-8ef9-06552145a11a'
  ],
  19: ['5d1e940b-fa75-47fa-af74-226c584e42f7']
};

class RainLakeHistoryService {
  async generateAt(rawTime) {
    const bucket = toHourlyBucket(rawTime);
    const lakes = await RainLake.find();

    for (const lake of lakes) {
      const uuids = MAP[lake.Id_Lake] || [];
      const sources = [];

      for (const uuid of uuids) {
        const latest = await RainHistory.findOne({
          uuid,
          timestamp: bucket
        });

        if (latest) {
          // Lấy lat/lon từ RainStation (RainHistory không có lat/lon)
          const station = await RainStation.findOne({ uuid });
          sources.push({
            lat: station?.location?.lat ?? 0,
            lon: station?.location?.lng ?? 0,
            sumDepth: latest.sumDepth ?? 0
          });
        }
      }

      const sumDepth = idw(lake, sources);
      const level = classifyRain(sumDepth);

      await rainLakeHistoryRepo.upsert({
        Id_Lake: lake.Id_Lake,
        lakeName: lake.name,
        sumDepth,
        level,
        timestamp: bucket
      });

      console.log(
        `📊 [HISTORY] Hồ ${lake.Id_Lake} @ ${bucket.toISOString()} → ${sumDepth}`
      );
    }
  }

  async backfillFromRainHistory() {
    const times = await RainHistory.distinct('timestamp');
    const buckets = [
      ...new Set(times.map(t => toHourlyBucket(t).toISOString()))
    ].map(t => new Date(t));

    for (const bucket of buckets) {
      await this.generateAt(bucket);
    }
  }

  getByLake(Id_Lake) {
    return rainLakeHistoryRepo.getByLake(Id_Lake);
  }

  getByRange(Id_Lake, from, to) {
    return rainLakeHistoryRepo.getByLakeAndRange(
      Id_Lake,
      new Date(from),
      new Date(to)
    );
  }
}

export default new RainLakeHistoryService();
