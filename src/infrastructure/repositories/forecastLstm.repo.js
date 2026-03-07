import { BaseRepository } from './base.repo.js';
import ForecastLSTM from '../../core/entities/ForecastLSTM.js';

export class ForecastLstmRepository extends BaseRepository {
    constructor() {
        super(ForecastLSTM);
    }

    async findByLakeId(Id_Lake) {
        return this.model.find({ Id_Lake }).sort({ forecastTime: 1 });
    }

    async findLatestByLakeId(Id_Lake) {
        return this.model.find({ Id_Lake }).sort({ forecastTime: -1 }).limit(1);
    }
}

export default new ForecastLstmRepository();
