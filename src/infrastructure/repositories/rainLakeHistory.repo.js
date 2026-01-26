import RainLakeHistory from '../../core/entities/RainLakeHistory.js';

class RainLakeHistoryRepository {
  create(data) {
    return RainLakeHistory.create(data);
  }

  getByLake(Id_Lake) {
    return RainLakeHistory.find({ Id_Lake }).sort({ timestamp: -1 });
  }

  getByLakeAndRange(Id_Lake, from, to) {
    return RainLakeHistory.find({
      Id_Lake,
      timestamp: { $gte: from, $lte: to }
    }).sort({ timestamp: 1 });
  }

  exists(Id_Lake, timestamp) {
    return RainLakeHistory.exists({ Id_Lake, timestamp });
  }
}

export default new RainLakeHistoryRepository();
