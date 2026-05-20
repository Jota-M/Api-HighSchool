// routes/rutaTransporteRoutes.js
import express from 'express';
import RutaTransporteController from '../controllers/rutaTransporteController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// RUTAS DE GESTIÓN DE RUTAS DE TRANSPORTE
// ==========================================

/**
 * GET /api/ruta-transporte/estadisticas
 * Obtener estadísticas generales de rutas
 */
router.get(
  '/estadisticas',
  authorize('transporte.leer'),
  RutaTransporteController.obtenerEstadisticas
);

/**
 * GET /api/ruta-transporte
 * Listar rutas de transporte
 */
router.get(
  '/',
  authorize('transporte.leer'),
  RutaTransporteController.listar
);

/**
 * POST /api/ruta-transporte
 * Crear ruta de transporte
 */
router.post(
  '/',
  authorize('transporte.crear'),
  logActivity('crear', 'transporte'),
  RutaTransporteController.crear
);

/**
 * GET /api/ruta-transporte/:id
 * Obtener ruta por ID
 */
router.get(
  '/:id',
  authorize('transporte.leer'),
  RutaTransporteController.obtenerPorId
);

/**
 * PUT /api/ruta-transporte/:id
 * Actualizar ruta de transporte
 */
router.put(
  '/:id',
  authorize('transporte.actualizar'),
  logActivity('actualizar', 'transporte'),
  RutaTransporteController.actualizar
);

/**
 * DELETE /api/ruta-transporte/:id
 * Eliminar ruta de transporte (soft delete)
 */
router.delete(
  '/:id',
  authorize('transporte.eliminar'),
  logActivity('eliminar', 'transporte'),
  RutaTransporteController.eliminar
);

// ==========================================
// RUTAS DE GESTIÓN DE PARADAS
// ==========================================

/**
 * GET /api/ruta-transporte/:id/paradas
 * Listar paradas de una ruta
 */
router.get(
  '/:id/paradas',
  authorize('transporte.leer'),
  RutaTransporteController.listarParadas
);

/**
 * POST /api/ruta-transporte/:id/paradas
 * Crear parada en una ruta
 */
router.post(
  '/:id/paradas',
  authorize('transporte.crear'),
  logActivity('crear', 'transporte'),
  RutaTransporteController.crearParada
);

/**
 * PUT /api/ruta-transporte/:id/paradas/reordenar
 * Reordenar paradas de una ruta
 */
router.put(
  '/:id/paradas/reordenar',
  authorize('transporte.actualizar'),
  logActivity('reordenar_paradas', 'transporte'),
  RutaTransporteController.reordenarParadas
);

/**
 * PUT /api/ruta-transporte/:id/paradas/:parada_id
 * Actualizar parada
 */
router.put(
  '/:id/paradas/:parada_id',
  authorize('transporte.actualizar'),
  logActivity('actualizar', 'transporte'),
  RutaTransporteController.actualizarParada
);

/**
 * DELETE /api/ruta-transporte/:id/paradas/:parada_id
 * Eliminar parada
 */
router.delete(
  '/:id/paradas/:parada_id',
  authorize('transporte.eliminar'),
  logActivity('eliminar', 'transporte'),
  RutaTransporteController.eliminarParada
);

export default router;