import express from 'express';
import { AreaConocimientoController } from '../controllers/materiasControllers.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// GET /api/area-conocimiento
router.get(
  '/',
  authorize('area_conocimiento.leer'),
  AreaConocimientoController.listar
);

// GET /api/area-conocimiento/:id
router.get(
  '/:id',
  authorize('area_conocimiento.leer'),
  AreaConocimientoController.obtenerPorId
);

// POST /api/area-conocimiento
router.post(
  '/',
  authorize('area_conocimiento.crear'),
  logActivity('crear', 'area_conocimiento'),
  AreaConocimientoController.crear
);

// PUT /api/area-conocimiento/:id
router.put(
  '/:id',
  authorize('area_conocimiento.actualizar'),
  logActivity('actualizar', 'area_conocimiento'),
  AreaConocimientoController.actualizar
);

// DELETE /api/area-conocimiento/:id
router.delete(
  '/:id',
  authorize('area_conocimiento.eliminar'),
  logActivity('eliminar', 'area_conocimiento'),
  AreaConocimientoController.eliminar
);

export default router;