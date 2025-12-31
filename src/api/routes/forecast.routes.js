import express from 'express';
import * as c from '../controller/forecast.controller.js';

const router = express.Router();

router.get('/', c.getAll);
router.get('/:id', c.getById);
router.get('/reservoir/:reservoirId', c.getByReservoirId);

router.post('/', c.create);
router.post('/bulk', c.bulkCreate);

router.put('/:id', c.update);
router.delete('/:id', c.remove); 

export default router;
