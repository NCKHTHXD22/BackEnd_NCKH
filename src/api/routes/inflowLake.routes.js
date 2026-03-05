import express from 'express';
import * as controller from '../controller/inflowLake.controller.js';
import liveHydroController from '../controller/liveHydro.controller.js';

const router = express.Router();

// get live hydro data from danang api for a specific lake
router.get('/live-hydro/:lakeId', liveHydroController.getLiveHydro.bind(liveHydroController));

// force sync sumDepth from history
router.post('/sync-sumdepth', controller.syncSumDepth);

// force sync hydro data from Danang API
router.post('/sync-hydro', controller.syncHydroData);

// lấy danh sách hồ
router.get('/', controller.getAll);

// lấy hồ theo Id_Lake
router.get('/:Id_Lake', controller.getByLakeId);

export default router;
