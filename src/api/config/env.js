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
    CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY || 'pk_test_YmFsYW5jZWQtY2hpY2tlbi0zLmNsZXJrLmFjY291bnRzLmRldiQ',
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || 'sk_test_5Hjv2P8a90Wv9HQjsAt85MWIEcrpszKWrJzX44xV2z',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || 'deqfckk9y',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '745627615581946',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || 't5ZzrVsusmRjtd9wewpPJQUQEKc',
    JWT_SECRET: process.env.JWT_SECRET || '8bdf1f9e47e16c67e8f74ffebcf5aa41d7b274a86bde1cd58f83b7119d384a5f5c44f17cb7721d25aeb4589b7d1e833af4dfbc899f676209ecdc260d041d2b3d',
    ADMIN_REGISTRATION_SECRET: process.env.ADMIN_REGISTRATION_SECRET || 'abc123supersecret987',
    PYTHON_API_URL: process.env.PYTHON_API_URL || 'http://103.107.182.191:8000/predict'
};