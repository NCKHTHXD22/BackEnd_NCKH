import { BaseRepository } from '../src/infrastructure/repositories/base.repo.js';
import ForecastXGB from './ForecastXGB.js';

export class ForecastXgbRepository extends BaseRepository {
    constructor() {
        super(ForecastXGB);
    }

    async findByLakeId(Id_Lake) {
        // 48h back, matching forecastLstm.repo/forecastRf.repo — UI charts past forecasts
        // against the observed line, so it needs the hindcast rows, not just the live window.
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        return this.model.find({ Id_Lake, forecastTime: { $gte: cutoff } }).sort({ forecastTime: 1 });
    }

    async findLatestByLakeId(Id_Lake) {
        return this.model.find({ Id_Lake }).sort({ forecastTime: -1 }).limit(1);
    }
}

export default new ForecastXgbRepository();
