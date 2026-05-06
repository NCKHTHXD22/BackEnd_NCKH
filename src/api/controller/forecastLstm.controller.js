import * as forecastLstmService from '../../services/forecastLstm.service.js';

export const getForecasts = async (req, res) => {
    try {
        const { Id_Lake } = req.params;
        const data = await forecastLstmService.getForecastsByLakeId(Id_Lake);
        res.status(200).json(data);
    } catch (error) {
        console.error('❌ Lỗi getForecasts:', error.message);
        res.status(500).json({ message: error.message });
    }
};

export const getLatest = async (req, res) => {
    try {
        const { Id_Lake } = req.params;
        const data = await forecastLstmService.getLatestForecastByLakeId(Id_Lake);
        res.status(200).json(data);
    } catch (error) {
        console.error('❌ Lỗi getLatest:', error.message);
        res.status(500).json({ message: error.message });
    }
};
