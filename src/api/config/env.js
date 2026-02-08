import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
    PORT : process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    MONGODB_URI: process.env.MONGODB_URI,
    RAIN_STATION_API: process.env.RAIN_STATION_API,
    VRAIN_COOKIE: process.env.VRAIN_COOKIE,
};