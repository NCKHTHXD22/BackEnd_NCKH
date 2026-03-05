// src/infrastructure/repositories/rainLakeHistory.repo.js
import RainLakeHistory from '../../core/entities/RainLakeHistory.js';

class RainLakeHistoryRepository {
  upsert({ Id_Lake, lakeName, sumDepth, level, timestamp }) {
    return RainLakeHistory.findOneAndUpdate(
      { Id_Lake, timestamp },
      {
        $set: {
          lakeName,
          sumDepth,
          level
        }
      },
      { upsert: true, new: true }
    );
  }

  getByLake(Id_Lake) {
    return RainLakeHistory.find({ Id_Lake }).sort({ timestamp: -1 });
  }

  getLatestByLake(Id_Lake) {
    return RainLakeHistory.findOne({ Id_Lake }).sort({ timestamp: -1 });
  }

  getByLakeAndRange(Id_Lake, from, to) {
    return RainLakeHistory.find({
      Id_Lake,
      timestamp: { $gte: from, $lte: to }
    }).sort({ timestamp: 1 });
  }
}

export default new RainLakeHistoryRepository();
