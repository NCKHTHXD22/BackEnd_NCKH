import * as forecastRfService from '../../services/forecastRf.service.js';

export const getForecasts = async (req, res) => {
    try {
        const { Id_Lake } = req.params;
        const data = await forecastRfService.getForecastsByLakeId(Id_Lake);
        res.status(200).json(data);
    } catch (error) {
        console.error('❌ Lỗi getForecasts (RF):', error.message);
        res.status(500).json({ message: error.message });
    }
};

export const getLatest = async (req, res) => {
    try {
        const { Id_Lake } = req.params;
        const data = await forecastRfService.getLatestForecastByLakeId(Id_Lake);
        res.status(200).json(data);
    } catch (error) {
        console.error('❌ Lỗi getLatest (RF):', error.message);
        res.status(500).json({ message: error.message });
    }
};
