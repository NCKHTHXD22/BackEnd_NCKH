import forecastXgbRepo from './forecastXgb.repo.js';

export const getForecastsByLakeId = async (id_lake) => {
    if (!id_lake) {
        throw new Error('Thiếu ID hồ chứa');
    }
    return await forecastXgbRepo.findByLakeId(Number(id_lake));
};

export const getLatestForecastByLakeId = async (id_lake) => {
    if (!id_lake) {
        throw new Error('Thiếu ID hồ chứa');
    }
    return await forecastXgbRepo.findLatestByLakeId(Number(id_lake));
};
