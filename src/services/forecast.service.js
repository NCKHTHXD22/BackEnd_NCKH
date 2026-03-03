import ForecastRepo from '../infrastructure/repositories/forecast.repo.js';

export default class ForecastService {
  constructor() {
    this.repo = new ForecastRepo();
  }

  // ========= GET =========
  async getAll() {
    const docs = await this.repo.getAll();
    return docs.map(d => this.normalize(d));
  }

  async getById(id) {
    const doc = await this.repo.getById(id);
    return doc ? this.normalize(doc) : null;
  }

  async getByReservoirId(reservoirId) {
    const docs = await this.repo.getByReservoirId(Number(reservoirId));
    return docs.map(d => this.normalize(d));
  }

  // ========= POST =========
  async create(data) {
    const doc = this.mapFromClient(data);
    return this.normalize(await this.repo.create(doc));
  }

  async bulkCreate(dataArray) {
    const docs = dataArray
      .map(item => this.mapFromClient(item))
      .filter(Boolean);

    return this.repo.bulkCreate(docs);
  }

  // ========= PUT =========
  async update(id, data) {
    const update = {};

    if (data.Value != null) update.value = data.Value;
    if (data.P10 != null) update.p10 = data.P10;
    if (data.P90 != null) update.p90 = data.P90;

    if (data.Actual != null) {
      update.actual = data.Actual;
      update.error = Math.abs(update.value - data.Actual);
      update.percentError = update.value
        ? (update.error / update.value) * 100
        : null;
    }

    return this.normalize(await this.repo.update(id, update));
  }

  delete(id) {
    return this.repo.delete(id);
  }

  // ========= HELPERS (BẮT BUỘC) =========

  mapFromClient = (item) => {
    if (
      !item ||
      item.ReservoirId == null ||
      !item.TargetTime ||
      item.Value == null
    ) return null;

    const hasActual = item.Actual != null;
    const hasError = item.Error != null;
    const hasPercent = item.PercentError != null;

    let actual = null, error = null, percentError = null;

    if (hasActual && hasError && hasPercent) {
      actual = item.Actual;
      error = item.Error;
      percentError = item.PercentError;
    } else if (hasActual) {
      error = Math.abs(item.Value - item.Actual);
      percentError = item.Value
        ? (error / item.Value) * 100
        : null;
      actual = item.Actual;
    }

    return {
      reservoirId: item.ReservoirId,
      targetTime: new Date(item.TargetTime),
      value: item.Value,
      p10: item.P10 ?? null,
      p90: item.P90 ?? null,
      actual,
      error,
      percentError,
      createdAt: item.CreatedAt
        ? new Date(item.CreatedAt)
        : new Date()
    };
  };

  normalize = (doc) => ({
    ReservoirId: doc.reservoirId,
    TargetTime: doc.targetTime,
    Value: doc.value,
    P10: doc.p10 ?? null,
    P90: doc.p90 ?? null,
    CreatedAt: doc.createdAt,
    Actual: doc.actual ?? null,
    Error: doc.error ?? null,
    PercentError: doc.percentError ?? null
  });
}
