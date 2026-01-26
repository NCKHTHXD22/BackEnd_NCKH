import RainLake from '../../core/entities/RainLake.js';

class RainLakeRepository {
  findAll() {
    return RainLake.find().sort({ Id_Lake: 1 });
  }

  findByLakeId(Id_Lake) {
    return RainLake.findOne({ Id_Lake });
  }

  updateSumDepth(Id_Lake, sumDepth) {
    return RainLake.findOneAndUpdate(
      { Id_Lake },
      { sumDepth, lastUpdate: new Date() },
      { new: true }
    );
  }
}

export default new RainLakeRepository();
