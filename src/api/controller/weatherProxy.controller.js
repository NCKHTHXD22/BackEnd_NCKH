import { weatherProxyService } from "../../services/weatherProxy.service.js";

export const getCurrentWeather = async (req, res, next) => {
    try {
        const { lat, lon, lang } = req.query;
        if (!lat || !lon) return res.status(400).json({ message: "Thiếu lat/lon" });
        res.json(await weatherProxyService.current({ lat, lon, lang }));
    } catch (err) {
        next(err);
    }
};

export const getForecastWeather = async (req, res, next) => {
    try {
        const { lat, lon, cnt } = req.query;
        if (!lat || !lon) return res.status(400).json({ message: "Thiếu lat/lon" });
        res.json(await weatherProxyService.forecast({ lat, lon, cnt }));
    } catch (err) {
        next(err);
    }
};

export const getUvIndex = async (req, res, next) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) return res.status(400).json({ message: "Thiếu lat/lon" });
        res.json(await weatherProxyService.uvi({ lat, lon }));
    } catch (err) {
        next(err);
    }
};
