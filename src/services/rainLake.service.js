import axios from 'axios';
import rainLakeRepo from '../infrastructure/repositories/rainLake.repo.js';
import {ENV} from '../api/config/env.js';

const POWER = 2;

/* ================== Haversine distance ================== */
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

/* ================== IDW ================== */
function idw(lake, sources) {
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

/* ================== SERVICE ================== */
class RainLakeService {
  async getAll() {
    return rainLakeRepo.findAll();
  }

  async getByLakeId(Id_Lake) {
    return rainLakeRepo.findByLakeId(Id_Lake);
  }

  async updateAllLakeSumDepth() {
    const lakes = await rainLakeRepo.findAll();

    if (!lakes || lakes.length === 0) {
      console.warn('⚠️ Không có RainLake nào trong DB');
      return;
    }

    if (!ENV.RAIN_STATION_API) {
      throw new Error('❌ Thiếu ENV.RAIN_STATION_API');
    }

    let stations = [];
    try {
      const res = await axios.get(ENV.RAIN_STATION_API, {
        timeout: 30000
      });
      stations = res.data;
    } catch (err) {
      console.error(
        '❌ Lỗi gọi rain-station:',
        err.response?.status,
        err.message
      );
      return;
    }

    for (const lake of lakes) {
      const sources = this.mapSources(lake.Id_Lake, stations);
      const sumDepth = idw(lake, sources);

      await rainLakeRepo.updateSumDepth(lake.Id_Lake, sumDepth);

      console.log(
        `✔ Hồ ${lake.Id_Lake} (${lake.name}) → sumDepth = ${sumDepth}`
      );
    }

    console.log('✅ Đồng bộ RainLake sumDepth hoàn tất');
  }

  /* ================== mapping nghiệp vụ ================== */
  mapSources(Id_Lake, stations) {
    const pick = uuids =>
      stations
        .filter(s => uuids.includes(s.uuid))
        .map(s => ({
          lat: s.location.lat,
          lon: s.location.lng,
          sumDepth: s.sumDepth || 0
        }));

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

    return pick(MAP[Id_Lake] || []);
  }
}

export default new RainLakeService();
