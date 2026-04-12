import express from 'express';
import controller from '../controller/reservoirAlert.controller.js';

const router = express.Router();

router.get('/',        controller.getAlerts);    // Trạng thái hiện tại tất cả hồ
router.get('/logs',    controller.getLogs);      // Lịch sử vận hành
router.post('/check',  controller.triggerCheck); // Trigger thủ công (POST)
router.get('/check',   controller.triggerCheck); // Trigger thủ công (GET — dễ test qua browser)

export default router;
