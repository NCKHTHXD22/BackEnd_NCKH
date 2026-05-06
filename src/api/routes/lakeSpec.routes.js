import express from 'express';
import controller from '../controller/lakeSpec.controller.js';

const router = express.Router();

// Danh sách & thông số hồ
router.get('/',                         controller.getAll);
router.get('/:lakeId',                  controller.getOne);
router.get('/:lakeId/zv-curve',         controller.getZVCurve);

// Tính toán vận hành
router.get( '/:lakeId/volume',          controller.volumeFromLevel);  // ?htl=
router.get( '/:lakeId/power',           controller.calcPower);        // ?htl=&q_turbine=
router.post('/:lakeId/water-balance',   controller.waterBalance);
router.post('/:lakeId/operation-rec',   controller.operationRec);

export default router;
