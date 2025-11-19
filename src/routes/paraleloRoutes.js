import express from 'express';
import { ParaleloController } from '../controllers/academicControllers.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// GET /api/paralelo?grado_id=1&anio=2024
router.get(
  '/',
  authorize('paralelo.leer'),
  ParaleloController.listar
);

router.get(
  '/:id',
  authorize('paralelo.leer'),
  ParaleloController.obtenerPorId
);

router.post(
  '/',
  authorize('paralelo.crear'),
  logActivity('crear', 'paralelo'),
  ParaleloController.crear
);

router.put(
  '/:id',
  authorize('paralelo.actualizar'),
  logActivity('actualizar', 'paralelo'),
  ParaleloController.actualizar
);

router.delete(
  '/:id',
  authorize('paralelo.eliminar'),
  logActivity('eliminar', 'paralelo'),
  ParaleloController.eliminar
);

export default router;
