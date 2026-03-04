import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    MONGODB_URI: process.env.MONGODB_URI,
    RAIN_STATION_API: process.env.RAIN_STATION_API,
    VRAIN_COOKIE: process.env.VRAIN_COOKIE,
    VRAIN_ORG_UID: process.env.VRAIN_ORG_UID,
    VRAIN_USERNAME: process.env.VRAIN_USERNAME,
    VRAIN_PASSWORD: process.env.VRAIN_PASSWORD,

    // Backend Integration
    CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    JWT_SECRET: process.env.JWT_SECRET,
    ADMIN_REGISTRATION_SECRET: process.env.ADMIN_REGISTRATION_SECRET,
};