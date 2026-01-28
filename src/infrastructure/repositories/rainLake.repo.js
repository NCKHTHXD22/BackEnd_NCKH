import RainLake from '../../core/entities/RainLake.js';

class RainLakeRepository {
  findAll() {
    return RainLake.find().sort({ Id_Lake: 1 });
  }

  findByLakeId(Id_Lake) {
    return RainLake.findOne({ Id_Lake });
  }

  // ✅ update cả sumDepth + level
  updateFromHistory(Id_Lake, sumDepth, level, timestamp) {
    return RainLake.findOneAndUpdate(
      { Id_Lake },
      {
        sumDepth,
        level,
        lastUpdate: timestamp
      },
      { new: true }
    );
  }
}

export default new RainLakeRepository();
