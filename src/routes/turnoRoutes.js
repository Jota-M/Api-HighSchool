import express from 'express';
import { TurnoController } from '../controllers/turnoController.js';

const router = express.Router();

// Rutas de turnos
router.get('/', TurnoController.getAll);
router.get('/:id', TurnoController.getById);
router.post('/', TurnoController.create);
router.put('/:id', TurnoController.update);
router.delete('/:id', TurnoController.delete);

export default router;