import Forecast from '../../core/entities/Forecast.js';

export default class ForecastRepo {
  getAll() {
    return Forecast.find().sort({ targetTime: 1 });
  }

  getById(id) {
    return Forecast.findById(id);
  }

  getByReservoirId(reservoirId) {
    return Forecast.find({ reservoirId }).sort({ targetTime: 1 });
  }

  create(doc) {
    return Forecast.create(doc);
  }

  bulkCreate(docs) {
    return Forecast.insertMany(docs, { ordered: false });
  }

  update(id, data) {
    return Forecast.findByIdAndUpdate(id, data, { new: true });
  }

  delete(id) {
    return Forecast.findByIdAndDelete(id);
  }
}
