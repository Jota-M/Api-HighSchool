// routes/asignacionTransporteRoutes.js
import express from 'express';
import AsignacionTransporteController from '../controllers/asignacionTransporteController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// RUTAS DE GESTIÓN DE ASIGNACIONES
// ==========================================

/**
 * GET /api/asignacion-transporte/estadisticas
 * Obtener estadísticas de asignaciones
 * Requiere: periodo_academico_id en query
 */
router.get(
  '/estadisticas',
  authorize('transporte.leer'),
  AsignacionTransporteController.obtenerEstadisticas
);

/**
 * GET /api/asignacion-transporte/ruta/:ruta_id
 * Listar estudiantes asignados a una ruta
 * Requiere: periodo_academico_id en query
 */
router.get(
  '/ruta/:ruta_id',
  authorize('transporte.leer'),
  AsignacionTransporteController.listarPorRuta
);

/**
 * GET /api/asignacion-transporte
 * Listar asignaciones de transporte
 */
router.get(
  '/',
  authorize('transporte.leer'),
  AsignacionTransporteController.listar
);

/**
 * POST /api/asignacion-transporte
 * Crear asignación de transporte
 */
router.post(
  '/',
  authorize('transporte.crear'),
  logActivity('crear', 'transporte'),
  AsignacionTransporteController.crear
);

/**
 * GET /api/asignacion-transporte/:id
 * Obtener asignación por ID
 */
router.get(
  '/:id',
  authorize('transporte.leer'),
  AsignacionTransporteController.obtenerPorId
);

/**
 * PUT /api/asignacion-transporte/:id
 * Actualizar asignación de transporte
 */
router.put(
  '/:id',
  authorize('transporte.actualizar'),
  logActivity('actualizar', 'transporte'),
  AsignacionTransporteController.actualizar
);

/**
 * PATCH /api/asignacion-transporte/:id/estado
 * Cambiar estado de asignación
 * Body: { estado, motivo }
 */
router.patch(
  '/:id/estado',
  authorize('transporte.actualizar'),
  logActivity('cambiar_estado', 'transporte'),
  AsignacionTransporteController.cambiarEstado
);

/**
 * DELETE /api/asignacion-transporte/:id
 * Eliminar asignación (soft delete)
 */
router.delete(
  '/:id',
  authorize('transporte.eliminar'),
  logActivity('eliminar', 'transporte'),
  AsignacionTransporteController.eliminar
);

/**
 * POST /api/asignacion-transporte/:id/generar-cuotas
 * Generar cuotas mensuales de transporte
 * Body: { cantidad_meses } (opcional, default 10)
 */
router.post(
  '/:id/generar-cuotas',
  authorize('transporte.crear'),
  logActivity('generar_cuotas', 'transporte'),
  AsignacionTransporteController.generarCuotas
);

export default router;