import express from 'express';
import { GradoController } from '../controllers/academicControllers.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// GET /api/grado?nivel_academico_id=1
router.get(
  '/',
  authorize('grado.leer'),
  GradoController.listar
);

router.get(
  '/:id',
  authorize('grado.leer'),
  GradoController.obtenerPorId
);

router.post(
  '/',
  authorize('grado.crear'),
  logActivity('crear', 'grado'),
  GradoController.crear
);

router.put(
  '/:id',
  authorize('grado.actualizar'),
  logActivity('actualizar', 'grado'),
  GradoController.actualizar
);

router.delete(
  '/:id',
  authorize('grado.eliminar'),
  logActivity('eliminar', 'grado'),
  GradoController.eliminar
);

export default router;
