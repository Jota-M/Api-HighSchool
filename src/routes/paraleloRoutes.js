import express from 'express';
import { ParaleloController } from '../controllers/paraleloController.js';

const router = express.Router();

// Rutas de paralelos
router.get('/', ParaleloController.getAll);
router.get('/estadisticas', ParaleloController.getEstadisticas);
router.get('/grado/:gradoId', ParaleloController.getByGrado);
router.get('/:id', ParaleloController.getById);
router.post('/', ParaleloController.create);
router.put('/:id', ParaleloController.update);
router.delete('/:id', ParaleloController.delete);

export default router;