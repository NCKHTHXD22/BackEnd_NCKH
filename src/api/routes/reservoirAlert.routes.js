import express from 'express';
import controller from '../controller/reservoirAlert.controller.js';

const router = express.Router();

router.get('/',        controller.getAlerts);    // Trạng thái hiện tại tất cả hồ
router.get('/logs',    controller.getLogs);      // Lịch sử vận hành
router.post('/check',  controller.triggerCheck); // Trigger thủ công

export default router;
