import express from 'express';
import * as controller from '../controller/rainLake.controller.js';

const router = express.Router();

/**
 * ⚠️ Route CỤ THỂ phải đặt TRƯỚC route động
 */

// force sync (chủ yếu để test)
router.post('/sync-sumdepth', controller.syncSumDepth);

// lấy danh sách hồ
router.get('/', controller.getAll);

// lấy hồ theo Id_Lake
router.get('/:Id_Lake', controller.getByLakeId);

export default router;
