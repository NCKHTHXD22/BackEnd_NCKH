import RainLake from '../core/entities/RainLake.js';
import RainHistory from '../core/entities/RainHistory.js';
import rainLakeHistoryRepo from '../infrastructure/repositories/rainLakeHistory.repo.js';

const POWER = 2;

/* ================== distance ================== */
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

class RainLakeHistoryService {
  /* ========= sinh lịch sử tại 1 thời điểm ========= */
  async generateAt(timestamp) {
    const lakes = await RainLake.find();
    if (!lakes.length) {
      console.warn('⚠️ Không có RainLake');
      return;
    }

    const histories = await RainHistory.find({
      timestamp: { $lte: timestamp }
    }).sort({ timestamp: -1 });

    for (const lake of lakes) {
      const existed = await rainLakeHistoryRepo.exists(
        lake.Id_Lake,
        timestamp
      );
      if (existed) continue;

      const sources = this.mapSources(lake.Id_Lake, histories);
      const sumDepth = idw(lake, sources);

      await rainLakeHistoryRepo.create({
        Id_Lake: lake.Id_Lake,
        lakeName: lake.name,
        sumDepth,
        timestamp
      });

      console.log(
        `📊 [HISTORY] Hồ ${lake.Id_Lake} @ ${timestamp.toISOString()} → ${sumDepth}`
      );
    }
  }

  /* ========= BACKFILL TOÀN BỘ QUÁ KHỨ ========= */
  async backfillFromRainHistory() {
    const lakes = await RainLake.find();
    if (!lakes.length) {
      console.warn('⚠️ Không có RainLake');
      return;
    }

    const timestamps = await RainHistory.distinct('timestamp');
    timestamps.sort((a, b) => new Date(a) - new Date(b));

    console.log(`⏳ Backfill ${timestamps.length} mốc thời gian...`);

    for (const ts of timestamps) {
      const histories = await RainHistory.find({
        timestamp: { $lte: ts }
      }).sort({ timestamp: -1 });

      for (const lake of lakes) {
        const existed = await rainLakeHistoryRepo.exists(lake.Id_Lake, ts);
        if (existed) continue;

        const sources = this.mapSources(lake.Id_Lake, histories);
        const sumDepth = idw(lake, sources);

        await rainLakeHistoryRepo.create({
          Id_Lake: lake.Id_Lake,
          lakeName: lake.name,
          sumDepth,
          timestamp: ts
        });
      }

      console.log(`✔ Backfill @ ${new Date(ts).toISOString()}`);
    }

    console.log('✅ Backfill RainLakeHistory hoàn tất');
  }

  /* ========= mapping hồ → trạm ========= */
  mapSources(Id_Lake, histories) {
    const pick = uuids =>
      histories
        .filter(h => uuids.includes(h.uuid))
        .map(h => ({
          lat: h.lat,
          lon: h.lon,
          sumDepth: h.sumDepth || 0
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
