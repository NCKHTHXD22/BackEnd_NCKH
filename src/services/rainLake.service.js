import rainLakeRepo from '../infrastructure/repositories/rainLake.repo.js';
import rainLakeHistoryRepo from '../infrastructure/repositories/rainLakeHistory.repo.js';

class RainLakeService {
  async getAll() {
    return rainLakeRepo.findAll();
  }

  async getByLakeId(Id_Lake) {
    return rainLakeRepo.findByLakeId(Id_Lake);
  }

  /**
   * 🔥 Update RainLake từ RainLakeHistory mới nhất
   */
  async updateAllLakeFromHistory() {
    const lakes = await rainLakeRepo.findAll();

    if (!lakes.length) {
      console.warn('⚠️ Không có RainLake');
      return;
    }

    for (const lake of lakes) {
      const latest = await rainLakeHistoryRepo.getLatestByLake(lake.Id_Lake);

      if (!latest) {
        console.warn(`⚠️ Hồ ${lake.Id_Lake} chưa có RainLakeHistory`);
        continue;
      }

      await rainLakeRepo.updateFromHistory(
        lake.Id_Lake,
        latest.sumDepth,
        latest.level,
        latest.timestamp
      );

      console.log(
        `✔ Hồ ${lake.Id_Lake} ← ${latest.sumDepth}mm | ${latest.level}`
      );
    }

    console.log('✅ RainLake đã cập nhật level + sumDepth');
  }
}

export default new RainLakeService();
