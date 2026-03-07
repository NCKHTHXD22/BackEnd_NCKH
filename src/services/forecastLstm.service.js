import forecastLstmRepo from '../infrastructure/repositories/forecastLstm.repo.js';

export const getForecastsByLakeId = async (id_lake) => {
    if (!id_lake) {
        throw new Error('Thiếu ID hồ chứa');
    }
    return await forecastLstmRepo.findByLakeId(Number(id_lake));
};

export const getLatestForecastByLakeId = async (id_lake) => {
    if (!id_lake) {
        throw new Error('Thiếu ID hồ chứa');
    }
    return await forecastLstmRepo.findLatestByLakeId(Number(id_lake));
};
