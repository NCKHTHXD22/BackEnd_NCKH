import express from 'express';
import { getForecasts, getLatest } from '../controller/forecastRf.controller.js';

const router = express.Router();

router.get('/:Id_Lake', getForecasts);
router.get('/:Id_Lake/latest', getLatest);

export default router;
