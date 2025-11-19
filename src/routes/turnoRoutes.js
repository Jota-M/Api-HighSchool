import express from 'express';
import { TurnoController } from '../controllers/academicControllers.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  authorize('turno.leer'),
  TurnoController.listar
);

router.get(
  '/:id',
  authorize('turno.leer'),
  TurnoController.obtenerPorId
);

router.post(
  '/',
  authorize('turno.crear'),
  logActivity('crear', 'turno'),
  TurnoController.crear
);

router.put(
  '/:id',
  authorize('turno.actualizar'),
  logActivity('actualizar', 'turno'),
  TurnoController.actualizar
);

router.delete(
  '/:id',
  authorize('turno.eliminar'),
  logActivity('eliminar', 'turno'),
  TurnoController.eliminar
);

export default router;
