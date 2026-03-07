import { BaseRepository } from './base.repo.js';
import ForecastLSTM from '../../core/entities/ForecastLSTM.js';

export class ForecastLstmRepository extends BaseRepository {
    constructor() {
        super(ForecastLSTM);
    }

    async findByLakeId(id_lake) {
        return this.model.find({ id_lake }).sort({ forecastTime: 1 });
    }

    async findLatestByLakeId(id_lake) {
        return this.model.find({ id_lake }).sort({ forecastTime: -1 }).limit(1);
    }
}

export default new ForecastLstmRepository();
