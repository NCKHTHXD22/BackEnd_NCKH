import { BaseRepository } from './base.repo.js';
import ForecastLSTM from '../../core/entities/ForecastLSTM.js';

export class ForecastLstmRepository extends BaseRepository {
    constructor() {
        super(ForecastLSTM);
    }

    async findByLakeId(Id_Lake) {
        // Only return forecasts from 1 hour ago onward (current + future 12h window)
        const cutoff = new Date(Date.now() - 60 * 60 * 1000);
        return this.model.find({ Id_Lake, forecastTime: { $gte: cutoff } }).sort({ forecastTime: 1 });
    }

    async findLatestByLakeId(Id_Lake) {
        return this.model.find({ Id_Lake }).sort({ forecastTime: -1 }).limit(1);
    }
}

export default new ForecastLstmRepository();
