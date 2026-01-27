import RainLake from '../core/entities/RainLake.js';
import RainHistory from '../core/entities/RainHistory.js';
import rainLakeHistoryRepo from '../infrastructure/repositories/rainLakeHistory.repo.js';

/* ================== CONFIG ================== */
const POWER = 2;

/* ================== CẢNH BÁO ================== */
function classifyRain(sumDepth) {
  if (sumDepth === 0) return 'Không mưa';
  if (sumDepth < 10) return 'Mưa nhỏ';
  if (sumDepth < 30) return 'Mưa vừa';
  return 'Mưa lớn';
}

/* ================== DISTANCE ================== */
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
  if (!sources.length) return 0;

  // ✔ 1 trạm → lấy thẳng
  if (sources.length === 1) {
    return Number(sources[0].sumDepth.toFixed(2));
  }

  // ✔ trạm trùng vị trí hồ
  const exact = sources.find(
    s => distance(lake.lat, lake.lon, s.lat, s.lon) === 0
  );
  if (exact) return Number(exact.sumDepth.toFixed(2));

  let num = 0;
  let den = 0;

  for (const s of sources) {
    const d = distance(lake.lat, lake.lon, s.lat, s.lon);
    const w = 1 / Math.pow(d, POWER);
    num += s.sumDepth * w;
    den += w;
  }

  return den === 0 ? 0 : Number((num / den).toFixed(2));
}

/* ================== SERVICE ================== */
class RainLakeHistoryService {
  /* ========= MAP HỒ → TRẠM ========= */
  mapSources(Id_Lake, latestValues, stationMeta) {
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

    return (MAP[Id_Lake] || [])
      .map(uuid => {
        const v = latestValues.find(x => x.uuid === uuid);
        const m = stationMeta.find(x => x.uuid === uuid);
        if (!v || !m) return null;

        return {
          lat: m.location.lat,
          lon: m.location.lng,
          sumDepth: v.sumDepth ?? 0
        };
      })
      .filter(Boolean);
  }

  /* ========= TẠO LỊCH SỬ TẠI 1 THỜI ĐIỂM ========= */
  async generateAt(timestamp) {
    const lakes = await RainLake.find();
    if (!lakes.length) return;

    // meta trạm (lat/lon)
    const stationMeta = await RainHistory.aggregate([
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$uuid',
          uuid: { $first: '$uuid' },
          location: { $first: '$location' }
        }
      }
    ]);

    for (const lake of lakes) {
      if (await rainLakeHistoryRepo.exists(lake.Id_Lake, timestamp)) continue;

      // lấy giá trị gần nhất ≤ timestamp cho từng trạm
      const latestValues = await RainHistory.aggregate([
        { $match: { timestamp: { $lte: timestamp } } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: '$uuid',
            uuid: { $first: '$uuid' },
            sumDepth: { $first: '$sumDepth' }
          }
        }
      ]);

      const sources = this.mapSources(
        lake.Id_Lake,
        latestValues,
        stationMeta
      );

      const sumDepth = idw(lake, sources);
      const level = classifyRain(sumDepth);

      await rainLakeHistoryRepo.create({
        Id_Lake: lake.Id_Lake,
        lakeName: lake.name,
        sumDepth,
        level,
        timestamp
      });

      console.log(
        `📊 [HISTORY] Hồ ${lake.Id_Lake} @ ${timestamp.toISOString()} → ${sumDepth} (${level})`
      );
    }
  }

  /* ========= BACKFILL TOÀN BỘ ========= */
  async backfillFromRainHistory() {
    const timestamps = await RainHistory.distinct('timestamp');
    timestamps.sort((a, b) => new Date(a) - new Date(b));

    console.log(`⏳ Backfill ${timestamps.length} mốc thời gian`);

    for (const ts of timestamps) {
      await this.generateAt(new Date(ts));
    }

    console.log('✅ Backfill RainLakeHistory hoàn tất');
  }

  /* ========= API ========= */
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
