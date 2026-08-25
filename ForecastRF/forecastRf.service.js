import forecastRfRepo from '../infrastructure/repositories/forecastRf.repo.js';

export const getForecastsByLakeId = async (id_lake) => {
    if (!id_lake) {
        throw new Error('Thiếu ID hồ chứa');
    }
    return await forecastRfRepo.findByLakeId(Number(id_lake));
};

export const getLatestForecastByLakeId = async (id_lake) => {
    if (!id_lake) {
        throw new Error('Thiếu ID hồ chứa');
    }
    return await forecastRfRepo.findLatestByLakeId(Number(id_lake));
};
