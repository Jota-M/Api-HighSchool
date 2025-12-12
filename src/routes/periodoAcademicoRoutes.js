import express from 'express';
import { PeriodoAcademicoController } from '../controllers/academicControllers.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// GET /api/periodo-academico - Listar periodos
router.get(
  '/',
  authorize('periodo_academico.leer'),
  PeriodoAcademicoController.listar
);

// GET /api/periodo-academico/activo - Obtener periodo activo
router.get(
  '/activo',
  authorize('periodo_academico.leer'),
  PeriodoAcademicoController.obtenerActivo
);

// GET /api/periodo-academico/:id - Obtener por ID
router.get(
  '/:id',
  authorize('periodo_academico.leer'),
  PeriodoAcademicoController.obtenerPorId
);

// POST /api/periodo-academico - Crear periodo
router.post(
  '/',
  authorize('periodo_academico.crear'),
  logActivity('crear', 'periodo_academico'),
  PeriodoAcademicoController.crear
);

// PUT /api/periodo-academico/:id - Actualizar periodo
router.put(
  '/:id',
  authorize('periodo_academico.actualizar'),
  logActivity('actualizar', 'periodo_academico'),
  PeriodoAcademicoController.actualizar
);

// DELETE /api/periodo-academico/:id - Eliminar periodo
router.delete(
  '/:id',
  authorize('periodo_academico.eliminar'),
  logActivity('eliminar', 'periodo_academico'),
  PeriodoAcademicoController.eliminar
);

// PATCH /api/periodo-academico/:id/cerrar - Cerrar periodo
router.patch(
  '/:id/cerrar',
  authorize('periodo_academico.actualizar'),
  logActivity('cerrar', 'periodo_academico'),
  PeriodoAcademicoController.cerrar
);
router.patch(
  '/:id/activar',
   authorize('periodo_academico.actualizar'),
  logActivity('cerrar', 'periodo_academico'),
   PeriodoAcademicoController.activar);

export default router;
