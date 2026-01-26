import express from 'express';
import {
  getByLake,
  getByRange
} from '../controller/rainLakeHistory.controller.js';

const router = express.Router();

router.get('/:Id_Lake', getByLake);
router.get('/:Id_Lake/range', getByRange);

export default router;
