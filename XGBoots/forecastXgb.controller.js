import * as forecastXgbService from './forecastXgb.service.js';

export const getForecasts = async (req, res) => {
    try {
        const { Id_Lake } = req.params;
        const data = await forecastXgbService.getForecastsByLakeId(Id_Lake);
        res.status(200).json(data);
    } catch (error) {
        console.error('❌ Lỗi getForecasts (XGBoost):', error.message);
        res.status(500).json({ message: error.message });
    }
};

export const getLatest = async (req, res) => {
    try {
        const { Id_Lake } = req.params;
        const data = await forecastXgbService.getLatestForecastByLakeId(Id_Lake);
        res.status(200).json(data);
    } catch (error) {
        console.error('❌ Lỗi getLatest (XGBoost):', error.message);
        res.status(500).json({ message: error.message });
    }
};
