import { BaseRepository } from './base.repo.js';
import ForecastRF from '../../core/entities/ForecastRF.js';

export class ForecastRfRepository extends BaseRepository {
    constructor() {
        super(ForecastRF);
    }

    async findByLakeId(Id_Lake) {
        // 48h back, matching forecastLstm.repo — the UI charts past forecasts against
        // the observed line, so it needs the hindcast rows, not just the live window.
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        return this.model.find({ Id_Lake, forecastTime: { $gte: cutoff } }).sort({ forecastTime: 1 });
    }

    async findLatestByLakeId(Id_Lake) {
        return this.model.find({ Id_Lake }).sort({ forecastTime: -1 }).limit(1);
    }
}

export default new ForecastRfRepository();
